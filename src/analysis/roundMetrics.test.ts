import { describe, expect, it } from 'vitest';
import { computeDartMetrics, computeRoundSummary } from './roundMetrics';
import { makeAnalyzedDart, poseSample } from '../test/fixtures';

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

  it('falls back to degraded metrics when trace analysis fails', () => {
    const buffer = Array.from({ length: 3 }, (_, index) =>
      poseSample(10_000 + index * 33, 0.5, 0.4),
    );
    const metrics = computeDartMetrics(buffer, 1, 1);

    expect(metrics.analysisStatus).toBe('degraded');
    expect(metrics.captureQuality.grade).toBe('low');
    expect(metrics.coachingTip).toContain('Keep the full arm visible');
  });
});
