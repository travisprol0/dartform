import type { CaptureQuality } from '../types/round';
import {
  TRACE_AFTER_MS,
  TRACE_BEFORE_MS,
  type ThrowTrace,
} from './detectThrow';
import { dist2d } from './geometry';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function emptyCaptureQuality(reason: string): CaptureQuality {
  return {
    score: 0,
    grade: 'low',
    traceCoverage: 0,
    meanVisibility: 0,
    minVisibility: 0,
    frameRate: 0,
    frameJitterMs: 0,
    maxGapMs: 0,
    forearmScaleDrift: 0,
    worldCoverage: 0,
    handCoverage: 0,
    reasons: [reason],
  };
}

export function computeCaptureQuality(trace: ThrowTrace): CaptureQuality {
  const { samples, peakIndex } = trace;
  const peak = samples[peakIndex];
  if (!peak || samples.length < 2) {
    return emptyCaptureQuality('Not enough tracked frames for full analysis.');
  }

  const beforeCoverage = clamp01(
    (peak.timestamp - samples[0].timestamp) / TRACE_BEFORE_MS,
  );
  const afterCoverage = clamp01(
    (samples[samples.length - 1].timestamp - peak.timestamp) /
      TRACE_AFTER_MS,
  );
  const traceCoverage = (beforeCoverage + afterCoverage) / 2;

  const visibility = samples.map((sample) => clamp01(sample.visibility));
  const meanVisibility = average(visibility);
  const minVisibility = Math.min(...visibility);

  const frameIntervals: number[] = [];
  for (let index = 1; index < samples.length; index++) {
    const interval = samples[index].timestamp - samples[index - 1].timestamp;
    if (interval > 0) {
      frameIntervals.push(interval);
    }
  }
  const meanInterval = average(frameIntervals);
  const frameRate = meanInterval > 0 ? 1000 / meanInterval : 0;
  const frameVariance = average(
    frameIntervals.map((interval) => (interval - meanInterval) ** 2),
  );
  const frameJitterMs = Math.sqrt(frameVariance);
  const maxGapMs =
    frameIntervals.length > 0 ? Math.max(...frameIntervals) : 0;

  const forearmLengths = samples.map((sample) =>
    dist2d(sample.elbow, sample.wrist),
  );
  const meanForearm = average(forearmLengths);
  const forearmScaleDrift =
    meanForearm > 1e-6
      ? (Math.max(...forearmLengths) - Math.min(...forearmLengths)) /
        meanForearm
      : 1;

  const worldCoverage =
    samples.filter((sample) => sample.world !== undefined).length /
    samples.length;
  const handCoverage =
    samples.filter(
      (sample) => sample.index && sample.pinky && sample.thumb,
    ).length / samples.length;

  const frameRateFactor = clamp01(frameRate / 24);
  const jitterFactor = 1 - clamp01(frameJitterMs / 25);
  const gapFactor = 1 - clamp01((maxGapMs - 50) / 150);
  const scaleFactor = 1 - clamp01(forearmScaleDrift / 0.35);
  const score = Math.round(
    traceCoverage * 30 +
      meanVisibility * 25 +
      frameRateFactor * 15 +
      jitterFactor * 10 +
      gapFactor * 10 +
      scaleFactor * 10,
  );

  const reasons: string[] = [];
  if (traceCoverage < 0.85) {
    reasons.push('Part of the aim or follow-through was outside the trace.');
  }
  if (meanVisibility < 0.7 || minVisibility < 0.45) {
    reasons.push('The throwing arm was partly obscured.');
  }
  if (frameRate < 20) {
    reasons.push('Camera tracking was slower than recommended.');
  }
  if (maxGapMs > 120) {
    reasons.push('Tracking dropped frames during the throw.');
  }
  if (forearmScaleDrift > 0.3) {
    reasons.push('Camera angle or depth changed during the throw.');
  }

  return {
    score,
    grade: score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low',
    traceCoverage,
    meanVisibility,
    minVisibility,
    frameRate,
    frameJitterMs,
    maxGapMs,
    forearmScaleDrift,
    worldCoverage,
    handCoverage,
    reasons,
  };
}
