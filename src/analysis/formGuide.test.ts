import { describe, expect, it } from 'vitest';
import { makeAnalyzedDart, makeSparseDart } from '../test/fixtures';
import {
  TARGET_FOLLOW_THROUGH,
  buildGuideSpeedProfile,
  buildGuideTrajectory,
  buildRoundGuideSpeedProfile,
  buildRoundGuideTrajectory,
  shouldShowFormGuide,
} from './formGuide';

describe('formGuide', () => {
  it('builds a single-peak speed template aligned to the throw', () => {
    const dart = makeAnalyzedDart(1);
    const guide = buildGuideSpeedProfile(dart);

    expect(shouldShowFormGuide(dart)).toBe(true);
    expect(guide.length).toBeGreaterThan(2);
    const releasePoint = guide.find(
      (point) => point.timeMs === dart.phaseMarkers.releaseProxyMs,
    );
    expect(releasePoint?.speed).toBeCloseTo(dart.peakSpeed, 5);
    expect(Math.max(...guide.map((point) => point.speed))).toBeCloseTo(
      dart.peakSpeed,
      5,
    );
  });

  it('extends the delivery line with a target follow-through', () => {
    const dart = makeAnalyzedDart(1);
    const guide = buildGuideTrajectory(dart);
    const release = [...guide]
      .reverse()
      .find((point) => point.phase === 'forward');
    const finish = guide[guide.length - 1];

    expect(guide.length).toBeGreaterThan(2);
    expect(release).toBeDefined();
    if (!release) {
      return;
    }

    const finishLength = Math.hypot(finish.x - release.x, finish.y - release.y);
    expect(finish.phase).toBe('followThrough');
    expect(finishLength).toBeCloseTo(TARGET_FOLLOW_THROUGH, 2);
  });

  it('skips the guide on low-confidence or empty captures', () => {
    const lowQuality = {
      ...makeAnalyzedDart(1),
      captureQuality: {
        ...makeAnalyzedDart(1).captureQuality,
        grade: 'low' as const,
      },
    };
    const sparse = makeSparseDart();

    expect(shouldShowFormGuide(lowQuality)).toBe(false);
    expect(buildGuideSpeedProfile(lowQuality)).toEqual([]);
    expect(buildGuideTrajectory(lowQuality)).toEqual([]);
    expect(shouldShowFormGuide(sparse)).toBe(false);
    expect(buildGuideTrajectory(sparse)).toEqual([]);
  });

  it('builds a round guide from high-confidence darts', () => {
    const darts = [
      makeAnalyzedDart(1),
      makeAnalyzedDart(2, 0.003),
      makeSparseDart(3),
    ];

    expect(buildRoundGuideSpeedProfile(darts).length).toBeGreaterThan(2);
    expect(buildRoundGuideTrajectory(darts).length).toBeGreaterThan(2);
    expect(
      buildRoundGuideSpeedProfile([
        {
          ...makeAnalyzedDart(1),
          captureQuality: {
            ...makeAnalyzedDart(1).captureQuality,
            grade: 'low' as const,
          },
        },
      ]),
    ).toEqual([]);
  });
});
