import { describe, expect, it } from 'vitest';
import { analyzeThrowTrace } from './throwPhases';
import { makeThrowTrace } from '../test/fixtures';

describe('analyzeThrowTrace', () => {
  it('finds the quiet aim window and produces grouped mechanics', () => {
    const metrics = analyzeThrowTrace(makeThrowTrace(), 1);

    expect(metrics).not.toBeNull();
    if (!metrics) {
      return;
    }

    expect(metrics.groups.timing.aimHoldMs).not.toBeNull();
    expect(metrics.groups.timing.aimHoldMs ?? 0).toBeGreaterThan(500);
    expect(metrics.groups.timing.backswingMs ?? 0).toBeGreaterThan(0);
    expect(metrics.groups.timing.forwardStrokeMs ?? 0).toBeGreaterThan(0);
    expect(metrics.groups.delivery.peakSpeed).toBeGreaterThan(0);
    expect(metrics.groups.delivery.peakAcceleration).not.toBeNull();
    expect(metrics.groups.geometry.releasePoint).not.toBeNull();
    expect(metrics.groups.path.forwardStrokeLength).not.toBeNull();
    expect(metrics.groups.body.shoulderDrift).not.toBeNull();
    expect(metrics.groups.hand.handAngleDeg).not.toBeNull();
    expect(metrics.phaseMarkers.aimStartMs ?? 0).toBeLessThan(0);
    expect(metrics.phaseMarkers.settleMs).not.toBeNull();
    expect(metrics.trajectory.length).toBeGreaterThan(10);
    expect(
      metrics.trajectory.some((point) => point.phase === 'followThrough'),
    ).toBe(true);
    expect(metrics.captureQuality.traceCoverage).toBeGreaterThan(0.9);
  });

  it('suppresses noisy derivatives and hand estimates on a weak trace', () => {
    const trace = makeThrowTrace();
    trace.samples = trace.samples.map((sample, index) => ({
      ...sample,
      timestamp:
        10_000 + Math.floor(index / 2) * 400 + (index % 2) * 120,
      visibility: 0,
      world: undefined,
      index: undefined,
      pinky: undefined,
      thumb: undefined,
    }));

    const metrics = analyzeThrowTrace(trace, 1);
    expect(metrics).not.toBeNull();
    if (!metrics) {
      return;
    }

    expect(metrics.captureQuality.grade).toBe('low');
    expect(metrics.groups.hand.handAngleDeg).toBeNull();
    expect(metrics.insight.category).toBe('capture');
  });
});
