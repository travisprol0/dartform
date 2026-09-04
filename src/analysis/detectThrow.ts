import type {
  PoseLandmark,
  TrackedPoseLandmarks,
} from './throwingArm';

/** Normalized image-space wrist speed (units per second). */
export const THROW_SPEED_THRESHOLD = 0.35;

/** Reject throw events whose peak speed is below this. */
export const MIN_PEAK_SPEED = 0.35;

/** Wrist must travel at least this far from throw start to peak. */
export const MIN_THROW_DISPLACEMENT = 0.15;

/** Elbow must extend by at least this many degrees during the motion. */
export const MIN_ELBOW_EXTENSION_DEG = 8;

/** Strong flexion indicates cocking/repositioning, not a release. */
export const MAX_COCKING_FLEXION_DEG = -20;

/** Ignore new throws for this long after a detection. */
export const THROW_LOCKOUT_MS = 1800;

/** Ring buffer size (~6 s at ~30 fps). */
export const BUFFER_SIZE = 180;

/** Snapshot window before peak when extracting a throw trace. */
export const TRACE_BEFORE_MS = 1500;

/** Snapshot window after peak when extracting a throw trace. */
export const TRACE_AFTER_MS = 800;

/** Prime this much history before declaring the detector ready. */
export const MIN_READY_BUFFER_MS = TRACE_BEFORE_MS;

export type ThrowTrace = {
  samples: PoseSample[];
  peakIndex: number;
};

const WRIST_SMOOTHING_FRAMES = 3;
const MAX_SAMPLE_GAP_MS = 200;

export type PoseSample = {
  timestamp: number;
  wrist: PoseLandmark;
  elbow: PoseLandmark;
  shoulder: PoseLandmark;
  oppositeShoulder?: PoseLandmark;
  nose?: PoseLandmark;
  leftHip?: PoseLandmark;
  rightHip?: PoseLandmark;
  index?: PoseLandmark;
  pinky?: PoseLandmark;
  thumb?: PoseLandmark;
  world?: TrackedPoseLandmarks;
  /** Mean visibility of the throwing shoulder, elbow, and wrist. */
  visibility: number;
};

export type ThrowEvent = {
  peakIndex: number;
  peakSpeed: number;
  timestamp: number;
};

type PendingThrow = {
  peakTimestamp: number;
  peakSpeed: number;
};

function sampleElbowAngle(sample: PoseSample): number {
  const { shoulder, elbow, wrist } = sample;
  const ux = shoulder.x - elbow.x;
  const uy = shoulder.y - elbow.y;
  const vx = wrist.x - elbow.x;
  const vy = wrist.y - elbow.y;
  const dot = ux * vx + uy * vy;
  const magU = Math.sqrt(ux * ux + uy * uy);
  const magV = Math.sqrt(vx * vx + vy * vy);
  if (magU === 0 || magV === 0) {
    return 0;
  }
  const cos = Math.max(-1, Math.min(1, dot / (magU * magV)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export class ThrowDetector {
  private buffer: PoseSample[] = [];

  private wristHistory: { x: number; y: number }[] = [];

  private lastThrowAt = 0;

  private wasAboveThreshold = false;

  private pendingPeak: { speed: number; timestamp: number } | null = null;

  private pendingThrow: PendingThrow | null = null;

  private throwBaselineWrist: { x: number; y: number } | null = null;

  private throwBaselineElbowAngle: number | null = null;

  private currentWristSpeed = 0;

  private smoothWrist(wrist: { x: number; y: number }): { x: number; y: number } {
    this.wristHistory.push(wrist);
    if (this.wristHistory.length > WRIST_SMOOTHING_FRAMES) {
      this.wristHistory.shift();
    }

    const total = this.wristHistory.reduce(
      (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
      { x: 0, y: 0 },
    );
    const count = this.wristHistory.length;

    return { x: total.x / count, y: total.y / count };
  }

  getCurrentWristSpeed(): number {
    return this.currentWristSpeed;
  }

  private resetMotionCandidate(): void {
    this.wasAboveThreshold = false;
    this.pendingPeak = null;
    this.throwBaselineWrist = null;
    this.throwBaselineElbowAngle = null;
  }

  private finalizePendingThrow(now: number): ThrowEvent | null {
    if (
      !this.pendingThrow ||
      now - this.pendingThrow.peakTimestamp < TRACE_AFTER_MS
    ) {
      return null;
    }

    const { peakTimestamp, peakSpeed } = this.pendingThrow;
    this.pendingThrow = null;

    const peakIndex = this.buffer.findIndex(
      (bufferedSample) => bufferedSample.timestamp === peakTimestamp,
    );
    if (peakIndex < 0) {
      return null;
    }

    return {
      peakIndex,
      peakSpeed,
      timestamp: peakTimestamp,
    };
  }

  addSample(sample: PoseSample, detectionEnabled = true): ThrowEvent | null {
    const smoothedWrist = this.smoothWrist(sample.wrist);
    const smoothedSample: PoseSample = {
      ...sample,
      wrist: {
        ...sample.wrist,
        x: smoothedWrist.x,
        y: smoothedWrist.y,
      },
    };

    this.buffer.push(smoothedSample);
    if (this.buffer.length > BUFFER_SIZE) {
      this.buffer.shift();
    }

    if (this.buffer.length < 2) {
      this.currentWristSpeed = 0;
      return null;
    }

    const now = sample.timestamp;
    const prev = this.buffer[this.buffer.length - 2];
    const gapMs = now - prev.timestamp;
    const dt = gapMs / 1000;
    let speed = 0;
    if (dt > 0 && gapMs <= MAX_SAMPLE_GAP_MS) {
      const dx = smoothedWrist.x - prev.wrist.x;
      const dy = smoothedWrist.y - prev.wrist.y;
      speed = Math.sqrt(dx * dx + dy * dy) / dt;
    }
    this.currentWristSpeed = speed;

    const finalizedThrow = this.finalizePendingThrow(now);
    if (finalizedThrow) {
      return finalizedThrow;
    }

    if (!detectionEnabled) {
      this.resetMotionCandidate();
      return null;
    }

    if (this.pendingThrow) {
      return null;
    }

    if (now - this.lastThrowAt < THROW_LOCKOUT_MS) {
      return null;
    }

    if (dt <= 0 || gapMs > MAX_SAMPLE_GAP_MS) {
      this.resetMotionCandidate();
      return null;
    }

    if (speed >= THROW_SPEED_THRESHOLD) {
      if (!this.wasAboveThreshold) {
        this.throwBaselineWrist = smoothedWrist;
        this.throwBaselineElbowAngle = sampleElbowAngle(smoothedSample);
      }
      if (!this.pendingPeak || speed > this.pendingPeak.speed) {
        this.pendingPeak = { speed, timestamp: smoothedSample.timestamp };
      }
      this.wasAboveThreshold = true;
      return null;
    }

    if (this.wasAboveThreshold && this.pendingPeak) {
      this.wasAboveThreshold = false;

      const peakIndex = this.buffer.findIndex(
        (bufferedSample) =>
          bufferedSample.timestamp === this.pendingPeak?.timestamp,
      );
      if (peakIndex < 0) {
        this.resetMotionCandidate();
        return null;
      }
      const peakSample = this.buffer[peakIndex];
      const peakWrist = peakSample.wrist;
      const displacement = this.throwBaselineWrist
        ? Math.hypot(
            peakWrist.x - this.throwBaselineWrist.x,
            peakWrist.y - this.throwBaselineWrist.y,
          )
        : 0;
      const peakElbowAngle = sampleElbowAngle(peakSample);
      const elbowExtension =
        this.throwBaselineElbowAngle !== null
          ? peakElbowAngle - this.throwBaselineElbowAngle
          : 0;

      const peakSpeed = this.pendingPeak.speed;
      this.pendingPeak = null;
      this.throwBaselineWrist = null;
      this.throwBaselineElbowAngle = null;

      let rejectReason: string | null = null;
      if (peakSpeed < MIN_PEAK_SPEED) {
        rejectReason = 'peak_speed';
      } else if (displacement < MIN_THROW_DISPLACEMENT) {
        rejectReason = 'displacement';
      } else if (elbowExtension < MAX_COCKING_FLEXION_DEG) {
        rejectReason = 'cocking_flexion';
      } else if (elbowExtension < MIN_ELBOW_EXTENSION_DEG) {
        rejectReason = 'elbow_extension';
      }

      if (rejectReason) {
        return null;
      }

      this.lastThrowAt = peakSample.timestamp;
      this.pendingThrow = {
        peakTimestamp: peakSample.timestamp,
        peakSpeed,
      };
      return null;
    }

    return null;
  }

  getBuffer(): PoseSample[] {
    return [...this.buffer];
  }

  getBufferedDurationMs(): number {
    if (this.buffer.length < 2) {
      return 0;
    }
    return (
      this.buffer[this.buffer.length - 1].timestamp -
      this.buffer[0].timestamp
    );
  }

  isCollectingPostRoll(): boolean {
    return this.pendingThrow !== null;
  }

  reset(): void {
    this.buffer = [];
    this.wristHistory = [];
    this.lastThrowAt = 0;
    this.wasAboveThreshold = false;
    this.pendingPeak = null;
    this.pendingThrow = null;
    this.throwBaselineWrist = null;
    this.throwBaselineElbowAngle = null;
    this.currentWristSpeed = 0;
  }
}

export function extractThrowTrace(
  buffer: PoseSample[],
  peakIndex: number,
): ThrowTrace {
  const peakTime = buffer[peakIndex]?.timestamp;
  if (peakTime === undefined) {
    return { samples: [], peakIndex: 0 };
  }

  const startTime = peakTime - TRACE_BEFORE_MS;
  const endTime = peakTime + TRACE_AFTER_MS;
  const samples = buffer.filter(
    (sample) => sample.timestamp >= startTime && sample.timestamp <= endTime,
  );

  let newPeakIndex = samples.findIndex((sample) => sample.timestamp === peakTime);
  if (newPeakIndex < 0) {
    newPeakIndex = samples.reduce((best, sample, index) => {
      const bestDelta = Math.abs(samples[best].timestamp - peakTime);
      const currentDelta = Math.abs(sample.timestamp - peakTime);
      return currentDelta < bestDelta ? index : best;
    }, 0);
  }

  return { samples, peakIndex: newPeakIndex };
}
