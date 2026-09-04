import { describe, expect, it } from 'vitest';
import { buildCoachingInsight } from './coaching';
import { makeAnalyzedDart } from '../test/fixtures';

describe('buildCoachingInsight', () => {
  it('prioritizes the strongest high-confidence mechanic', () => {
    const dart = makeAnalyzedDart(1);
    const groups = {
      ...dart.groups,
      geometry: {
        ...dart.groups.geometry,
        elbowExtensionDeg: 5,
      },
      path: {
        ...dart.groups.path,
        followThroughLength: 0.1,
      },
    };

    const insight = buildCoachingInsight(groups, {
      ...dart.captureQuality,
      grade: 'high',
      score: 95,
    });

    expect(insight.metricKey).toBe('elbowExtensionDeg');
  });

  it('puts capture quality ahead of biomechanical advice', () => {
    const dart = makeAnalyzedDart(1);
    const insight = buildCoachingInsight(dart.groups, {
      ...dart.captureQuality,
      grade: 'low',
      score: 30,
      reasons: ['The throwing arm was partly obscured.'],
    });

    expect(insight.category).toBe('capture');
    expect(insight.evidence).toContain('obscured');
  });
});
