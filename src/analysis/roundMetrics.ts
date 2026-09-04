import type {
  CameraFacingMode,
  DartMetrics,
  MetricVariability,
  RoundSummary,
  ThrowingHand,
} from '../types/round';
import { computeCaptureQuality } from './captureQuality';
import type { PoseSample } from './detectThrow';
import { extractThrowTrace } from './detectThrow';
import { elbowAngle } from './geometry';
import { computeRoundComparison } from './roundComparison';
import { analyzeThrowTrace, traceHasMeaningfulMotion } from './throwPhases';

export { elbowAngle } from './geometry';

export function computeDartMetrics(
  buffer: PoseSample[],
  peakIndex: number,
  dartNumber: number,
): DartMetrics {
  const trace = extractThrowTrace(buffer, peakIndex);
  const metrics = traceHasMeaningfulMotion(trace)
    ? analyzeThrowTrace(trace, dartNumber)
    : null;
  if (metrics) {
    return metrics;
  }

  const peak = buffer[peakIndex];
  const releaseAngle = elbowAngle(peak.shoulder, peak.elbow, peak.wrist);
  const captureQuality = computeCaptureQuality(trace);
  const insight = {
    category: 'capture' as const,
    metricKey: 'captureQuality',
    headline: 'Keep the full arm visible',
    evidence: 'More tracked frames are needed for dependable mechanics.',
    action:
      'Step back until your throwing shoulder, elbow, and wrist stay in the camera frame.',
  };
  return {
    dartNumber,
    analysisStatus: 'degraded',
    peakTimestamp: peak.timestamp,
    coachingTip: `${insight.headline}. ${insight.evidence}`,
    speedProfile: [],
    phases: {
      aimHoldMs: null,
      aimWristSway: null,
      backswingMs: null,
      backswingLength: null,
      cockedElbowDeg: null,
      forwardStrokeMs: null,
      peakSpeed: 0,
      timeToPeakMs: null,
      meanAcceleration: null,
      releaseElbowDeg: releaseAngle,
      forearmElevationDeg: null,
      releaseHeightVsShoulder: null,
      elbowExtensionDeg: null,
      followThroughLength: null,
      followThroughContinuation: null,
      maxElbowLockDeg: null,
      settleTimeMs: null,
      smoothness: null,
      shoulderQuietRatio: null,
    },
    releaseElbowAngle: releaseAngle,
    peakSpeed: 0,
    followThrough: 0,
    groups: {
      timing: {
        aimHoldMs: null,
        backswingMs: null,
        forwardStrokeMs: null,
        releaseProxyMs: null,
        settleTimeMs: null,
        totalMotionMs: null,
        backswingToForwardRatio: null,
      },
      delivery: {
        peakSpeed: 0,
        timeToPeakMs: null,
        meanAcceleration: null,
        peakAcceleration: null,
        peakLocationRatio: null,
        smoothness: null,
        hitchCount: null,
      },
      geometry: {
        cockedElbowDeg: null,
        releaseElbowDeg: releaseAngle,
        maxElbowLockDeg: null,
        elbowExtensionDeg: null,
        forearmElevationDeg: null,
        upperArmElevationDeg: null,
        elbowAnchorDrift: null,
        releasePoint: null,
      },
      path: {
        backswingLength: null,
        forwardStrokeLength: null,
        followThroughLength: null,
        directness: null,
        maxDeviation: null,
        curvature: null,
        followThroughContinuation: null,
      },
      body: {
        aimWristSway: null,
        shoulderDrift: null,
        headDrift: null,
        torsoSway: null,
        torsoLeanDeg: null,
        outOfPlaneMotion: null,
      },
      hand: {
        handAngleDeg: null,
        wristSnapDeg: null,
        confidence: null,
      },
    },
    captureQuality,
    phaseMarkers: {
      aimStartMs: null,
      motionStartMs: 0,
      rearMs: null,
      releaseProxyMs: 0,
      settleMs: null,
    },
    trajectory: [],
    insight,
    insights: [insight],
  };
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (Math.abs(mean) < 1e-6) {
    return 0;
  }
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return (Math.sqrt(variance) / Math.abs(mean)) * 100;
}

function buildDriftHeadline(variability: MetricVariability): string {
  const entries: { label: string; cv: number; advice: string }[] = [
    {
      label: 'release angle',
      cv: variability.releaseElbowCv,
      advice: 'Focus on matching your elbow angle each throw.',
    },
    {
      label: 'peak speed',
      cv: variability.peakSpeedCv,
      advice: 'Try to repeat the same acceleration each dart.',
    },
    {
      label: 'stroke timing',
      cv: variability.strokeTimeCv,
      advice: 'Keep a steady rhythm from backswing to release.',
    },
    {
      label: 'follow-through',
      cv: variability.followThroughCv,
      advice: 'Finish each throw the same distance past release.',
    },
  ];

  entries.sort((a, b) => b.cv - a.cv);
  const top = entries[0];
  if (!top || top.cv < 5) {
    return 'Your valid throw signatures stayed tight on these measures.';
  }
  return `Most drift: ${top.label} (${top.cv.toFixed(0)}% variation). ${top.advice}`;
}

export function computeRoundSummary(
  throwingHand: ThrowingHand,
  darts: DartMetrics[],
  facingMode: CameraFacingMode,
): RoundSummary {
  const validDarts = darts.filter(
    (dart) =>
      dart.analysisStatus === 'complete' &&
      dart.captureQuality.grade !== 'low',
  );
  const aggregateDarts = validDarts.length > 0 ? validDarts : darts;
  const avgElbowAngle =
    aggregateDarts.reduce(
      (sum, dart) => sum + dart.releaseElbowAngle,
      0,
    ) / aggregateDarts.length;
  const avgPeakSpeed =
    aggregateDarts.reduce((sum, dart) => sum + dart.peakSpeed, 0) /
    aggregateDarts.length;

  const angles = aggregateDarts.map((dart) => dart.releaseElbowAngle);
  const comparison = computeRoundComparison(darts);

  let consistencyLabel: string;
  if (comparison.band === 'tight') {
    consistencyLabel =
      'The measured timing, path, and release geometry matched tightly.';
  } else if (comparison.band === 'mixed') {
    consistencyLabel =
      'Some parts of the motion repeated closely while others drifted.';
  } else {
    consistencyLabel =
      'More than one measured part of the motion varied across the round.';
  }

  const tempoMs: number[] = [];
  for (let i = 1; i < darts.length; i++) {
    tempoMs.push(darts[i].peakTimestamp - darts[i - 1].peakTimestamp);
  }

  const metricVariability: MetricVariability = {
    releaseElbowCv: coefficientOfVariation(angles),
    peakSpeedCv: coefficientOfVariation(
      aggregateDarts.map((dart) => dart.peakSpeed),
    ),
    strokeTimeCv: coefficientOfVariation(
      aggregateDarts
        .map((dart) => dart.phases.forwardStrokeMs)
        .filter((value): value is number => value !== null),
    ),
    followThroughCv: coefficientOfVariation(
      aggregateDarts
        .map((dart) => dart.phases.followThroughLength ?? dart.followThrough)
        .filter((value) => value > 0),
    ),
  };

  return {
    throwingHand,
    facingMode,
    darts,
    avgElbowAngle,
    avgPeakSpeed,
    consistencyLabel,
    driftHeadline: buildDriftHeadline(metricVariability),
    tempoMs,
    metricVariability,
    comparison,
    personalBaseline: null,
  };
}
