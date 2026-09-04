import type {
  PoseLandmark,
  TrackedPoseLandmarks,
} from './throwingArm';
import { dist3d, elbowAngle3d } from './geometry';

/**
 * Throw detection uses MediaPipe world landmarks (meters) so speed and
 * travel do not depend on how large the thrower is in the image, or whether
 * the dart moves toward the camera. Image x/y is a scaled fallback only.
 */

/** Typical adult forearm; used to convert 2D image speed into meters/second. */
export const CANONICAL_FOREARM_LENGTH_M = 0.25;

/** Wrist speed that starts a throw candidate (meters/second). */
export const THROW_SPEED_THRESHOLD = 0.4;

/** Snap / no-shape throws still need this peak (meters/second). */
export const MIN_PEAK_SPEED = 1.4;

/** Wrist must travel at least this far from throw start to peak (meters). */
export const MIN_THROW_DISPLACEMENT = 0.08;

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

/**
 * Minimum backswing (cock) before release, in degrees of elbow flexion.
 * Uses the thrower's own elbow, so it is not tied to a side-on camera.
 */
export const MIN_BACKSWING_FLEXION_DEG = 8;

/**
 * Cock-then-extend still needs a real stroke. Slow uncocking is ~0.5 m/s.
 */
export const THROW_SHAPE_MIN_PEAK_SPEED = 0.8;

/**
 * Already-cocked snap throw, in forearm-lengths per second.
 */
export const SNAP_THROW_NORMALIZED_SPEED = 8;

const SHAPE_LOOKBACK_MS = 1000;
const WRIST_SMOOTHING_FRAMES = 3;
const MAX_SAMPLE_GAP_MS = 200;
const MOTION_SETTLE_FRAMES = 8;
export const BASELINE_LOOKBACK_MS = 300;

export type WristPoint = {
  x: number;
  y: number;
  z: number;
};

export type PendingPeak = {
  speed: number;
  timestamp: number;
  wrist: WristPoint;
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

function imageForearmLength(sample: PoseSample): number {
  return Math.max(
    Math.hypot(
      sample.wrist.x - sample.elbow.x,
      sample.wrist.y - sample.elbow.y,
    ),
    1e-6,
  );
}

function worldForearmLength(sample: PoseSample): number {
  if (!sample.world) {
    return CANONICAL_FOREARM_LENGTH_M;
  }
  return Math.max(
    dist3d(sample.world.wrist, sample.world.elbow),
    1e-6,
  );
}

function scaledImageSpeed(imageSpeed: number, sample: PoseSample): number {
  return (
    (imageSpeed / imageForearmLength(sample)) * CANONICAL_FOREARM_LENGTH_M
  );
}

function scaledImageTravel(
  from: { x: number; y: number },
  to: { x: number; y: number },
  sample: PoseSample,
): number {
  const image = Math.hypot(to.x - from.x, to.y - from.y);
  return (image / imageForearmLength(sample)) * CANONICAL_FOREARM_LENGTH_M;
}

function worldWrist(sample: PoseSample): WristPoint | null {
  if (!sample.world) {
    return null;
  }
  return {
    x: sample.world.wrist.x,
    y: sample.world.wrist.y,
    z: sample.world.wrist.z,
  };
}

export function sampleElbowAngle(sample: PoseSample): number {
  if (sample.world) {
    return elbowAngle3d(
      sample.world.shoulder,
      sample.world.elbow,
      sample.world.wrist,
    );
  }
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

export function wristSpeedMeters(
  previous: PoseSample,
  next: PoseSample,
): number {
  const dt = (next.timestamp - previous.timestamp) / 1000;
  if (dt <= 0) {
    return 0;
  }
  const previousWorld = worldWrist(previous);
  const nextWorld = worldWrist(next);
  if (previousWorld && nextWorld) {
    return dist3d(previousWorld, nextWorld) / dt;
  }
  const imageSpeed =
    Math.hypot(
      next.wrist.x - previous.wrist.x,
      next.wrist.y - previous.wrist.y,
    ) / dt;
  return scaledImageSpeed(imageSpeed, next);
}

export function wristTravelMeters(
  from: PoseSample,
  to: PoseSample,
): number {
  const fromWorld = worldWrist(from);
  const toWorld = worldWrist(to);
  if (fromWorld && toWorld) {
    return dist3d(fromWorld, toWorld);
  }
  return scaledImageTravel(from.wrist, to.wrist, to);
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
  backswingFlexion?: number;
  forearmNormalizedSpeed?: number;
}): string | null {
  if (params.peakSpeed < THROW_SPEED_THRESHOLD) {
    return 'peak_speed';
  }
  if (params.elbowExtension < MAX_COCKING_FLEXION_DEG) {
    return 'cocking_flexion';
  }
  if (params.elbowExtension < MIN_ELBOW_EXTENSION_DEG) {
    return 'elbow_extension';
  }
  const throwShape =
    (params.backswingFlexion ?? 0) >= MIN_BACKSWING_FLEXION_DEG &&
    params.elbowExtension >= MIN_ELBOW_EXTENSION_DEG;
  if (
    !throwShape &&
    (params.forearmNormalizedSpeed ?? 0) < SNAP_THROW_NORMALIZED_SPEED
  ) {
    return params.peakSpeed < MIN_PEAK_SPEED
      ? 'peak_speed'
      : 'no_throw_shape';
  }
  if (throwShape && params.peakSpeed < THROW_SHAPE_MIN_PEAK_SPEED) {
    return 'peak_speed';
  }
  if (params.displacement < MIN_THROW_DISPLACEMENT) {
    return 'displacement';
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

function measureThrowShape(
  buffer: PoseSample[],
  peakIndex: number,
): { backswingFlexion: number; forwardExtension: number } {
  const peakTime = buffer[peakIndex].timestamp;
  let startIndex = peakIndex;
  while (
    startIndex > 0 &&
    peakTime - buffer[startIndex - 1].timestamp <= SHAPE_LOOKBACK_MS
  ) {
    startIndex -= 1;
  }
  let minElbow = Infinity;
  for (let index = startIndex; index <= peakIndex; index++) {
    minElbow = Math.min(minElbow, sampleElbowAngle(buffer[index]));
  }
  const startElbow = sampleElbowAngle(buffer[startIndex]);
  const peakElbow = sampleElbowAngle(buffer[peakIndex]);
  return {
    backswingFlexion: startElbow - minElbow,
    forwardExtension: peakElbow - minElbow,
  };
}

function findForwardReleasePeak(
  buffer: PoseSample[],
  cockingPeakIndex: number,
  baselineElbowAngle: number,
): { index: number; speed: number } | null {
  let bestIndex = -1;
  let bestSpeed = 0;
  for (let index = cockingPeakIndex + 1; index < buffer.length; index++) {
    const speed = wristSpeedMeters(buffer[index - 1], buffer[index]);
    const extension =
      sampleElbowAngle(buffer[index]) - baselineElbowAngle;
    if (
      extension >= MIN_ELBOW_EXTENSION_DEG &&
      speed >= THROW_SPEED_THRESHOLD &&
      speed > bestSpeed
    ) {
      bestSpeed = speed;
      bestIndex = index;
    }
  }
  if (bestIndex < 0) {
    return null;
  }
  return { index: bestIndex, speed: bestSpeed };
}

function applySmoothedWrist(
  sample: PoseSample,
  smoothed: WristPoint,
  fromWorld: boolean,
): PoseSample {
  if (fromWorld && sample.world) {
    return {
      ...sample,
      world: {
        ...sample.world,
        wrist: {
          ...sample.world.wrist,
          x: smoothed.x,
          y: smoothed.y,
          z: smoothed.z,
        },
      },
    };
  }
  return {
    ...sample,
    wrist: {
      ...sample.wrist,
      x: smoothed.x,
      y: smoothed.y,
    },
  };
}

export function evaluateDecelerationThrow(params: {
  buffer: PoseSample[];
  pendingPeak: PendingPeak;
  throwBaselineWrist: WristPoint | null;
  throwBaselineElbowAngle: number | null;
  skipCockingRecovery?: boolean;
}): DecelerationOutcome {
  const peakIndex = resolveThrowPeakIndex(
    params.buffer,
    params.pendingPeak.timestamp,
  );
  if (peakIndex < 0) {
    return { type: 'missing_peak' };
  }

  const peakSample = params.buffer[peakIndex];
  const lookbackSample = sampleAtOrBefore(
    params.buffer,
    params.pendingPeak.timestamp - BASELINE_LOOKBACK_MS,
  );
  let displacement = 0;
  if (lookbackSample) {
    displacement = wristTravelMeters(lookbackSample, peakSample);
  } else if (params.throwBaselineWrist) {
    const peakWorld = worldWrist(peakSample);
    if (peakWorld) {
      displacement = dist3d(params.throwBaselineWrist, peakWorld);
    } else {
      displacement = scaledImageTravel(
        params.throwBaselineWrist,
        params.pendingPeak.wrist,
        peakSample,
      );
    }
  }
  const peakElbowAngle = sampleElbowAngle(peakSample);
  const baselineElbowAngle = lookbackSample
    ? sampleElbowAngle(lookbackSample)
    : params.throwBaselineElbowAngle;
  const elbowExtension =
    baselineElbowAngle !== null
      ? peakElbowAngle - baselineElbowAngle
      : 0;
  const shape = measureThrowShape(params.buffer, peakIndex);
  const forearmNormalizedSpeed =
    params.pendingPeak.speed / worldForearmLength(peakSample);

  const rejectReason = evaluateThrowCandidate({
    peakSpeed: params.pendingPeak.speed,
    displacement,
    elbowExtension,
    backswingFlexion: shape.backswingFlexion,
    forearmNormalizedSpeed,
  });

  if (
    (rejectReason === 'cocking_flexion' ||
      rejectReason === 'elbow_extension') &&
    !params.skipCockingRecovery &&
    baselineElbowAngle !== null
  ) {
    const release = findForwardReleasePeak(
      params.buffer,
      peakIndex,
      baselineElbowAngle,
    );
    if (release) {
      const releaseSample = params.buffer[release.index];
      const releaseWrist = worldWrist(releaseSample) ?? {
        x: releaseSample.wrist.x,
        y: releaseSample.wrist.y,
        z: 0,
      };
      return evaluateDecelerationThrow({
        buffer: params.buffer,
        pendingPeak: {
          speed: release.speed,
          timestamp: releaseSample.timestamp,
          wrist: releaseWrist,
        },
        throwBaselineWrist: params.throwBaselineWrist,
        throwBaselineElbowAngle: params.throwBaselineElbowAngle,
        skipCockingRecovery: true,
      });
    }
  }

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

  private wristHistory: WristPoint[] = [];

  private previousSmoothedWrist: WristPoint | null = null;

  private previousHadWorld = false;

  private previousSample: PoseSample | null = null;

  private previousSampleAt: number | null = null;

  private lastThrowAt = 0;

  private wasAboveThreshold = false;

  private pendingPeak: PendingPeak | null = null;

  private pendingThrow: PendingThrow | null = null;

  private armed = true;

  private throwBaselineWrist: WristPoint | null = null;

  private throwBaselineElbowAngle: number | null = null;

  private currentWristSpeed = 0;

  private primed = false;

  private quietFrames = 0;

  private smoothWrist(wrist: WristPoint): WristPoint {
    this.wristHistory.push(wrist);
    if (this.wristHistory.length > WRIST_SMOOTHING_FRAMES) {
      this.wristHistory.shift();
    }

    const total = this.wristHistory.reduce(
      (acc, point) => ({
        x: acc.x + point.x,
        y: acc.y + point.y,
        z: acc.z + point.z,
      }),
      { x: 0, y: 0, z: 0 },
    );
    const count = this.wristHistory.length;

    return {
      x: total.x / count,
      y: total.y / count,
      z: total.z / count,
    };
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
      this.armed = true;
    }
    return finalized;
  }

  advance(now: number): ThrowEvent | null {
    return this.finalizePendingThrow(now);
  }

  addSample(sample: PoseSample, detectionEnabled = true): ThrowEvent | null {
    const hasWorld = sample.world !== undefined;
    const rawWrist = worldWrist(sample) ?? {
      x: sample.wrist.x,
      y: sample.wrist.y,
      z: 0,
    };
    if (
      this.wristHistory.length > 0 &&
      hasWorld !== this.previousHadWorld
    ) {
      this.wristHistory = [];
    }
    const smoothedWrist = this.smoothWrist(rawWrist);
    const smoothedSample = applySmoothedWrist(
      sample,
      smoothedWrist,
      hasWorld,
    );

    this.buffer.push(sample);
    if (this.buffer.length > BUFFER_SIZE) {
      this.buffer.shift();
    }
    if (this.getRecentContinuousDurationMs() >= MIN_READY_BUFFER_MS) {
      this.primed = true;
    }

    const previousWrist = this.previousSmoothedWrist;
    const previousSample = this.previousSample;
    const previousHadWorld = this.previousHadWorld;
    const previousSampleAt = this.previousSampleAt;
    this.previousSmoothedWrist = smoothedWrist;
    this.previousSample = sample;
    this.previousHadWorld = hasWorld;
    this.previousSampleAt = sample.timestamp;

    if (
      !previousWrist ||
      previousSample === null ||
      previousSampleAt === null
    ) {
      this.currentWristSpeed = 0;
      return null;
    }

    const now = sample.timestamp;
    const gapMs = now - previousSampleAt;
    const dt = gapMs / 1000;
    let speed = 0;
    if (dt > 0 && gapMs <= MAX_SAMPLE_GAP_MS) {
      if (hasWorld && previousHadWorld) {
        speed = dist3d(previousWrist, smoothedWrist) / dt;
      } else {
        const imageSpeed =
          Math.hypot(
            sample.wrist.x - previousSample.wrist.x,
            sample.wrist.y - previousSample.wrist.y,
          ) / dt;
        speed = scaledImageSpeed(imageSpeed, sample);
      }
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
      this.wristHistory = [rawWrist];
      this.previousSmoothedWrist = rawWrist;
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

  getPendingPeakTimestamp(): number | null {
    return this.pendingThrow?.peakTimestamp ?? null;
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
    this.previousHadWorld = false;
    this.previousSample = null;
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
