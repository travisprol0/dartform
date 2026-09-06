import type { PoseSample } from '../detectThrow';
import { elbowAngle } from '../geometry';
import type {
  PoseLandmark,
  TrackedPoseLandmarks,
} from '../throwingArm';

export const MIN_FEATURE_VISIBILITY = 0.5;
export const MAX_CONTINUOUS_GAP_MS = 220;

const FILTER_TIME_CONSTANT_MS = 36;
const MIN_IMAGE_FOREARM_LENGTH = 0.035;

const OPTIONAL_KEYS = [
  'oppositeShoulder',
  'nose',
  'leftHip',
  'rightHip',
  'index',
  'pinky',
  'thumb',
] as const;

type OptionalKey = (typeof OPTIONAL_KEYS)[number];

export type PoseFeatureFrame = {
  sample: PoseSample;
  timestamp: number;
  dtMs: number;
  continuous: boolean;
  valid: boolean;
  quality: number;
  forearmLength: number;
  normalizedWristSpeed: number;
  elbowAngleDeg: number;
  elbowExtensionVelocityDeg: number;
  horizontalReach: number;
  wristAboveElbow: number;
  elbowAnchorSpeed: number;
  torsoSpeed: number;
  worldDepthSpeed: number | null;
};

function confidence(point: PoseLandmark): number {
  return Math.max(
    0.15,
    Math.min(1, point.visibility ?? point.presence ?? 1),
  );
}

function filterAlpha(
  dtMs: number,
  point: PoseLandmark,
): number {
  const timeAlpha =
    1 - Math.exp(-Math.max(1, dtMs) / FILTER_TIME_CONSTANT_MS);
  return Math.max(0.2, Math.min(1, timeAlpha * confidence(point)));
}

function filterPoint(
  previous: PoseLandmark | undefined,
  next: PoseLandmark | undefined,
  dtMs: number,
): PoseLandmark | undefined {
  if (!next) {
    return undefined;
  }
  if (!previous) {
    return { ...next };
  }
  const alpha = filterAlpha(dtMs, next);
  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
    z: previous.z + (next.z - previous.z) * alpha,
    visibility: next.visibility,
    presence: next.presence,
  };
}

function filterWorld(
  previous: TrackedPoseLandmarks | undefined,
  next: TrackedPoseLandmarks | undefined,
  dtMs: number,
): TrackedPoseLandmarks | undefined {
  if (!next) {
    return undefined;
  }
  const shoulder = filterPoint(
    previous?.shoulder,
    next.shoulder,
    dtMs,
  );
  const elbow = filterPoint(previous?.elbow, next.elbow, dtMs);
  const wrist = filterPoint(previous?.wrist, next.wrist, dtMs);
  if (!shoulder || !elbow || !wrist) {
    return undefined;
  }
  return {
    shoulder,
    elbow,
    wrist,
    ...Object.fromEntries(
      OPTIONAL_KEYS.map((key) => [
        key,
        filterPoint(previous?.[key], next[key], dtMs),
      ]),
    ),
  } as TrackedPoseLandmarks;
}

export function filterPoseSample(
  previous: PoseSample | null,
  next: PoseSample,
  continuous: boolean,
): PoseSample {
  if (!previous || !continuous) {
    return {
      ...next,
      shoulder: { ...next.shoulder },
      elbow: { ...next.elbow },
      wrist: { ...next.wrist },
      world: filterWorld(undefined, next.world, 0),
    };
  }
  const dtMs = next.timestamp - previous.timestamp;
  const optional = Object.fromEntries(
    OPTIONAL_KEYS.map((key) => [
      key,
      filterPoint(previous[key], next[key], dtMs),
    ]),
  ) as Partial<Record<OptionalKey, PoseLandmark>>;
  return {
    ...next,
    shoulder:
      filterPoint(previous.shoulder, next.shoulder, dtMs) ??
      { ...next.shoulder },
    elbow:
      filterPoint(previous.elbow, next.elbow, dtMs) ??
      { ...next.elbow },
    wrist:
      filterPoint(previous.wrist, next.wrist, dtMs) ??
      { ...next.wrist },
    ...optional,
    world: filterWorld(previous.world, next.world, dtMs),
  };
}

function imageForearmLength(sample: PoseSample): number {
  return Math.hypot(
    sample.wrist.x - sample.elbow.x,
    sample.wrist.y - sample.elbow.y,
  );
}

function normalizedRelativePoint(
  sample: PoseSample,
  key: 'wrist' | 'elbow',
  scale: number,
): { x: number; y: number } {
  return {
    x: (sample[key].x - sample.shoulder.x) / scale,
    y: (sample[key].y - sample.shoulder.y) / scale,
  };
}

function pointSpeed(
  previous: { x: number; y: number },
  next: { x: number; y: number },
  dtSeconds: number,
): number {
  return dtSeconds > 0
    ? Math.hypot(next.x - previous.x, next.y - previous.y) /
        dtSeconds
    : 0;
}

function midpoint(
  first: PoseLandmark,
  second: PoseLandmark,
): { x: number; y: number } {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function normalizedTorsoPoint(
  sample: PoseSample,
  scale: number,
): { x: number; y: number } | null {
  if (
    !sample.oppositeShoulder ||
    !sample.leftHip ||
    !sample.rightHip
  ) {
    return null;
  }
  const shoulders = midpoint(sample.shoulder, sample.oppositeShoulder);
  const hips = midpoint(sample.leftHip, sample.rightHip);
  return {
    x: (shoulders.x - hips.x) / scale,
    y: (shoulders.y - hips.y) / scale,
  };
}

function worldForearmLength(sample: PoseSample): number {
  if (!sample.world) {
    return 0;
  }
  return Math.hypot(
    sample.world.wrist.x - sample.world.elbow.x,
    sample.world.wrist.y - sample.world.elbow.y,
    sample.world.wrist.z - sample.world.elbow.z,
  );
}

function worldRelativeDepth(
  sample: PoseSample,
  scale: number,
): number | null {
  return sample.world && scale > 1e-6
    ? (sample.world.wrist.z - sample.world.shoulder.z) / scale
    : null;
}

export class PoseFeatureExtractor {
  private previousSample: PoseSample | null = null;

  private previousFrame: PoseFeatureFrame | null = null;

  addSample(sample: PoseSample): PoseFeatureFrame {
    const dtMs = this.previousSample
      ? sample.timestamp - this.previousSample.timestamp
      : 0;
    const continuous =
      this.previousSample !== null &&
      dtMs > 0 &&
      dtMs <= MAX_CONTINUOUS_GAP_MS;
    const filtered = filterPoseSample(
      this.previousSample,
      sample,
      continuous,
    );
    const forearmLength = imageForearmLength(filtered);
    const valid =
      filtered.visibility >= MIN_FEATURE_VISIBILITY &&
      forearmLength >= MIN_IMAGE_FOREARM_LENGTH;
    const dtSeconds = continuous ? dtMs / 1000 : 0;

    let normalizedWristSpeed = 0;
    let elbowExtensionVelocityDeg = 0;
    let elbowAnchorSpeed = 0;
    let torsoSpeed = 0;
    let worldDepthSpeed: number | null = null;

    const elbowAngleDeg = elbowAngle(
      filtered.shoulder,
      filtered.elbow,
      filtered.wrist,
    );

    if (continuous && this.previousFrame && dtSeconds > 0) {
      const previousScale = this.previousFrame.forearmLength;
      const scale = Math.max(
        MIN_IMAGE_FOREARM_LENGTH,
        (previousScale + forearmLength) / 2,
      );
      normalizedWristSpeed = pointSpeed(
        normalizedRelativePoint(
          this.previousFrame.sample,
          'wrist',
          scale,
        ),
        normalizedRelativePoint(filtered, 'wrist', scale),
        dtSeconds,
      );
      elbowAnchorSpeed = pointSpeed(
        normalizedRelativePoint(
          this.previousFrame.sample,
          'elbow',
          scale,
        ),
        normalizedRelativePoint(filtered, 'elbow', scale),
        dtSeconds,
      );
      elbowExtensionVelocityDeg =
        (elbowAngleDeg - this.previousFrame.elbowAngleDeg) /
        dtSeconds;

      const previousTorso = normalizedTorsoPoint(
        this.previousFrame.sample,
        scale,
      );
      const nextTorso = normalizedTorsoPoint(filtered, scale);
      if (previousTorso && nextTorso) {
        torsoSpeed = pointSpeed(previousTorso, nextTorso, dtSeconds);
      }

      const previousWorldScale = worldForearmLength(
        this.previousFrame.sample,
      );
      const nextWorldScale = worldForearmLength(filtered);
      const worldScale = (previousWorldScale + nextWorldScale) / 2;
      const previousDepth = worldRelativeDepth(
        this.previousFrame.sample,
        worldScale,
      );
      const nextDepth = worldRelativeDepth(filtered, worldScale);
      if (
        previousDepth !== null &&
        nextDepth !== null &&
        worldScale > 1e-6
      ) {
        worldDepthSpeed = (nextDepth - previousDepth) / dtSeconds;
      }
    }

    const frame: PoseFeatureFrame = {
      sample: filtered,
      timestamp: filtered.timestamp,
      dtMs,
      continuous,
      valid,
      quality: filtered.visibility,
      forearmLength,
      normalizedWristSpeed,
      elbowAngleDeg,
      elbowExtensionVelocityDeg,
      horizontalReach:
        Math.abs(filtered.wrist.x - filtered.shoulder.x) /
        Math.max(forearmLength, MIN_IMAGE_FOREARM_LENGTH),
      wristAboveElbow:
        (filtered.elbow.y - filtered.wrist.y) /
        Math.max(forearmLength, MIN_IMAGE_FOREARM_LENGTH),
      elbowAnchorSpeed,
      torsoSpeed,
      worldDepthSpeed,
    };

    this.previousSample = filtered;
    this.previousFrame = frame;
    return frame;
  }

  reset(): void {
    this.previousSample = null;
    this.previousFrame = null;
  }
}
