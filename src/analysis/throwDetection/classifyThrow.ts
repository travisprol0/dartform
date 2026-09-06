import type { PoseFeatureFrame } from './poseFeatures';

export const CANONICAL_FOREARM_LENGTH_METERS = 0.25;
export const MIN_THROW_SCORE = 0.55;

const MIN_OUTWARD_REACH_GAIN = 0.2;
const MIN_OUTWARD_SPEED = 1.35;
const MIN_RELEASE_SPEED = 3.1;
const MIN_COMMITTED_EXTENSION_DEG = 32;
const MIN_COMMITTED_REACH_GAIN = 0.35;
/** Front/profile throws often travel in world Z with little image-X reach. */
const MIN_WORLD_DEPTH_SPEED = 5.5;
const MIN_DEPTH_RELEASE_SPEED = 6;
const MIN_DEPTH_COVERAGE = 0.55;

export type ThrowRejectionReason =
  | 'accepted'
  | 'insufficient_tracking'
  | 'insufficient_outward_reach'
  | 'insufficient_outward_speed'
  | 'insufficient_release_speed'
  | 'insufficient_extension'
  | 'excessive_body_motion'
  | 'low_throw_score';

export function throwRejectionLabel(reason: ThrowRejectionReason): string {
  switch (reason) {
    case 'accepted':
      return 'Throw accepted';
    case 'insufficient_tracking':
      return 'Arm tracking dropped';
    case 'insufficient_outward_reach':
      return 'Not enough forward reach';
    case 'insufficient_outward_speed':
      return 'Motion was too slow';
    case 'insufficient_release_speed':
      return 'Looked like an aim pump';
    case 'insufficient_extension':
      return 'Elbow did not extend';
    case 'excessive_body_motion':
      return 'Too much body motion';
    case 'low_throw_score':
      return 'Motion did not look like a throw';
  }
}

export type ThrowScoreComponents = {
  outwardReach: number;
  outwardSpeed: number;
  elbowExtension: number;
  extensionSpeed: number;
  releaseSpeed: number;
  elbowStability: number;
  bodyStability: number;
  worldDepthEvidence: number;
};

export type ThrowCandidateMeasurements = {
  reachGain: number;
  peakOutwardSpeed: number;
  elbowExtensionDeg: number;
  peakExtensionVelocityDeg: number;
  peakNormalizedWristSpeed: number;
  elbowAnchorTravel: number;
  bodyMotion: number;
  peakWorldDepthSpeed: number;
  worldDepthCoverage: number;
  validCoverage: number;
};

export type ThrowCandidateDiagnostic = {
  accepted: boolean;
  reason: ThrowRejectionReason;
  score: number;
  scores: ThrowScoreComponents;
  measurements: ThrowCandidateMeasurements;
  peakIndex: number;
  peakTimestamp: number;
  peakSpeedMetersPerSecond: number;
  motionStartAt: number;
  motionEndAt: number;
};

type IndexedFrame = {
  frame: PoseFeatureFrame;
  index: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ramp(value: number, low: number, high: number): number {
  return clamp01((value - low) / (high - low));
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function relativeElbow(
  frame: PoseFeatureFrame,
  scale: number,
): { x: number; y: number } {
  return {
    x: (frame.sample.elbow.x - frame.sample.shoulder.x) / scale,
    y: (frame.sample.elbow.y - frame.sample.shoulder.y) / scale,
  };
}

function elbowTravel(
  baseline: PoseFeatureFrame,
  peak: PoseFeatureFrame,
): number {
  const scale = Math.max(
    0.035,
    (baseline.forearmLength + peak.forearmLength) / 2,
  );
  const start = relativeElbow(baseline, scale);
  const end = relativeElbow(peak, scale);
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function emptyDiagnostic(
  frames: readonly PoseFeatureFrame[],
  motionStartAt: number,
  motionEndAt: number,
): ThrowCandidateDiagnostic {
  const fallback = frames[frames.length - 1];
  const timestamp = fallback?.timestamp ?? motionEndAt;
  return {
    accepted: false,
    reason: 'insufficient_tracking',
    score: 0,
    scores: {
      outwardReach: 0,
      outwardSpeed: 0,
      elbowExtension: 0,
      extensionSpeed: 0,
      releaseSpeed: 0,
      elbowStability: 0,
      bodyStability: 0,
      worldDepthEvidence: 0,
    },
    measurements: {
      reachGain: 0,
      peakOutwardSpeed: 0,
      elbowExtensionDeg: 0,
      peakExtensionVelocityDeg: 0,
      peakNormalizedWristSpeed: 0,
      elbowAnchorTravel: 0,
      bodyMotion: 0,
      peakWorldDepthSpeed: 0,
      worldDepthCoverage: 0,
      validCoverage: 0,
    },
    peakIndex: Math.max(0, frames.length - 1),
    peakTimestamp: timestamp,
    peakSpeedMetersPerSecond: 0,
    motionStartAt,
    motionEndAt,
  };
}

export function classifyThrowBout(
  frames: readonly PoseFeatureFrame[],
  motionStartAt: number,
  motionEndAt: number,
): ThrowCandidateDiagnostic {
  const indexed: IndexedFrame[] = frames.map((frame, index) => ({
    frame,
    index,
  }));
  const validFrames = indexed.filter(({ frame }) => frame.valid);
  const validCoverage =
    frames.length > 0 ? validFrames.length / frames.length : 0;
  if (validFrames.length < 5 || validCoverage < 0.65) {
    return emptyDiagnostic(frames, motionStartAt, motionEndAt);
  }

  const preMotion = validFrames.filter(
    ({ frame }) => frame.timestamp <= motionStartAt,
  );
  const baselineFrames = (
    preMotion.length >= 2 ? preMotion : validFrames.slice(0, 3)
  ).slice(-8);
  const baselineScale = Math.max(
    0.035,
    median(
      baselineFrames.map(({ frame }) => frame.forearmLength),
    ),
  );
  const constantScaleReach = (frame: PoseFeatureFrame) =>
    Math.abs(frame.sample.wrist.x - frame.sample.shoulder.x) /
    baselineScale;
  const baselineReach = median(
    baselineFrames.map(({ frame }) => constantScaleReach(frame)),
  );
  const baselineAngle = median(
    baselineFrames.map(({ frame }) => frame.elbowAngleDeg),
  );
  const baselineFrame =
    baselineFrames[Math.floor(baselineFrames.length / 2)]?.frame ??
    validFrames[0].frame;

  let maxReach = baselineReach;
  let peakOutwardSpeed = 0;
  let maxAngle = baselineAngle;
  let peakExtensionVelocityDeg = 0;
  let peak: IndexedFrame =
    validFrames.find(
      ({ frame }) => frame.timestamp >= motionStartAt,
    ) ?? validFrames[0];
  let bestReleaseSignal = Number.NEGATIVE_INFINITY;

  for (let index = 1; index < validFrames.length; index += 1) {
    const previous = validFrames[index - 1].frame;
    const current = validFrames[index];
    if (current.frame.timestamp < motionStartAt) {
      continue;
    }
    const dtSeconds =
      (current.frame.timestamp - previous.timestamp) / 1000;
    if (dtSeconds <= 0) {
      continue;
    }
    const outwardSpeed = Math.max(
      0,
      (constantScaleReach(current.frame) -
        constantScaleReach(previous)) /
        dtSeconds,
    );
    maxReach = Math.max(
      maxReach,
      constantScaleReach(current.frame),
    );
    maxAngle = Math.max(maxAngle, current.frame.elbowAngleDeg);
    peakOutwardSpeed = Math.max(peakOutwardSpeed, outwardSpeed);
    peakExtensionVelocityDeg = Math.max(
      peakExtensionVelocityDeg,
      current.frame.elbowExtensionVelocityDeg,
    );

    const releaseSignal =
      outwardSpeed * 0.48 +
      Math.max(0, current.frame.elbowExtensionVelocityDeg) / 180 +
      current.frame.normalizedWristSpeed * 0.24;
    if (releaseSignal > bestReleaseSignal) {
      bestReleaseSignal = releaseSignal;
      peak = current;
    }
  }

  const reachGain = Math.max(0, maxReach - baselineReach);
  const elbowExtensionDeg = Math.max(0, maxAngle - baselineAngle);
  const motionFrames = validFrames.filter(
    ({ frame }) => frame.timestamp >= motionStartAt,
  );
  const peakNormalizedWristSpeed = Math.max(
    0,
    ...motionFrames.map(({ frame }) => frame.normalizedWristSpeed),
  );
  const elbowAnchorTravel = elbowTravel(
    baselineFrame,
    peak.frame,
  );
  const bodyMotion = median(
    motionFrames.map(({ frame }) => frame.torsoSpeed),
  );
  const worldDepthSpeeds = motionFrames.flatMap(({ frame }) =>
    frame.worldDepthSpeed === null
      ? []
      : [Math.abs(frame.worldDepthSpeed)],
  );
  const worldDepthCoverage =
    motionFrames.length > 0
      ? worldDepthSpeeds.length / motionFrames.length
      : 0;
  const peakWorldDepthSpeed = Math.max(0, ...worldDepthSpeeds);

  const depthReach =
    worldDepthCoverage >= MIN_DEPTH_COVERAGE
      ? ramp(peakWorldDepthSpeed, 2.2, 6.5)
      : 0;
  const scores: ThrowScoreComponents = {
    outwardReach: Math.max(ramp(reachGain, 0.12, 0.7), depthReach),
    outwardSpeed: ramp(peakOutwardSpeed, 1.4, 5.5),
    elbowExtension: ramp(elbowExtensionDeg, 7, 38),
    extensionSpeed: ramp(peakExtensionVelocityDeg, 70, 320),
    releaseSpeed: ramp(peakNormalizedWristSpeed, 3, 8),
    elbowStability: 1 - ramp(elbowAnchorTravel, 0.35, 1),
    bodyStability: 1 - ramp(bodyMotion, 1.1, 3.2),
    worldDepthEvidence:
      worldDepthCoverage >= MIN_DEPTH_COVERAGE
        ? ramp(peakWorldDepthSpeed, 1.5, 5)
        : 0.5,
  };
  const score =
    scores.outwardReach * 0.29 +
    scores.outwardSpeed * 0.19 +
    scores.elbowExtension * 0.18 +
    scores.extensionSpeed * 0.12 +
    scores.releaseSpeed * 0.12 +
    scores.elbowStability * 0.05 +
    scores.bodyStability * 0.03 +
    scores.worldDepthEvidence * 0.02;

  const committedExtension =
    elbowExtensionDeg >= MIN_COMMITTED_EXTENSION_DEG &&
    reachGain >= MIN_COMMITTED_REACH_GAIN;
  const imageDelivery =
    reachGain >= MIN_OUTWARD_REACH_GAIN &&
    peakOutwardSpeed >= MIN_OUTWARD_SPEED;
  const depthDelivery =
    worldDepthCoverage >= MIN_DEPTH_COVERAGE &&
    peakWorldDepthSpeed >= MIN_WORLD_DEPTH_SPEED &&
    peakNormalizedWristSpeed >= MIN_DEPTH_RELEASE_SPEED &&
    (peakOutwardSpeed >= MIN_OUTWARD_SPEED ||
      peakExtensionVelocityDeg >= 70 ||
      elbowExtensionDeg >= 8);
  const littleElbowChange =
    scores.elbowExtension < 0.12 && scores.extensionSpeed < 0.12;

  let reason: ThrowRejectionReason = 'accepted';
  if (!imageDelivery && !depthDelivery) {
    if (reachGain < MIN_OUTWARD_REACH_GAIN) {
      reason = 'insufficient_outward_reach';
    } else if (peakOutwardSpeed < MIN_OUTWARD_SPEED) {
      reason = 'insufficient_outward_speed';
    } else {
      reason = 'insufficient_release_speed';
    }
  } else if (
    peakNormalizedWristSpeed < MIN_RELEASE_SPEED &&
    !committedExtension
  ) {
    reason = 'insufficient_release_speed';
  } else if (littleElbowChange && !depthDelivery) {
    reason = 'insufficient_extension';
  } else if (scores.bodyStability === 0 && score < MIN_THROW_SCORE) {
    reason = 'excessive_body_motion';
  } else if (
    score < MIN_THROW_SCORE &&
    !depthDelivery &&
    !committedExtension
  ) {
    reason = 'low_throw_score';
  }

  return {
    accepted: reason === 'accepted',
    reason,
    score,
    scores,
    measurements: {
      reachGain,
      peakOutwardSpeed,
      elbowExtensionDeg,
      peakExtensionVelocityDeg,
      peakNormalizedWristSpeed,
      elbowAnchorTravel,
      bodyMotion,
      peakWorldDepthSpeed,
      worldDepthCoverage,
      validCoverage,
    },
    peakIndex: peak.index,
    peakTimestamp: peak.frame.timestamp,
    peakSpeedMetersPerSecond:
      peakNormalizedWristSpeed * CANONICAL_FOREARM_LENGTH_METERS,
    motionStartAt,
    motionEndAt,
  };
}
