import { analyzeThrowTrace } from '../analysis/throwPhases';
import type { PoseSample, ThrowTrace } from '../analysis/detectThrow';
import type { PoseLandmark, TrackedPoseLandmarks } from '../analysis/throwingArm';
import type { DartMetrics } from '../types/round';

function landmark(
  x: number,
  y: number,
  z = 0,
  visibility = 0.95,
): PoseLandmark {
  return { x, y, z, visibility, presence: visibility };
}

function worldPose(
  wristX: number,
  wristY: number,
  depth: number,
  elbowX: number,
  elbowY: number,
): TrackedPoseLandmarks {
  return {
    shoulder: landmark(0, 0.2, 0),
    elbow: landmark(elbowX - 0.5, elbowY, 0.01),
    wrist: landmark(wristX - 0.5, wristY, depth),
    oppositeShoulder: landmark(-0.3, 0.2, 0),
    nose: landmark(-0.15, 0.08, 0),
    leftHip: landmark(-0.18, 0.8, 0),
    rightHip: landmark(0.18, 0.8, 0),
    index: landmark(wristX - 0.46, wristY - 0.01, depth),
    pinky: landmark(wristX - 0.47, wristY + 0.02, depth),
    thumb: landmark(wristX - 0.48, wristY - 0.025, depth),
  };
}

export function poseSample(
  timestamp: number,
  wristX: number,
  wristY: number,
  depth = 0,
  elbowX = 0.5,
  elbowY = 0.5,
): PoseSample {
  return {
    timestamp,
    shoulder: landmark(0.5, 0.2),
    elbow: landmark(elbowX, elbowY),
    wrist: landmark(wristX, wristY, depth),
    oppositeShoulder: landmark(0.3, 0.2),
    nose: landmark(0.4, 0.08),
    leftHip: landmark(0.42, 0.8),
    rightHip: landmark(0.58, 0.8),
    index: landmark(wristX + 0.04, wristY - 0.01),
    pinky: landmark(wristX + 0.03, wristY + 0.02),
    thumb: landmark(wristX + 0.02, wristY - 0.025),
    world: worldPose(wristX, wristY, depth, elbowX, elbowY),
    visibility: 0.95,
  };
}

export function makeThrowTrace(
  horizontalOffset = 0,
  timingScale = 1,
): ThrowTrace {
  const samples: PoseSample[] = [];
  const frameMs = 1000 / 30;
  const phaseFrame = (frame: number) => frame / timingScale;

  for (let frame = 0; frame < 96; frame++) {
    const scaledFrame = phaseFrame(frame);
    const elbowX = 0.5 + horizontalOffset;
    const elbowY = 0.5;
    let forearmAngleDeg = 0;

    if (scaledFrame >= 45 && scaledFrame < 55) {
      const progress = (scaledFrame - 45) / 10;
      forearmAngleDeg = -60 * progress;
    } else if (scaledFrame >= 55 && scaledFrame < 65) {
      const progress = (scaledFrame - 55) / 10;
      forearmAngleDeg = -60 + progress * 80;
    } else if (scaledFrame >= 65 && scaledFrame < 72) {
      const progress = (scaledFrame - 65) / 7;
      forearmAngleDeg = 20 + progress * 45;
    } else if (scaledFrame >= 72) {
      forearmAngleDeg = 65;
    }
    const forearmAngle = (forearmAngleDeg * Math.PI) / 180;
    const wristX = elbowX + Math.cos(forearmAngle) * 0.2;
    const wristY = elbowY + Math.sin(forearmAngle) * 0.2;

    samples.push(
      poseSample(
        10_000 + frame * frameMs,
        wristX,
        wristY,
        (wristX - 0.7) * 0.12,
        elbowX,
        elbowY,
      ),
    );
  }

  return {
    samples,
    peakIndex: Math.min(samples.length - 2, Math.round(64 * timingScale)),
  };
}

export function makeAnalyzedDart(
  dartNumber: number,
  horizontalOffset = 0,
  timingScale = 1,
): DartMetrics {
  const metrics = analyzeThrowTrace(
    makeThrowTrace(horizontalOffset, timingScale),
    dartNumber,
  );
  if (!metrics) {
    throw new Error('Synthetic throw did not produce metrics.');
  }
  return metrics;
}

export function makeSparseDart(
  dartNumber = 1,
  overrides: Partial<DartMetrics> = {},
): DartMetrics {
  const dart = makeAnalyzedDart(dartNumber);
  return {
    ...dart,
    speedProfile: [],
    trajectory: [],
    phaseMarkers: {
      ...dart.phaseMarkers,
      rearMs: null,
      settleMs: null,
    },
    groups: {
      ...dart.groups,
      timing: {
        ...dart.groups.timing,
        aimHoldMs: null,
        backswingMs: null,
        forwardStrokeMs: null,
        backswingToForwardRatio: null,
      },
      geometry: {
        ...dart.groups.geometry,
        elbowExtensionDeg: null,
        cockedElbowDeg: null,
        maxElbowLockDeg: null,
        forearmElevationDeg: null,
        upperArmElevationDeg: null,
        elbowAnchorDrift: null,
      },
      path: {
        ...dart.groups.path,
        followThroughLength: null,
        directness: null,
        followThroughContinuation: null,
        forwardStrokeLength: null,
        maxDeviation: null,
      },
      delivery: {
        ...dart.groups.delivery,
        timeToPeakMs: null,
        peakAcceleration: null,
        smoothness: null,
        hitchCount: null,
        peakLocationRatio: null,
      },
      body: {
        ...dart.groups.body,
        aimWristSway: null,
        shoulderDrift: null,
        headDrift: null,
        torsoSway: null,
        torsoLeanDeg: null,
        outOfPlaneMotion: null,
      },
      hand: {
        handAngleDeg: 5,
        wristSnapDeg: null,
        confidence: null,
      },
    },
    ...overrides,
  };
}
