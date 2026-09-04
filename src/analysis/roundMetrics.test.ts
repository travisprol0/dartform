import { describe, expect, it } from 'vitest';
import { computeDartMetrics, computeRoundSummary } from './roundMetrics';
import { makeAnalyzedDart, poseSample } from '../test/fixtures';
import { makeMixedComparisonTriplet } from '../test/comparisonFixtures';

describe('round metrics', () => {
  it('summarizes a tight three-dart round', () => {
    const darts = [
      makeAnalyzedDart(1),
      makeAnalyzedDart(2, 0.002),
      makeAnalyzedDart(3, -0.002),
    ];
    const summary = computeRoundSummary('right', darts, 'environment');

    expect(summary.darts).toHaveLength(3);
    expect(summary.comparison.band).toBe('tight');
    expect(summary.tempoMs).toHaveLength(2);
    expect(summary.driftHeadline).toContain('tight');
  });

  it('describes wide rounds and low-confidence aggregate summaries', () => {
    const darts = [
      makeAnalyzedDart(1),
      makeAnalyzedDart(2, 0.005),
      makeAnalyzedDart(3, 0.4, 1.25),
    ];
    const summary = computeRoundSummary('right', darts, 'environment');

    expect(summary.comparison.band).toBe('wide');
    expect(summary.consistencyLabel).toContain('varied across the round');
  });

  it('labels mixed rounds when repeatability is neither tight nor wide', () => {
    const darts = makeMixedComparisonTriplet();
    const summary = computeRoundSummary('right', darts, 'environment');

    expect(summary.comparison.band).toBe('mixed');
    expect(summary.consistencyLabel).toContain('Some parts');
  });

  it('falls back to degraded metrics when trace analysis fails', () => {
    const buffer = Array.from({ length: 3 }, (_, index) =>
      poseSample(10_000 + index * 33, 0.5, 0.4),
    );
    const metrics = computeDartMetrics(buffer, 1, 1);

    expect(metrics.analysisStatus).toBe('degraded');
    expect(metrics.captureQuality.grade).not.toBe('high');
    expect(metrics.coachingTip).toContain('Keep the full arm visible');
  });
});
