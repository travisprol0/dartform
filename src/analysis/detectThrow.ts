import type {
  PoseLandmark,
  TrackedPoseLandmarks,
} from './throwingArm';
import {
  CANONICAL_FOREARM_LENGTH_METERS,
  classifyThrowBout,
  type ThrowCandidateDiagnostic,
} from './throwDetection/classifyThrow';
import {
  StableAimMotionSegmenter,
  STABLE_AIM_DURATION_MS,
  type MotionSegmentUpdate,
  type ThrowMotionState,
} from './throwDetection/motionSegmenter';
import {
  MAX_CONTINUOUS_GAP_MS,
  PoseFeatureExtractor,
  type PoseFeatureFrame,
} from './throwDetection/poseFeatures';

export const CANONICAL_FOREARM_LENGTH_M =
  CANONICAL_FOREARM_LENGTH_METERS;

/** Ring buffer size, roughly six seconds at 30 fps. */
export const BUFFER_SIZE = 180;

/** Snapshot window retained for mechanics analysis. */
export const TRACE_BEFORE_MS = 1500;
export const TRACE_AFTER_MS = 800;

/**
 * Enough history to begin aim acquisition. Full trace coverage is desirable,
 * but must not be a prerequisite for detecting the first dart.
 */
export const MIN_READY_BUFFER_MS = 400;

/** Compatibility exports; re-arming is now a fresh stable-aim acquisition. */
export const THROW_LOCKOUT_MS = 500;
export const REARM_QUIET_MS = STABLE_AIM_DURATION_MS;

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

export type ThrowTrace = {
  samples: PoseSample[];
  peakIndex: number;
};

export type PendingThrow = {
  peakTimestamp: number;
  peakSpeed: number;
};

export type ThrowDetectorState =
  | ThrowMotionState
  | 'postRoll';

function nearestSampleIndex(
  samples: readonly PoseSample[],
  timestamp: number,
): number {
  if (samples.length === 0) {
    return 0;
  }
  let nearestIndex = 0;
  let nearestDistance = Math.abs(samples[0].timestamp - timestamp);
  for (let index = 1; index < samples.length; index += 1) {
    const distance = Math.abs(samples[index].timestamp - timestamp);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

export function findNearestTracePeakIndex(
  samples: readonly PoseSample[],
  peakTimestamp: number,
): number {
  return nearestSampleIndex(samples, peakTimestamp);
}

export class ThrowDetector {
  private buffer: PoseSample[] = [];

  private featureBuffer: PoseFeatureFrame[] = [];

  private featureExtractor = new PoseFeatureExtractor();

  private segmenter = new StableAimMotionSegmenter();

  private pendingThrow: PendingThrow | null = null;

  private currentWristSpeed = 0;

  private lastThrowAt = Number.NEGATIVE_INFINITY;

  private primed = false;

  private lastDiagnostic: ThrowCandidateDiagnostic | null = null;

  addSample(
    sample: PoseSample,
    detectionEnabled = true,
  ): ThrowEvent | null {
    const frame = this.featureExtractor.addSample(sample);
    this.buffer.push(frame.sample);
    this.featureBuffer.push(frame);
    if (this.buffer.length > BUFFER_SIZE) {
      this.buffer.shift();
      this.featureBuffer.shift();
    }

    this.currentWristSpeed =
      frame.normalizedWristSpeed *
      CANONICAL_FOREARM_LENGTH_METERS;
    if (
      this.getRecentContinuousDurationMs() >=
      MIN_READY_BUFFER_MS
    ) {
      this.primed = true;
    }

    const finalizedThrow = this.finalizePendingThrow(
      frame.timestamp,
    );

    if (!frame.continuous || !frame.valid || !detectionEnabled) {
      return this.finishOrResetBout(frame.timestamp, finalizedThrow);
    }

    const allowArm =
      this.pendingThrow === null &&
      frame.timestamp - this.lastThrowAt >= THROW_LOCKOUT_MS;
    const update = this.segmenter.update(frame, allowArm);
    if (update.kind !== 'boutCompleted') {
      return finalizedThrow;
    }

    return this.scoreCompletedBout(update, finalizedThrow);
  }

  advance(now: number): ThrowEvent | null {
    return this.finalizePendingThrow(now);
  }

  noteMissingTracking(now: number): ThrowEvent | null {
    const finalizedThrow = this.finalizePendingThrow(now);
    return this.finishOrResetBout(now, finalizedThrow);
  }

  getCurrentWristSpeed(): number {
    return this.currentWristSpeed;
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
    if (this.featureBuffer.length < 2) {
      return 0;
    }
    const lastIndex = this.featureBuffer.length - 1;
    let startIndex = lastIndex;
    for (let index = lastIndex; index > 0; index -= 1) {
      const current = this.featureBuffer[index];
      if (
        !current.continuous ||
        current.dtMs > MAX_CONTINUOUS_GAP_MS
      ) {
        break;
      }
      startIndex = index - 1;
    }
    return (
      this.featureBuffer[lastIndex].timestamp -
      this.featureBuffer[startIndex].timestamp
    );
  }

  isCollectingPostRoll(): boolean {
    return this.pendingThrow !== null;
  }

  getPendingPeakTimestamp(): number | null {
    return this.pendingThrow?.peakTimestamp ?? null;
  }

  isArmed(): boolean {
    return (
      this.pendingThrow === null &&
      this.segmenter.getState() === 'armed'
    );
  }

  hasStableAim(): boolean {
    const state = this.segmenter.getState();
    return state === 'armed' || state === 'active';
  }

  getState(): ThrowDetectorState {
    return this.pendingThrow
      ? 'postRoll'
      : this.segmenter.getState();
  }

  getLastDiagnostic(): ThrowCandidateDiagnostic | null {
    return this.lastDiagnostic;
  }

  isPrimed(): boolean {
    return this.primed;
  }

  reset(): void {
    this.buffer = [];
    this.featureBuffer = [];
    this.featureExtractor = new PoseFeatureExtractor();
    this.segmenter = new StableAimMotionSegmenter();
    this.pendingThrow = null;
    this.currentWristSpeed = 0;
    this.lastThrowAt = Number.NEGATIVE_INFINITY;
    this.primed = false;
    this.lastDiagnostic = null;
  }

  private finishOrResetBout(
    timestamp: number,
    finalizedThrow: ThrowEvent | null,
  ): ThrowEvent | null {
    if (this.segmenter.getState() === 'active') {
      const update = this.segmenter.forceComplete(timestamp);
      if (update.kind === 'boutCompleted') {
        return this.scoreCompletedBout(update, finalizedThrow);
      }
    } else {
      this.segmenter.reset();
    }
    return finalizedThrow;
  }

  private scoreCompletedBout(
    update: Extract<MotionSegmentUpdate, { kind: 'boutCompleted' }>,
    finalizedThrow: ThrowEvent | null,
  ): ThrowEvent | null {
    const bout = this.featureBuffer.filter(
      (candidate) =>
        candidate.timestamp >= update.boutStartAt &&
        candidate.timestamp <= update.motionEndAt,
    );
    const diagnostic = classifyThrowBout(
      bout,
      update.motionStartAt,
      update.motionEndAt,
    );
    this.lastDiagnostic = diagnostic;
    if (!diagnostic.accepted || this.pendingThrow !== null) {
      return finalizedThrow;
    }

    this.lastThrowAt = diagnostic.peakTimestamp;
    this.pendingThrow = {
      peakTimestamp: diagnostic.peakTimestamp,
      peakSpeed: diagnostic.peakSpeedMetersPerSecond,
    };
    return finalizedThrow;
  }

  private finalizePendingThrow(now: number): ThrowEvent | null {
    if (
      !this.pendingThrow ||
      now - this.pendingThrow.peakTimestamp < TRACE_AFTER_MS
    ) {
      return null;
    }
    const pending = this.pendingThrow;
    this.pendingThrow = null;
    return {
      peakIndex: nearestSampleIndex(
        this.buffer,
        pending.peakTimestamp,
      ),
      peakSpeed: pending.peakSpeed,
      timestamp: pending.peakTimestamp,
    };
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
  const samples = buffer.filter(
    (sample) =>
      sample.timestamp >= peakTime - TRACE_BEFORE_MS &&
      sample.timestamp <= peakTime + TRACE_AFTER_MS,
  );
  return {
    samples,
    peakIndex: nearestSampleIndex(samples, peakTime),
  };
}
