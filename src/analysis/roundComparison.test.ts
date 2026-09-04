import { describe, expect, it } from 'vitest';
import { computeRoundComparison } from './roundComparison';
import { makeAnalyzedDart } from '../test/fixtures';
import { makeMixedComparisonTriplet } from '../test/comparisonFixtures';

describe('computeRoundComparison', () => {
  it('recognizes tightly matched throw signatures', () => {
    const comparison = computeRoundComparison([
      makeAnalyzedDart(1),
      makeAnalyzedDart(2, 0.002),
      makeAnalyzedDart(3, -0.002),
    ]);

    expect(comparison.band).toBe('tight');
    expect(comparison.speedSimilarity ?? 0).toBeGreaterThan(90);
    expect(comparison.pathSimilarity ?? 0).toBeGreaterThan(90);
    expect(comparison.closestPair).not.toBeNull();
  });

  it('identifies an outlier and its largest drift dimension', () => {
    const comparison = computeRoundComparison([
      makeAnalyzedDart(1),
      makeAnalyzedDart(2, 0.005),
      makeAnalyzedDart(3, 0.4, 1.25),
    ]);

    expect(comparison.band).toBe('wide');
    expect(comparison.outlierDart).toBe(3);
    expect(comparison.outlierMetric).not.toBeNull();
  });

  it('aligns shape comparisons by phase time instead of frame count', () => {
    const first = makeAnalyzedDart(1);
    const denserBeforeRelease = {
      ...first,
      dartNumber: 2,
      speedProfile: first.speedProfile.flatMap((point) =>
        point.timeMs >= 0 &&
        point.timeMs < first.phaseMarkers.releaseProxyMs
          ? [
              point,
              { ...point, timeMs: point.timeMs + 1 },
              { ...point, timeMs: point.timeMs + 2 },
            ]
          : [point],
      ),
      trajectory: first.trajectory.flatMap((point) =>
        point.timeMs >= 0 &&
        point.timeMs < first.phaseMarkers.releaseProxyMs
          ? [
              point,
              { ...point, timeMs: point.timeMs + 1 },
              { ...point, timeMs: point.timeMs + 2 },
            ]
          : [point],
      ),
    };
    const third = { ...first, dartNumber: 3 };
    const comparison = computeRoundComparison([
      first,
      denserBeforeRelease,
      third,
    ]);

    expect(comparison.speedSimilarity ?? 0).toBeGreaterThan(95);
    expect(comparison.pathSimilarity ?? 0).toBeGreaterThan(95);
  });

  it('reports darts excluded from confidence-based comparison', () => {
    const first = makeAnalyzedDart(1);
    const second = makeAnalyzedDart(2);
    const excluded = {
      ...makeAnalyzedDart(3),
      analysisStatus: 'degraded' as const,
    };
    const comparison = computeRoundComparison([first, second, excluded]);

    expect(comparison.comparedDartCount).toBe(2);
    expect(comparison.excludedDartNumbers).toEqual([3]);
  });

  it('returns a fair-comparison fallback when too few darts qualify', () => {
    const comparison = computeRoundComparison([
      makeAnalyzedDart(1),
      {
        ...makeAnalyzedDart(2),
        captureQuality: {
          ...makeAnalyzedDart(2).captureQuality,
          grade: 'low',
        },
      },
    ]);

    expect(comparison.comparedDartCount).toBe(1);
    expect(comparison.headline).toContain('Not enough high-confidence darts');
    expect(comparison.speedSimilarity).toBeNull();
  });

  it('describes wide rounds without a single outlier dart', () => {
    const comparison = computeRoundComparison([
      makeAnalyzedDart(1),
      makeAnalyzedDart(2, 0.06),
      makeAnalyzedDart(3, -0.05),
    ]);

    expect(comparison.band).toBe('wide');
    expect(comparison.headline).toMatch(/varied|drifted/);
  });

  it('classifies partially aligned rounds as mixed', () => {
    const [first, second, third] = makeMixedComparisonTriplet();
    expect(computeRoundComparison([first, second, third]).band).toBe('mixed');
  });

  it('returns null shape similarity for single-point speed profiles', () => {
    const dart = makeAnalyzedDart(1);
    const sparse = {
      ...dart,
      speedProfile: [{ timeMs: 0, speed: 1 }],
      trajectory: [{ timeMs: 0, x: 0, y: 0, phase: 'aim' as const }],
    };
    const comparison = computeRoundComparison([sparse, makeAnalyzedDart(2)]);

    expect(comparison.speedSimilarity).toBeNull();
    expect(comparison.pathSimilarity).toBeNull();
  });
});
