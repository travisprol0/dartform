import { describe, expect, it } from 'vitest';
import { buildCoachingInsight, collectCoachingInsights } from './coaching';
import { makeAnalyzedDart } from '../test/fixtures';

function highQuality(groups: ReturnType<typeof makeAnalyzedDart>['groups']) {
  const dart = makeAnalyzedDart(1);
  return collectCoachingInsights(groups, {
    ...dart.captureQuality,
    grade: 'high',
    score: 95,
    reasons: [],
  });
}

describe('buildCoachingInsight', () => {
  it('prioritizes the strongest high-confidence mechanic and lists the rest', () => {
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

    const insights = highQuality(groups);
    expect(insights[0].metricKey).toBe('elbowExtensionDeg');
    expect(insights.map((item) => item.metricKey)).toContain(
      'followThroughLength',
    );
    expect(insights[0].action).toContain('accelerating through the release');
    expect(buildCoachingInsight(groups, {
      ...dart.captureQuality,
      grade: 'high',
      score: 95,
      reasons: [],
    }).metricKey).toBe('elbowExtensionDeg');
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
    expect(insight.action).toContain('camera frame');
  });

  it('falls back to generic capture evidence when no reason is provided', () => {
    const dart = makeAnalyzedDart(1);
    const insight = buildCoachingInsight(dart.groups, {
      ...dart.captureQuality,
      grade: 'low',
      score: 20,
      reasons: [],
    });

    expect(insight.evidence).toContain('More tracked frames');
  });

  it('covers timing, path, delivery, and body coaching branches', () => {
    const dart = makeAnalyzedDart(1);
    const base = {
      ...dart.groups,
      timing: {
        ...dart.groups.timing,
        aimHoldMs: 120,
        backswingMs: 80,
      },
      path: {
        ...dart.groups.path,
        followThroughLength: 0.2,
        followThroughContinuation: 0.4,
      },
      delivery: {
        ...dart.groups.delivery,
        hitchCount: 2,
        smoothness: 0.8,
      },
      body: {
        ...dart.groups.body,
        shoulderDrift: 0.4,
      },
      geometry: {
        ...dart.groups.geometry,
        elbowExtensionDeg: 20,
      },
    };

    const insights = highQuality(base);
    expect(insights[0].metricKey).toBe('aimHoldMs');
    expect(insights.map((item) => item.metricKey)).toEqual(
      expect.arrayContaining([
        'aimHoldMs',
        'backswingMs',
        'followThroughLength',
        'followThroughContinuation',
        'hitchCount',
        'shoulderDrift',
      ]),
    );
    expect(insights.map((item) => item.metricKey)).not.toContain('smoothness');

    const smoothnessOnly = {
      ...base,
      timing: { ...base.timing, aimHoldMs: 500, backswingMs: 200 },
      path: {
        ...base.path,
        followThroughLength: 0.5,
        followThroughContinuation: 0.8,
      },
      delivery: { ...base.delivery, hitchCount: 0 },
      body: { ...base.body, shoulderDrift: 0.1 },
    };
    expect(highQuality(smoothnessOnly)[0].metricKey).toBe('smoothness');
  });

  it('returns a clean-motion insight when all mechanics stay in band', () => {
    const dart = makeAnalyzedDart(1);
    const inBandGroups = {
      ...dart.groups,
      timing: {
        ...dart.groups.timing,
        aimHoldMs: 400,
        backswingMs: 200,
      },
      geometry: {
        ...dart.groups.geometry,
        elbowExtensionDeg: 20,
      },
      path: {
        ...dart.groups.path,
        followThroughLength: 0.5,
        followThroughContinuation: 0.8,
      },
      delivery: {
        ...dart.groups.delivery,
        hitchCount: 0,
        smoothness: 0.2,
      },
      body: {
        ...dart.groups.body,
        shoulderDrift: 0.1,
      },
    };
    const insights = highQuality(inBandGroups);

    expect(insights).toHaveLength(1);
    expect(insights[0].metricKey).toBe('repeatMotion');
    expect(insights[0].headline).toBe('Clean motion captured');
    expect(insights[0].action).toContain('repeating this rhythm');
  });
});
