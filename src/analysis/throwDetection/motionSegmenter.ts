import type { PoseFeatureFrame } from './poseFeatures';

export const STABLE_AIM_DURATION_MS = 240;
export const MOTION_END_QUIET_MS = 150;
export const MAX_MOTION_BOUT_MS = 1250;

const AIM_MIN_ANGLE_DEG = 28;
const AIM_MAX_ANGLE_DEG = 155;
const AIM_MIN_WRIST_ABOVE_ELBOW = 0.18;
const AIM_MIN_HORIZONTAL_REACH = 0.35;
const AIM_MAX_HORIZONTAL_REACH = 1.75;
const BASE_QUIET_SPEED = 1.35;
const MAX_ADAPTIVE_QUIET_SPEED = 2.25;
const BASE_START_SPEED = 1.8;
const MAX_STABLE_ELBOW_SPEED = 1.4;
const MAX_STABLE_TORSO_SPEED = 1.15;
const MIN_START_EXTENSION_VELOCITY = 115;
const PRE_BOUT_CONTEXT_MS = 260;
const NOISE_WINDOW_SIZE = 60;
const AIM_STABILITY_GRACE_MS = 100;

export type ThrowMotionState = 'seekingAim' | 'armed' | 'active';

export type MotionSegmentUpdate =
  | {
      kind: 'none';
      state: ThrowMotionState;
    }
  | {
      kind: 'aimAcquired';
      state: 'armed';
      aimAcquiredAt: number;
    }
  | {
      kind: 'boutStarted';
      state: 'active';
      boutStartAt: number;
      motionStartAt: number;
    }
  | {
      kind: 'boutCompleted';
      state: 'seekingAim';
      boutStartAt: number;
      motionStartAt: number;
      motionEndAt: number;
    };

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.floor((sorted.length - 1) * fraction)),
    )
  ];
}

export function isPlausibleAim(frame: PoseFeatureFrame): boolean {
  return (
    frame.valid &&
    frame.elbowAngleDeg >= AIM_MIN_ANGLE_DEG &&
    frame.elbowAngleDeg <= AIM_MAX_ANGLE_DEG &&
    frame.wristAboveElbow >= AIM_MIN_WRIST_ABOVE_ELBOW &&
    frame.horizontalReach >= AIM_MIN_HORIZONTAL_REACH &&
    frame.horizontalReach <= AIM_MAX_HORIZONTAL_REACH
  );
}

export class StableAimMotionSegmenter {
  private state: ThrowMotionState = 'seekingAim';

  private stableAimSince: number | null = null;

  private aimUnstableSince: number | null = null;

  private motionStartAt: number | null = null;

  private boutStartAt: number | null = null;

  private quietSince: number | null = null;

  private recentAimSpeeds: number[] = [];

  update(
    frame: PoseFeatureFrame,
    allowArm: boolean,
  ): MotionSegmentUpdate {
    if (isPlausibleAim(frame)) {
      this.recentAimSpeeds.push(frame.normalizedWristSpeed);
      if (this.recentAimSpeeds.length > NOISE_WINDOW_SIZE) {
        this.recentAimSpeeds.shift();
      }
    }

    if (this.state === 'seekingAim') {
      if (!allowArm || !isPlausibleAim(frame)) {
        this.stableAimSince = null;
        this.aimUnstableSince = null;
        return { kind: 'none', state: this.state };
      }
      if (this.isStableAimFrame(frame)) {
        this.stableAimSince ??= frame.timestamp;
        this.aimUnstableSince = null;
      } else {
        this.aimUnstableSince ??= frame.timestamp;
        if (
          frame.timestamp - this.aimUnstableSince >
          AIM_STABILITY_GRACE_MS
        ) {
          this.stableAimSince = null;
        }
      }
      if (
        this.stableAimSince !== null &&
        frame.timestamp - this.stableAimSince >=
        STABLE_AIM_DURATION_MS
      ) {
        this.state = 'armed';
        return {
          kind: 'aimAcquired',
          state: this.state,
          aimAcquiredAt: frame.timestamp,
        };
      }
      return { kind: 'none', state: this.state };
    }

    if (this.state === 'armed') {
      if (this.isMotionStart(frame) || !isPlausibleAim(frame)) {
        return this.beginBout(frame);
      }
      return { kind: 'none', state: this.state };
    }

    const speed = frame.normalizedWristSpeed;
    if (speed <= this.quietSpeedThreshold()) {
      this.quietSince ??= frame.timestamp;
    } else {
      this.quietSince = null;
    }

    const motionStartAt = this.motionStartAt ?? frame.timestamp;
    const isQuiet =
      this.quietSince !== null &&
      frame.timestamp - this.quietSince >= MOTION_END_QUIET_MS;
    const timedOut =
      frame.timestamp - motionStartAt >= MAX_MOTION_BOUT_MS;
    if (!isQuiet && !timedOut) {
      return { kind: 'none', state: this.state };
    }

    return this.completeBout(frame.timestamp);
  }

  forceComplete(timestamp: number): MotionSegmentUpdate {
    if (this.state !== 'active') {
      this.reset();
      return { kind: 'none', state: this.state };
    }
    return this.completeBout(timestamp);
  }

  getState(): ThrowMotionState {
    return this.state;
  }

  getQuietSpeedThreshold(): number {
    return this.quietSpeedThreshold();
  }

  reset(): void {
    this.state = 'seekingAim';
    this.stableAimSince = null;
    this.aimUnstableSince = null;
    this.motionStartAt = null;
    this.boutStartAt = null;
    this.quietSince = null;
  }

  private beginBout(frame: PoseFeatureFrame): MotionSegmentUpdate {
    this.state = 'active';
    this.motionStartAt = frame.timestamp;
    this.boutStartAt = Math.max(
      this.stableAimSince ?? frame.timestamp,
      frame.timestamp - PRE_BOUT_CONTEXT_MS,
    );
    this.quietSince = null;
    return {
      kind: 'boutStarted',
      state: this.state,
      boutStartAt: this.boutStartAt,
      motionStartAt: this.motionStartAt,
    };
  }

  private completeBout(timestamp: number): MotionSegmentUpdate {
    const motionStartAt = this.motionStartAt ?? timestamp;
    const result: MotionSegmentUpdate = {
      kind: 'boutCompleted',
      state: 'seekingAim',
      boutStartAt: this.boutStartAt ?? motionStartAt,
      motionStartAt,
      motionEndAt: timestamp,
    };
    this.reset();
    return result;
  }

  private isStableAimFrame(frame: PoseFeatureFrame): boolean {
    return (
      isPlausibleAim(frame) &&
      frame.normalizedWristSpeed <= this.quietSpeedThreshold() &&
      frame.elbowAnchorSpeed <= MAX_STABLE_ELBOW_SPEED &&
      frame.torsoSpeed <= MAX_STABLE_TORSO_SPEED
    );
  }

  private isMotionStart(frame: PoseFeatureFrame): boolean {
    return (
      frame.valid &&
      (frame.normalizedWristSpeed >= this.startSpeedThreshold() ||
        (frame.elbowExtensionVelocityDeg >=
          MIN_START_EXTENSION_VELOCITY &&
          frame.normalizedWristSpeed >= this.quietSpeedThreshold()))
    );
  }

  private quietSpeedThreshold(): number {
    const noiseFloor = percentile(this.recentAimSpeeds, 0.25);
    return Math.min(
      MAX_ADAPTIVE_QUIET_SPEED,
      Math.max(BASE_QUIET_SPEED, noiseFloor * 2.2),
    );
  }

  private startSpeedThreshold(): number {
    return Math.max(BASE_START_SPEED, this.quietSpeedThreshold() * 1.15);
  }
}
