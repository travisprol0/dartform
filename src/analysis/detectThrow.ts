import type {
  PoseLandmark,
  TrackedPoseLandmarks,
} from './throwingArm';
import { dist3d } from './geometry';

/** Normalized image-space wrist speed (units per second). */
export const THROW_SPEED_THRESHOLD = 0.35;

/** Reject throw events whose peak speed is below this. */
export const MIN_PEAK_SPEED = 1.6;

/** Wrist must travel at least this far from throw start to peak. */
export const MIN_THROW_DISPLACEMENT = 0.07;

/** World-space wrist travel (meters) can satisfy displacement when image travel is small. */
export const MIN_WORLD_DISPLACEMENT = 0.08;

/** Elbow must extend by at least this many degrees during the motion. */
export const MIN_ELBOW_EXTENSION_DEG = 3;

/** Strong flexion indicates cocking/repositioning, not a release. */
export const MAX_COCKING_FLEXION_DEG = -20;

/** Ignore new throws for this long after a detection. */
export const THROW_LOCKOUT_MS = 1000;

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
const MOTION_SETTLE_FRAMES = 8;
const ARM_RAISE_UPWARD_MIN = 0.08;
const ARM_RAISE_SPEED_MAX = 3;
export const BASELINE_LOOKBACK_MS = 300;

export type PendingPeak = {
  speed: number;
  timestamp: number;
  wrist: { x: number; y: number };
};

export type DecelerationOutcome =
  | { type: 'missing_peak' }
  | { type: 'rejected' }
  | {
      type: 'accepted';
      peakIndex: number;
      peakSpeed: number;
      peakTimestamp: number;
    };

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

export type PendingThrow = {
  peakTimestamp: number;
  peakSpeed: number;
};

export function sampleElbowAngle(sample: PoseSample): number {
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

export function sampleAtOrBefore(
  buffer: PoseSample[],
  targetTime: number,
): PoseSample | null {
  let match: PoseSample | null = null;
  for (const buffered of buffer) {
    if (buffered.timestamp <= targetTime) {
      match = buffered;
    }
  }
  return match;
}

export function resolveThrowPeakIndex(
  buffer: PoseSample[],
  peakTimestamp: number,
): number {
  let peakIndex = buffer.findIndex(
    (bufferedSample) => bufferedSample.timestamp === peakTimestamp,
  );
  if (peakIndex < 0 && buffer.length > 0) {
    peakIndex = buffer.reduce((nearest, sample, index) => {
      const nearestDelta = Math.abs(
        buffer[nearest].timestamp - peakTimestamp,
      );
      const currentDelta = Math.abs(sample.timestamp - peakTimestamp);
      return currentDelta < nearestDelta ? index : nearest;
    }, 0);
  }
  return peakIndex;
}

export function resolvePendingThrow(
  buffer: PoseSample[],
  pending: PendingThrow | null,
  now: number,
): ThrowEvent | null {
  if (!pending || now - pending.peakTimestamp < TRACE_AFTER_MS) {
    return null;
  }

  const peakIndex = resolveThrowPeakIndex(buffer, pending.peakTimestamp);
  if (peakIndex < 0) {
    return null;
  }

  return {
    peakIndex,
    peakSpeed: pending.peakSpeed,
    timestamp: pending.peakTimestamp,
  };
}

export function evaluateThrowCandidate(params: {
  peakSpeed: number;
  displacement: number;
  elbowExtension: number;
  wristDx?: number;
  wristDy?: number;
  worldDisplacement?: number;
}): string | null {
  if (params.peakSpeed < MIN_PEAK_SPEED) {
    return 'peak_speed';
  }
  if (
    params.displacement < MIN_THROW_DISPLACEMENT &&
    (params.worldDisplacement === undefined ||
      params.worldDisplacement < MIN_WORLD_DISPLACEMENT)
  ) {
    return 'displacement';
  }
  if (params.elbowExtension < MAX_COCKING_FLEXION_DEG) {
    return 'cocking_flexion';
  }
  if (params.elbowExtension < MIN_ELBOW_EXTENSION_DEG) {
    return 'elbow_extension';
  }
  if (
    params.wristDx !== undefined &&
    params.wristDy !== undefined &&
    params.peakSpeed < ARM_RAISE_SPEED_MAX
  ) {
    const upward = -params.wristDy;
    if (upward >= ARM_RAISE_UPWARD_MIN && upward > Math.abs(params.wristDx)) {
      return 'arm_raise';
    }
  }
  return null;
}

export function findNearestTracePeakIndex(
  samples: PoseSample[],
  peakTime: number,
): number {
  let newPeakIndex = samples.findIndex(
    (sample) => sample.timestamp === peakTime,
  );
  if (newPeakIndex < 0) {
    newPeakIndex = samples.reduce((best, sample, index) => {
      const bestDelta = Math.abs(samples[best].timestamp - peakTime);
      const currentDelta = Math.abs(sample.timestamp - peakTime);
      return currentDelta < bestDelta ? index : best;
    }, 0);
  }
  return newPeakIndex;
}

export function evaluateDecelerationThrow(params: {
  buffer: PoseSample[];
  pendingPeak: PendingPeak;
  throwBaselineWrist: { x: number; y: number } | null;
  throwBaselineElbowAngle: number | null;
}): DecelerationOutcome {
  const peakIndex = resolveThrowPeakIndex(
    params.buffer,
    params.pendingPeak.timestamp,
  );
  if (peakIndex < 0) {
    // #region agent log
    fetch('http://127.0.0.1:7778/ingest/243a2c52-e675-4a00-ac2e-6c44421b6c3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9fcd96'},body:JSON.stringify({sessionId:'9fcd96',runId:'missed-throws',hypothesisId:'D',location:'detectThrow.ts:evaluateDecelerationThrow',message:'missing peak frame',data:{peakTimestamp:params.pendingPeak.timestamp,bufferLength:params.buffer.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { type: 'missing_peak' };
  }

  const peakSample = params.buffer[peakIndex];
  const lookbackSample = sampleAtOrBefore(
    params.buffer,
    params.pendingPeak.timestamp - BASELINE_LOOKBACK_MS,
  );
  const baselineWrist = lookbackSample
    ? { x: lookbackSample.wrist.x, y: lookbackSample.wrist.y }
    : params.throwBaselineWrist;
  const peakWrist = lookbackSample
    ? { x: peakSample.wrist.x, y: peakSample.wrist.y }
    : params.pendingPeak.wrist;
  const displacement = baselineWrist
    ? Math.hypot(
        peakWrist.x - baselineWrist.x,
        peakWrist.y - baselineWrist.y,
      )
    : 0;
  const peakElbowAngle = sampleElbowAngle(peakSample);
  const baselineElbowAngle = lookbackSample
    ? sampleElbowAngle(lookbackSample)
    : params.throwBaselineElbowAngle;
  const elbowExtension =
    baselineElbowAngle !== null
      ? peakElbowAngle - baselineElbowAngle
      : 0;

  const wristDx = baselineWrist ? peakWrist.x - baselineWrist.x : 0;
  const wristDy = baselineWrist ? peakWrist.y - baselineWrist.y : 0;
  const worldDisplacement =
    lookbackSample?.world && peakSample.world
      ? dist3d(lookbackSample.world.wrist, peakSample.world.wrist)
      : undefined;
  const rejectReason = evaluateThrowCandidate({
    peakSpeed: params.pendingPeak.speed,
    displacement,
    elbowExtension,
    wristDx,
    wristDy,
    worldDisplacement,
  });

  // #region agent log
  fetch('http://127.0.0.1:7778/ingest/243a2c52-e675-4a00-ac2e-6c44421b6c3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9fcd96'},body:JSON.stringify({sessionId:'9fcd96',runId:'missed-throws',hypothesisId:rejectReason==='peak_speed'?'A':rejectReason==='arm_raise'?'B':rejectReason?'C':'E',location:'detectThrow.ts:evaluateDecelerationThrow',message:'candidate evaluated',data:{peakIndex,peakSpeed:params.pendingPeak.speed,minPeak:MIN_PEAK_SPEED,displacement,elbowExtension,wristDx,wristDy,upward: -wristDy,rejectReason,outcome:rejectReason?'rejected':'accepted'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (rejectReason) {
    return { type: 'rejected' };
  }

  return {
    type: 'accepted',
    peakIndex,
    peakSpeed: params.pendingPeak.speed,
    peakTimestamp: peakSample.timestamp,
  };
}

export class ThrowDetector {
  private buffer: PoseSample[] = [];

  private wristHistory: { x: number; y: number }[] = [];

  private previousSmoothedWrist: { x: number; y: number } | null = null;

  private previousSampleAt: number | null = null;

  private lastThrowAt = 0;

  private wasAboveThreshold = false;

  private pendingPeak: {
    speed: number;
    timestamp: number;
    wrist: { x: number; y: number };
  } | null = null;

  private pendingThrow: PendingThrow | null = null;

  private armed = true;

  private throwBaselineWrist: { x: number; y: number } | null = null;

  private throwBaselineElbowAngle: number | null = null;

  private currentWristSpeed = 0;

  private primed = false;

  private quietFrames = 0;

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
    this.quietFrames = 0;
  }

  private finalizePendingThrow(now: number): ThrowEvent | null {
    const finalized = resolvePendingThrow(this.buffer, this.pendingThrow, now);
    if (finalized) {
      this.pendingThrow = null;
    }
    return finalized;
  }

  advance(now: number): ThrowEvent | null {
    return this.finalizePendingThrow(now);
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

    this.buffer.push(sample);
    if (this.buffer.length > BUFFER_SIZE) {
      this.buffer.shift();
    }
    if (this.getRecentContinuousDurationMs() >= MIN_READY_BUFFER_MS) {
      this.primed = true;
    }

    const previousWrist = this.previousSmoothedWrist;
    const previousSampleAt = this.previousSampleAt;
    this.previousSmoothedWrist = smoothedWrist;
    this.previousSampleAt = sample.timestamp;

    if (!previousWrist || previousSampleAt === null) {
      this.currentWristSpeed = 0;
      return null;
    }

    const now = sample.timestamp;
    const gapMs = now - previousSampleAt;
    const dt = gapMs / 1000;
    let speed = 0;
    if (dt > 0 && gapMs <= MAX_SAMPLE_GAP_MS) {
      const dx = smoothedWrist.x - previousWrist.x;
      const dy = smoothedWrist.y - previousWrist.y;
      speed = Math.sqrt(dx * dx + dy * dy) / dt;
    }
    this.currentWristSpeed = speed;

    const finalizedThrow = this.finalizePendingThrow(now);
    if (finalizedThrow) {
      return finalizedThrow;
    }

    if (!detectionEnabled) {
      if (speed >= THROW_SPEED_THRESHOLD) {
        // #region agent log
        fetch('http://127.0.0.1:7778/ingest/243a2c52-e675-4a00-ac2e-6c44421b6c3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9fcd96'},body:JSON.stringify({sessionId:'9fcd96',runId:'missed-throws',hypothesisId:'D',location:'detectThrow.ts:addSample',message:'motion while detection disabled',data:{speed},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      }
      this.resetMotionCandidate();
      return null;
    }

    if (this.pendingThrow) {
      return null;
    }

    if (now - this.lastThrowAt < THROW_LOCKOUT_MS) {
      if (speed >= MIN_PEAK_SPEED) {
        // #region agent log
        fetch('http://127.0.0.1:7778/ingest/243a2c52-e675-4a00-ac2e-6c44421b6c3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9fcd96'},body:JSON.stringify({sessionId:'9fcd96',runId:'missed-throws',hypothesisId:'D',location:'detectThrow.ts:addSample',message:'throw-speed motion during lockout',data:{speed,msSinceLastThrow:now-this.lastThrowAt,lockoutMs:THROW_LOCKOUT_MS},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      }
      return null;
    }

    if (!this.armed) {
      this.armed = true;
    }

    if (dt <= 0 || gapMs > MAX_SAMPLE_GAP_MS) {
      this.resetMotionCandidate();
      this.wristHistory = [sample.wrist];
      this.previousSmoothedWrist = {
        x: sample.wrist.x,
        y: sample.wrist.y,
      };
      return null;
    }

    if (speed >= THROW_SPEED_THRESHOLD) {
      if (!this.wasAboveThreshold) {
        this.throwBaselineWrist = smoothedWrist;
        this.throwBaselineElbowAngle = sampleElbowAngle(smoothedSample);
      }
      this.quietFrames = 0;
      if (!this.pendingPeak || speed > this.pendingPeak.speed) {
        this.pendingPeak = {
          speed,
          timestamp: smoothedSample.timestamp,
          wrist: smoothedWrist,
        };
      }
      this.wasAboveThreshold = true;
      return null;
    }

    if (this.wasAboveThreshold && this.pendingPeak) {
      this.quietFrames += 1;
      if (this.quietFrames < MOTION_SETTLE_FRAMES) {
        return null;
      }
      this.wasAboveThreshold = false;
      this.quietFrames = 0;

      const outcome = evaluateDecelerationThrow({
        buffer: this.buffer,
        pendingPeak: this.pendingPeak,
        throwBaselineWrist: this.throwBaselineWrist,
        throwBaselineElbowAngle: this.throwBaselineElbowAngle,
      });
      this.pendingPeak = null;
      this.throwBaselineWrist = null;
      this.throwBaselineElbowAngle = null;

      if (outcome.type !== 'accepted') {
        return null;
      }

      this.lastThrowAt = outcome.peakTimestamp;
      this.pendingThrow = {
        peakTimestamp: outcome.peakTimestamp,
        peakSpeed: outcome.peakSpeed,
      };
      this.armed = false;
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

  getRecentContinuousDurationMs(): number {
    if (this.buffer.length < 2) {
      return 0;
    }
    const lastIndex = this.buffer.length - 1;
    let startIndex = lastIndex;
    for (let index = lastIndex; index > 0; index--) {
      const gap =
        this.buffer[index].timestamp - this.buffer[index - 1].timestamp;
      if (gap > MAX_SAMPLE_GAP_MS || gap <= 0) {
        break;
      }
      startIndex = index - 1;
    }
    return (
      this.buffer[lastIndex].timestamp -
      this.buffer[startIndex].timestamp
    );
  }

  isCollectingPostRoll(): boolean {
    return this.pendingThrow !== null;
  }

  isArmed(): boolean {
    return this.armed;
  }

  isPrimed(): boolean {
    return this.primed;
  }

  reset(): void {
    this.buffer = [];
    this.wristHistory = [];
    this.previousSmoothedWrist = null;
    this.previousSampleAt = null;
    this.lastThrowAt = 0;
    this.wasAboveThreshold = false;
    this.pendingPeak = null;
    this.pendingThrow = null;
    this.armed = true;
    this.throwBaselineWrist = null;
    this.throwBaselineElbowAngle = null;
    this.currentWristSpeed = 0;
    this.primed = false;
    this.quietFrames = 0;
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

  return {
    samples,
    peakIndex: findNearestTracePeakIndex(samples, peakTime),
  };
}
