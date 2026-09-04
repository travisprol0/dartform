import { describe, expect, it } from 'vitest';
import { computeCaptureQuality } from './captureQuality';
import {
  nearestPeakIndex,
  pointVelocities,
  scalarDerivative,
  smoothPoseSamples,
} from './signalProcessing';
import { makeThrowTrace, poseSample } from '../test/fixtures';

describe('signal processing', () => {
  it('uses centered smoothing without moving an isolated peak', () => {
    const samples = [
      poseSample(0, 0, 0.4),
      poseSample(33, 0.1, 0.4),
      poseSample(66, 0.7, 0.4),
      poseSample(99, 0.1, 0.4),
      poseSample(132, 0, 0.4),
    ];
    const smoothed = smoothPoseSamples(samples, 70);
    const speeds = pointVelocities(
      smoothed,
      (sample) => sample.wrist,
    ).map((velocity) => velocity.speed);
    const peak = nearestPeakIndex(smoothed, speeds, 2, 100);

    expect(smoothed[2].wrist.x).toBeLessThan(0.7);
    expect(peak).toBeGreaterThanOrEqual(1);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('calculates time-aware central derivatives', () => {
    const samples = [
      poseSample(0, 0, 0.4),
      poseSample(50, 0.05, 0.4),
      poseSample(150, 0.15, 0.4),
    ];
    const velocities = pointVelocities(samples, (sample) => sample.wrist);
    const acceleration = scalarDerivative(
      velocities.map((velocity) => velocity.speed),
      samples,
    );

    expect(velocities[1].x).toBeCloseTo(1, 4);
    expect(acceleration).toHaveLength(samples.length);
  });
});

describe('capture quality', () => {
  it('scores a complete 30 fps trace separately from a weak trace', () => {
    const complete = makeThrowTrace();
    const completeQuality = computeCaptureQuality(complete);

    const weak = makeThrowTrace();
    weak.samples = weak.samples.map((sample, index) => ({
      ...sample,
      timestamp:
        10_000 + Math.floor(index / 2) * 400 + (index % 2) * 120,
      visibility: 0,
      world: undefined,
      index: undefined,
      pinky: undefined,
      thumb: undefined,
    }));
    const weakQuality = computeCaptureQuality(weak);

    expect(completeQuality.grade).toBe('high');
    expect(completeQuality.traceCoverage).toBeGreaterThan(0.9);
    expect(weakQuality.grade).toBe('low');
    expect(weakQuality.score).toBeLessThan(completeQuality.score);
  });
});

describe('signalProcessing', () => {
  it('smooths pose samples without shifting the array length', () => {
    const samples = Array.from({ length: 5 }, (_, index) =>
      poseSample(10_000 + index * 33, 0.5 + index * 0.01, 0.4),
    );

    const smoothed = smoothPoseSamples(samples, 80);
    expect(smoothed).toHaveLength(samples.length);
    expect(smoothed[2].world).toBeDefined();
  });

  it('returns shallow copies for very short traces', () => {
    const samples = [
      poseSample(10_000, 0.5, 0.4),
      poseSample(10_033, 0.52, 0.41),
    ];
    const smoothed = smoothPoseSamples(samples);
    expect(smoothed).toHaveLength(2);
    expect(smoothed[0]).not.toBe(samples[0]);
  });

  it('derives wrist speed from pose motion', () => {
    const samples = Array.from({ length: 4 }, (_, index) =>
      poseSample(10_000 + index * 100, 0.5 + index * 0.05, 0.4),
    );
    const velocities = pointVelocities(samples, (sample) => sample.wrist);

    expect(velocities[1].speed).toBeGreaterThan(0);
    expect(velocities[0].x).not.toBe(0);
  });

  it('finds the nearest local peak within a time radius', () => {
    const samples = [0, 1, 2, 3, 4].map((index) =>
      poseSample(10_000 + index * 100, 0.5, 0.4),
    );
    const values = [1, 2, 5, 3, 1];
    const peakIndex = nearestPeakIndex(samples, values, 1, 250);

    expect(peakIndex).toBe(2);
    expect(scalarDerivative(values, samples)[2]).toBeGreaterThan(0);
  });
});
