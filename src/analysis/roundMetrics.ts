import type {
  DartMetrics,
  MetricVariability,
  RoundSummary,
  ThrowingHand,
} from '../types/round';
import type { PoseSample } from './detectThrow';
import { extractThrowTrace } from './detectThrow';
import { elbowAngle } from './geometry';
import { analyzeThrowTrace } from './throwPhases';

export { elbowAngle } from './geometry';

export function computeDartMetrics(
  buffer: PoseSample[],
  peakIndex: number,
  dartNumber: number,
): DartMetrics {
  const trace = extractThrowTrace(buffer, peakIndex);
  const metrics = analyzeThrowTrace(trace, dartNumber);
  if (metrics) {
    return metrics;
  }

  const peak = buffer[peakIndex];
  const releaseAngle = elbowAngle(peak.shoulder, peak.elbow, peak.wrist);
  return {
    dartNumber,
    peakTimestamp: peak.timestamp,
    coachingTip: 'Throw captured — try to keep your arm in frame for richer stats.',
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
    return 'Your throw signature was tight across all three darts.';
  }
  return `Most drift: ${top.label} (${top.cv.toFixed(0)}% variation). ${top.advice}`;
}

export function computeRoundSummary(
  throwingHand: ThrowingHand,
  darts: DartMetrics[],
): RoundSummary {
  const avgElbowAngle =
    darts.reduce((sum, dart) => sum + dart.releaseElbowAngle, 0) / darts.length;
  const avgPeakSpeed =
    darts.reduce((sum, dart) => sum + dart.peakSpeed, 0) / darts.length;

  const angles = darts.map((dart) => dart.releaseElbowAngle);
  const range = Math.max(...angles) - Math.min(...angles);

  let consistencyLabel: string;
  if (range < 8) {
    consistencyLabel =
      'Very consistent release angles across all three darts.';
  } else if (range < 15) {
    consistencyLabel =
      'Moderately consistent — elbow angle varied a bit between darts.';
  } else {
    consistencyLabel =
      'Release angles varied quite a bit — focus on repeating the same arm position.';
  }

  const tempoMs: number[] = [];
  for (let i = 1; i < darts.length; i++) {
    tempoMs.push(darts[i].peakTimestamp - darts[i - 1].peakTimestamp);
  }

  const metricVariability: MetricVariability = {
    releaseElbowCv: coefficientOfVariation(angles),
    peakSpeedCv: coefficientOfVariation(darts.map((dart) => dart.peakSpeed)),
    strokeTimeCv: coefficientOfVariation(
      darts
        .map((dart) => dart.phases.forwardStrokeMs)
        .filter((value): value is number => value !== null),
    ),
    followThroughCv: coefficientOfVariation(
      darts
        .map((dart) => dart.phases.followThroughLength ?? dart.followThrough)
        .filter((value) => value > 0),
    ),
  };

  return {
    throwingHand,
    darts,
    avgElbowAngle,
    avgPeakSpeed,
    consistencyLabel,
    driftHeadline: buildDriftHeadline(metricVariability),
    tempoMs,
    metricVariability,
  };
}
