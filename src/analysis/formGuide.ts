import type { DartMetrics, SpeedPoint, TrajectoryPoint } from '../types/round';

/** Target follow-through length along the delivery line, in forearm lengths. */
export const TARGET_FOLLOW_THROUGH = 0.4;

export function shouldShowFormGuide(dart: DartMetrics): boolean {
  return (
    dart.analysisStatus === 'complete' &&
    dart.captureQuality.grade !== 'low' &&
    dart.speedProfile.length > 1
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeInOut(progress: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp(progress, 0, 1));
}

function guideSpeedAt(
  timeMs: number,
  peak: number,
  rearMs: number,
  releaseMs: number,
  settleMs: number,
): number {
  if (timeMs < 0) {
    return peak * 0.03;
  }
  if (timeMs <= rearMs) {
    const span = Math.max(rearMs, 1);
    return peak * 0.22 * Math.sin(Math.PI * clamp(timeMs / span, 0, 1));
  }
  if (timeMs <= releaseMs) {
    const span = Math.max(releaseMs - rearMs, 1);
    return peak * easeInOut((timeMs - rearMs) / span);
  }
  const span = Math.max(settleMs - releaseMs, 1);
  const decay = easeInOut((timeMs - releaseMs) / span);
  return peak * (0.05 + 0.95 * (1 - decay));
}

export function buildGuideSpeedProfile(dart: DartMetrics): SpeedPoint[] {
  if (!shouldShowFormGuide(dart)) {
    return [];
  }

  const peak = Math.max(dart.peakSpeed, 0.01);
  const rearMs = dart.phaseMarkers.rearMs ?? 0;
  const releaseMs = dart.phaseMarkers.releaseProxyMs;
  const lastTime = dart.speedProfile[dart.speedProfile.length - 1].timeMs;
  const settleMs = dart.phaseMarkers.settleMs ?? lastTime;
  const times = new Set(dart.speedProfile.map((point) => point.timeMs));
  times.add(rearMs);
  times.add(releaseMs);
  times.add(settleMs);

  return [...times]
    .sort((left, right) => left - right)
    .map((timeMs) => ({
      timeMs,
      speed: guideSpeedAt(timeMs, peak, rearMs, releaseMs, settleMs),
    }));
}

function deliveryOrigin(points: TrajectoryPoint[]): TrajectoryPoint {
  const lastPre = [...points]
    .reverse()
    .find((point) => point.phase === 'aim' || point.phase === 'backswing');
  return lastPre ?? points[0];
}

function releasePoint(points: TrajectoryPoint[]): TrajectoryPoint {
  return (
    [...points].reverse().find((point) => point.phase === 'forward') ??
    points[points.length - 1]
  );
}

export function pickFormGuideSource(darts: DartMetrics[]): DartMetrics | null {
  const sources = darts.filter(shouldShowFormGuide);
  if (sources.length === 0) {
    return null;
  }
  const meanPeak =
    sources.reduce((sum, dart) => sum + dart.peakSpeed, 0) / sources.length;
  return sources.reduce((best, dart) =>
    Math.abs(dart.peakSpeed - meanPeak) < Math.abs(best.peakSpeed - meanPeak)
      ? dart
      : best,
  );
}

export function buildRoundGuideSpeedProfile(darts: DartMetrics[]): SpeedPoint[] {
  const sources = darts.filter(shouldShowFormGuide);
  const source = pickFormGuideSource(darts);
  if (!source || sources.length === 0) {
    return [];
  }
  const meanPeak =
    sources.reduce((sum, dart) => sum + dart.peakSpeed, 0) / sources.length;
  return buildGuideSpeedProfile({ ...source, peakSpeed: meanPeak });
}

export function buildRoundGuideTrajectory(
  darts: DartMetrics[],
): TrajectoryPoint[] {
  const source = pickFormGuideSource(darts);
  return source ? buildGuideTrajectory(source) : [];
}

export function buildGuideTrajectory(dart: DartMetrics): TrajectoryPoint[] {
  if (!shouldShowFormGuide(dart) || dart.trajectory.length < 2) {
    return [];
  }

  const points = dart.trajectory;
  const origin = deliveryOrigin(points);
  const release = releasePoint(points);
  const prefix = points.filter(
    (point) => point.phase === 'aim' || point.phase === 'backswing',
  );
  const forwardPoints = points.filter((point) => point.phase === 'forward');
  const finishPoints = points.filter(
    (point) => point.phase === 'followThrough',
  );

  const dx = release.x - origin.x;
  const dy = release.y - origin.y;
  const strokeLength = Math.hypot(dx, dy) || 0.01;
  const unitX = dx / strokeLength;
  const unitY = dy / strokeLength;

  const guidedForward =
    forwardPoints.length > 0
      ? forwardPoints.map((point, index) => {
          const progress =
            forwardPoints.length === 1
              ? 1
              : index / (forwardPoints.length - 1);
          return {
            timeMs: point.timeMs,
            x: origin.x + unitX * strokeLength * progress,
            y: origin.y + unitY * strokeLength * progress,
            phase: 'forward' as const,
          };
        })
      : [
          {
            timeMs: origin.timeMs,
            x: origin.x,
            y: origin.y,
            phase: 'forward' as const,
          },
          {
            timeMs: release.timeMs,
            x: release.x,
            y: release.y,
            phase: 'forward' as const,
          },
        ];

  const lastTime =
    finishPoints[finishPoints.length - 1]?.timeMs ??
    dart.phaseMarkers.settleMs ??
    release.timeMs + 80;
  const finishTimes =
    finishPoints.length > 0
      ? finishPoints.map((point) => point.timeMs)
      : [release.timeMs, lastTime];

  const guidedFinish = finishTimes.map((timeMs, index) => {
    const progress =
      finishTimes.length === 1 ? 1 : index / (finishTimes.length - 1);
    return {
      timeMs,
      x: release.x + unitX * TARGET_FOLLOW_THROUGH * progress,
      y: release.y + unitY * TARGET_FOLLOW_THROUGH * progress,
      phase: 'followThrough' as const,
    };
  });

  return [...prefix, ...guidedForward, ...guidedFinish];
}
