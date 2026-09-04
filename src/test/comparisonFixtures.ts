import { computeRoundComparison } from '../analysis/roundComparison';
import type { DartMetrics } from '../types/round';
import { makeAnalyzedDart } from './fixtures';

function warpSpeedProfile(
  profile: DartMetrics['speedProfile'],
  scale: number,
  wobble = 0,
): DartMetrics['speedProfile'] {
  return profile.map((point, index) => ({
    ...point,
    speed: point.speed * scale + (index % 5) * wobble,
  }));
}

function warpTrajectory(
  trajectory: DartMetrics['trajectory'],
  xShift: number,
): DartMetrics['trajectory'] {
  return trajectory.map((point, index) => ({
    ...point,
    x: point.x + xShift + (index % 3) * 0.015,
    y: point.y + xShift * 0.5,
  }));
}

function withoutReleasePoint(dart: DartMetrics): DartMetrics {
  return {
    ...dart,
    groups: {
      ...dart.groups,
      geometry: {
        ...dart.groups.geometry,
        releasePoint: null,
      },
    },
  };
}

export function makeMixedComparisonTriplet(): DartMetrics[] {
  const first = withoutReleasePoint(makeAnalyzedDart(1));
  const baseStroke = first.groups.timing.forwardStrokeMs ?? 180;

  for (let angleHalf = 4; angleHalf <= 8; angleHalf++) {
    for (let timingDelta = 50; timingDelta <= 95; timingDelta += 5) {
      for (const speedScale of [0.45, 0.55, 0.65, 0.75, 0.85]) {
        for (const pathShift of [0.02, 0.04, 0.06, 0.08]) {
          const second = withoutReleasePoint({
            ...makeAnalyzedDart(2),
            releaseElbowAngle: first.releaseElbowAngle + angleHalf,
            peakSpeed: first.peakSpeed * speedScale,
            speedProfile: warpSpeedProfile(first.speedProfile, speedScale, 0.12),
            trajectory: warpTrajectory(first.trajectory, pathShift),
            groups: {
              ...makeAnalyzedDart(2).groups,
              timing: {
                ...makeAnalyzedDart(2).groups.timing,
                forwardStrokeMs: baseStroke + timingDelta,
              },
              geometry: {
                ...makeAnalyzedDart(2).groups.geometry,
                releasePoint: null,
              },
            },
          });
          const third = withoutReleasePoint({
            ...makeAnalyzedDart(3),
            releaseElbowAngle: first.releaseElbowAngle - angleHalf,
            peakSpeed: first.peakSpeed * (2 - speedScale),
            speedProfile: warpSpeedProfile(
              first.speedProfile,
              2 - speedScale,
              0.1,
            ),
            trajectory: warpTrajectory(first.trajectory, -pathShift),
            groups: {
              ...makeAnalyzedDart(3).groups,
              timing: {
                ...makeAnalyzedDart(3).groups.timing,
                forwardStrokeMs: baseStroke,
              },
              geometry: {
                ...makeAnalyzedDart(3).groups.geometry,
                releasePoint: null,
              },
            },
          });

          if (computeRoundComparison([first, second, third]).band === 'mixed') {
            return [first, second, third];
          }
        }
      }
    }
  }

  throw new Error('Could not synthesize a mixed comparison round.');
}
