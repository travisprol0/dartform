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
export const MIN_ELBOW_EXTENSION_DEG = 8;

/** Strong flexion indicates cocking/repositioning, not a release. */
export const MAX_COCKING_FLEXION_DEG = -20;

/** Ignore new throws for this long after a detection. */
export const THROW_LOCKOUT_MS = 600;

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
export const THROW_SHAPE_MIN_PEAK_SPEED = 1.25;

/**
 * Already-cocked snap throw, in forearm-lengths per second.
 */
export const SNAP_THROW_NORMALIZED_SPEED = 8;

/** Later darts in a round must reach this fraction of the last accepted peak. */
export const MIN_RELATIVE_PEAK_RATIO = 0.5;

/** Drop to this fraction of peak speed (while still moving) starts a valley. */
export const VALLEY_SPEED_RATIO = 0.45;

/** Ignore intra-stroke dips; a second throw is slower than a cock-to-release. */
export const MIN_VALLEY_SEPARATION_MS = 180;

/** Brief quiet below the speed bar, then a rise, ends the prior throw. */
export const MIN_RESUME_QUIET_MS = 50;

/** Vertical-only reaches this far, with little forward travel, is a raise. */
export const ARM_RAISE_UPWARD_MIN_M = 0.08;

/** Forward/depth travel below this, with a raise, is not a release. */
export const ARM_RAISE_FORWARD_MAX_M = 0.07;

/** Fast raises can still be throws; slower vertical motion is a reach. */
export const ARM_RAISE_SPEED_MAX = 3;

/** Hip midpoint travel that indicates walking to the board. */
export const MIN_HIP_TRAVEL_M = 0.18;

const SHAPE_LOOKBACK_MS = 1000;
const WRIST_SMOOTHING_FRAMES = 3;
/** Floor for a dropped-frame gap; slower phones can raise this via recent dt. */
export const BASE_MAX_SAMPLE_GAP_MS = 200;
const SAMPLE_GAP_MEDIAN_WINDOW = 8;
const SAMPLE_GAP_MULTIPLIER = 2.5;
const MAX_RECORDED_GAP_MS = 2000;
/** Quiet time after peak speed before validating the throw (not frame-count). */
export const MOTION_SETTLE_MS = 200;
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

/**
 * +1 if sample Y increases toward the head (world Y-up), -1 if Y increases
 * toward the feet (image / BlazePose Y-down). Used so "upward" is against gravity.
 */
function verticalUpSign(sample: PoseSample): number {
  const hip = hipMidpoint(sample);
  const shoulderY = sample.world?.shoulder?.y ?? sample.shoulder.y;
  if (hip) {
    const direction = Math.sign(shoulderY - hip.y);
    if (direction !== 0) {
      return direction;
    }
  }
  return -1;
}

function signedUpwardDelta(
  fromY: number,
  toY: number,
  sample: PoseSample,
): number {
  return (toY - fromY) * verticalUpSign(sample);
}

export function wristTravelComponents(
  from: PoseSample,
  to: PoseSample,
): { upward: number; forward: number } {
  const fromWorld = worldWrist(from);
  const toWorld = worldWrist(to);
  if (fromWorld && toWorld) {
    return {
      upward: signedUpwardDelta(fromWorld.y, toWorld.y, to),
      forward: Math.hypot(toWorld.x - fromWorld.x, toWorld.z - fromWorld.z),
    };
  }
  const scale = CANONICAL_FOREARM_LENGTH_M / imageForearmLength(to);
  return {
    upward: signedUpwardDelta(from.wrist.y, to.wrist.y, to) * scale,
    forward: Math.abs(to.wrist.x - from.wrist.x) * scale,
  };
}

function hipMidpoint(sample: PoseSample): WristPoint | null {
  if (sample.world?.leftHip && sample.world?.rightHip) {
    return {
      x: (sample.world.leftHip.x + sample.world.rightHip.x) / 2,
      y: (sample.world.leftHip.y + sample.world.rightHip.y) / 2,
      z: (sample.world.leftHip.z + sample.world.rightHip.z) / 2,
    };
  }
  if (sample.leftHip && sample.rightHip) {
    return {
      x: (sample.leftHip.x + sample.rightHip.x) / 2,
      y: (sample.leftHip.y + sample.rightHip.y) / 2,
      z: 0,
    };
  }
  return null;
}

export function hipTravelMeters(
  from: PoseSample,
  to: PoseSample,
): number | null {
  const fromHip = hipMidpoint(from);
  const toHip = hipMidpoint(to);
  if (!fromHip || !toHip) {
    return null;
  }
  if (from.world?.leftHip && to.world?.leftHip) {
    return dist3d(fromHip, toHip);
  }
  return scaledImageTravel(fromHip, toHip, to);
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
  upwardTravel?: number;
  forwardTravel?: number;
  hipTravel?: number;
  previousPeakSpeed?: number;
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
  if (
    params.hipTravel !== undefined &&
    params.hipTravel >= MIN_HIP_TRAVEL_M
  ) {
    return 'hip_travel';
  }
  if (
    params.upwardTravel !== undefined &&
    params.forwardTravel !== undefined &&
    params.upwardTravel >= ARM_RAISE_UPWARD_MIN_M &&
    params.forwardTravel < ARM_RAISE_FORWARD_MAX_M &&
    params.peakSpeed < ARM_RAISE_SPEED_MAX
  ) {
    return 'arm_raise';
  }
  if (
    params.previousPeakSpeed !== undefined &&
    params.previousPeakSpeed > 0 &&
    params.peakSpeed < MIN_RELATIVE_PEAK_RATIO * params.previousPeakSpeed
  ) {
    return 'relative_peak';
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
  previousPeakSpeed?: number;
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
  let upwardTravel = 0;
  let forwardTravel = 0;
  let hipTravel: number | null = null;
  if (lookbackSample) {
    displacement = wristTravelMeters(lookbackSample, peakSample);
    const components = wristTravelComponents(lookbackSample, peakSample);
    upwardTravel = components.upward;
    forwardTravel = components.forward;
    hipTravel = hipTravelMeters(lookbackSample, peakSample);
  } else if (params.throwBaselineWrist) {
    const peakWorld = worldWrist(peakSample);
    if (peakWorld) {
      displacement = dist3d(params.throwBaselineWrist, peakWorld);
      upwardTravel = signedUpwardDelta(
        params.throwBaselineWrist.y,
        peakWorld.y,
        peakSample,
      );
      forwardTravel = Math.hypot(
        peakWorld.x - params.throwBaselineWrist.x,
        peakWorld.z - params.throwBaselineWrist.z,
      );
    } else {
      displacement = scaledImageTravel(
        params.throwBaselineWrist,
        params.pendingPeak.wrist,
        peakSample,
      );
      const scale = CANONICAL_FOREARM_LENGTH_M / imageForearmLength(peakSample);
      upwardTravel =
        signedUpwardDelta(
          params.throwBaselineWrist.y,
          params.pendingPeak.wrist.y,
          peakSample,
        ) * scale;
      forwardTravel =
        Math.abs(params.pendingPeak.wrist.x - params.throwBaselineWrist.x) *
        scale;
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
    upwardTravel,
    forwardTravel,
    hipTravel: hipTravel ?? undefined,
    previousPeakSpeed: params.previousPeakSpeed,
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
        previousPeakSpeed: params.previousPeakSpeed,
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

  private lastAcceptedPeakSpeed = 0;

  private wasAboveThreshold = false;

  private pendingPeak: PendingPeak | null = null;

  private pendingThrow: PendingThrow | null = null;

  private armed = true;

  private throwBaselineWrist: WristPoint | null = null;

  private throwBaselineElbowAngle: number | null = null;

  private currentWristSpeed = 0;

  private primed = false;

  private quietSince: number | null = null;

  private sawValley = false;

  private recentGaps: number[] = [];

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
    this.quietSince = null;
    this.sawValley = false;
  }

  private acceptThrow(outcome: {
    peakTimestamp: number;
    peakSpeed: number;
  }): void {
    this.lastThrowAt = outcome.peakTimestamp;
    this.lastAcceptedPeakSpeed = outcome.peakSpeed;
    this.pendingThrow = {
      peakTimestamp: outcome.peakTimestamp,
      peakSpeed: outcome.peakSpeed,
    };
    this.armed = false;
    this.resetMotionCandidate();
  }

  private considerPendingPeak(detectionEnabled: boolean): boolean {
    if (!detectionEnabled || !this.pendingPeak) {
      return false;
    }
    const outcome = evaluateDecelerationThrow({
      buffer: this.buffer,
      pendingPeak: this.pendingPeak,
      throwBaselineWrist: this.throwBaselineWrist,
      throwBaselineElbowAngle: this.throwBaselineElbowAngle,
      previousPeakSpeed: this.lastAcceptedPeakSpeed,
    });
    this.pendingPeak = null;
    this.throwBaselineWrist = null;
    this.throwBaselineElbowAngle = null;
    this.quietSince = null;
    this.sawValley = false;
    this.wasAboveThreshold = false;
    if (outcome.type !== 'accepted') {
      return false;
    }
    this.acceptThrow(outcome);
    return true;
  }

  private recordGap(gapMs: number): void {
    if (gapMs <= 0 || gapMs >= MAX_RECORDED_GAP_MS) {
      return;
    }
    this.recentGaps.push(gapMs);
    if (this.recentGaps.length > SAMPLE_GAP_MEDIAN_WINDOW) {
      this.recentGaps.shift();
    }
  }

  private maxSampleGapMs(): number {
    if (this.recentGaps.length < 3) {
      return BASE_MAX_SAMPLE_GAP_MS;
    }
    const sorted = [...this.recentGaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return Math.max(BASE_MAX_SAMPLE_GAP_MS, SAMPLE_GAP_MULTIPLIER * median);
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
    this.recordGap(gapMs);
    const maxGapMs = this.maxSampleGapMs();
    let speed = 0;
    if (dt > 0 && gapMs <= maxGapMs) {
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
    const previousSpeed = this.currentWristSpeed;
    this.currentWristSpeed = speed;

    const finalizedThrow = this.finalizePendingThrow(now);

    if (dt <= 0 || gapMs > maxGapMs) {
      this.resetMotionCandidate();
      this.wristHistory = [rawWrist];
      this.previousSmoothedWrist = rawWrist;
      return finalizedThrow;
    }

    const canAccept =
      this.pendingThrow === null &&
      now - this.lastThrowAt >= THROW_LOCKOUT_MS;

    if (speed >= THROW_SPEED_THRESHOLD) {
      const separatedFromPeak =
        this.pendingPeak !== null &&
        now - this.pendingPeak.timestamp >= MIN_VALLEY_SEPARATION_MS;
      const quietDuration =
        this.quietSince !== null ? now - this.quietSince : 0;
      const valleyRise =
        separatedFromPeak &&
        this.sawValley &&
        speed > previousSpeed;
      const resumeAfterQuiet =
        separatedFromPeak &&
        this.wasAboveThreshold &&
        quietDuration >= MIN_RESUME_QUIET_MS &&
        quietDuration < MOTION_SETTLE_MS;
      if ((valleyRise || resumeAfterQuiet) && canAccept) {
        if (!detectionEnabled) {
          return finalizedThrow;
        }
        const accepted = this.considerPendingPeak(true);
        if (!accepted) {
          this.quietSince = null;
          if (!this.pendingPeak || speed > this.pendingPeak.speed) {
            this.pendingPeak = {
              speed,
              timestamp: smoothedSample.timestamp,
              wrist: smoothedWrist,
            };
            this.sawValley = false;
          } else if (speed <= VALLEY_SPEED_RATIO * this.pendingPeak.speed) {
            this.sawValley = true;
          }
          this.wasAboveThreshold = true;
          return finalizedThrow;
        }
        this.throwBaselineWrist = smoothedWrist;
        this.throwBaselineElbowAngle = sampleElbowAngle(smoothedSample);
        this.pendingPeak = {
          speed,
          timestamp: smoothedSample.timestamp,
          wrist: smoothedWrist,
        };
        this.wasAboveThreshold = true;
        this.sawValley = false;
        this.quietSince = null;
        return finalizedThrow;
      }
      if (!this.wasAboveThreshold) {
        this.throwBaselineWrist = smoothedWrist;
        this.throwBaselineElbowAngle = sampleElbowAngle(smoothedSample);
      }
      this.quietSince = null;
      if (!this.pendingPeak || speed > this.pendingPeak.speed) {
        this.pendingPeak = {
          speed,
          timestamp: smoothedSample.timestamp,
          wrist: smoothedWrist,
        };
        this.sawValley = false;
      } else if (speed <= VALLEY_SPEED_RATIO * this.pendingPeak.speed) {
        this.sawValley = true;
      }
      this.wasAboveThreshold = true;
      return finalizedThrow;
    }

    if (this.wasAboveThreshold && this.pendingPeak) {
      if (this.quietSince === null) {
        this.quietSince = now;
      }
      if (now - this.quietSince < MOTION_SETTLE_MS) {
        return finalizedThrow;
      }
      if (canAccept) {
        this.considerPendingPeak(detectionEnabled);
      }
      return finalizedThrow;
    }

    return finalizedThrow;
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
        if (gap > this.maxSampleGapMs() || gap <= 0) {
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
    this.lastAcceptedPeakSpeed = 0;
    this.wasAboveThreshold = false;
    this.pendingPeak = null;
    this.pendingThrow = null;
    this.armed = true;
    this.throwBaselineWrist = null;
    this.throwBaselineElbowAngle = null;
    this.currentWristSpeed = 0;
    this.primed = false;
    this.quietSince = null;
    this.sawValley = false;
    this.recentGaps = [];
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
