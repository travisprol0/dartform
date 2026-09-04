import type {
  DartMetrics,
  RoundComparison,
} from '../types/round';

type DartPair = [DartMetrics, DartMetrics];
type TimedValue = { timeMs: number; value: number };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function range(values: number[]): number | null {
  return values.length > 1 ? Math.max(...values) - Math.min(...values) : null;
}

function pairs(darts: DartMetrics[]): DartPair[] {
  const result: DartPair[] = [];
  for (let first = 0; first < darts.length; first++) {
    for (let second = first + 1; second < darts.length; second++) {
      result.push([darts[first], darts[second]]);
    }
  }
  return result;
}

function normalizedTime(
  timeMs: number,
  minTime: number,
  releaseTime: number,
  maxTime: number,
): number {
  if (timeMs <= releaseTime) {
    return -(releaseTime - timeMs) / Math.max(releaseTime - minTime, 1);
  }
  return (timeMs - releaseTime) / Math.max(maxTime - releaseTime, 1);
}

function alignedSeries(
  points: TimedValue[],
  releaseTime: number,
  outputLength = 31,
): number[] {
  const minTime = Math.min(...points.map((point) => point.timeMs));
  const maxTime = Math.max(...points.map((point) => point.timeMs));
  const normalized = points
    .map((point) => ({
      time: normalizedTime(
        point.timeMs,
        minTime,
        releaseTime,
        maxTime,
      ),
      value: point.value,
    }))
    .sort((left, right) => left.time - right.time);

  return Array.from({ length: outputLength }, (_, outputIndex) => {
    const target = -1 + (outputIndex / Math.max(outputLength - 1, 1)) * 2;
    const upperIndex = normalized.findIndex((point) => point.time >= target);
    if (upperIndex < 0) {
      return normalized[normalized.length - 1].value;
    }
    if (upperIndex === 0) {
      return normalized[0].value;
    }
    const lower = normalized[upperIndex - 1];
    const upper = normalized[upperIndex];
    const span = Math.max(upper.time - lower.time, 1e-6);
    const fraction = (target - lower.time) / span;
    return lower.value + (upper.value - lower.value) * fraction;
  });
}

function seriesSimilarity(
  first: TimedValue[],
  second: TimedValue[],
  firstReleaseTime: number,
  secondReleaseTime: number,
): number | null {
  if (first.length < 2 || second.length < 2) {
    return null;
  }
  const left = alignedSeries(first, firstReleaseTime);
  const right = alignedSeries(second, secondReleaseTime);
  const scale = Math.max(
    ...left.map(Math.abs),
    ...right.map(Math.abs),
    1e-6,
  );
  const rmse = Math.sqrt(
    mean(left.map((value, index) => (value - right[index]) ** 2)),
  );
  return Math.round((1 - clamp01(rmse / scale)) * 100);
}

function speedSimilarity(
  first: DartMetrics,
  second: DartMetrics,
): number | null {
  const firstEnd =
    first.phaseMarkers.settleMs ?? first.phaseMarkers.releaseProxyMs;
  const secondEnd =
    second.phaseMarkers.settleMs ?? second.phaseMarkers.releaseProxyMs;
  return seriesSimilarity(
    first.speedProfile
      .filter((point) => point.timeMs >= 0 && point.timeMs <= firstEnd)
      .map((point) => ({
        timeMs: point.timeMs,
        value: point.speed,
      })),
    second.speedProfile
      .filter((point) => point.timeMs >= 0 && point.timeMs <= secondEnd)
      .map((point) => ({
        timeMs: point.timeMs,
        value: point.speed,
      })),
    first.phaseMarkers.releaseProxyMs,
    second.phaseMarkers.releaseProxyMs,
  );
}

function trajectorySimilarity(
  first: DartMetrics,
  second: DartMetrics,
): number | null {
  const firstEnd =
    first.phaseMarkers.settleMs ?? first.phaseMarkers.releaseProxyMs;
  const secondEnd =
    second.phaseMarkers.settleMs ?? second.phaseMarkers.releaseProxyMs;
  const firstTrajectory = first.trajectory.filter(
    (point) => point.timeMs >= 0 && point.timeMs <= firstEnd,
  );
  const secondTrajectory = second.trajectory.filter(
    (point) => point.timeMs >= 0 && point.timeMs <= secondEnd,
  );
  const xSimilarity = seriesSimilarity(
    firstTrajectory.map((point) => ({
      timeMs: point.timeMs,
      value: point.x,
    })),
    secondTrajectory.map((point) => ({
      timeMs: point.timeMs,
      value: point.x,
    })),
    first.phaseMarkers.releaseProxyMs,
    second.phaseMarkers.releaseProxyMs,
  );
  const ySimilarity = seriesSimilarity(
    firstTrajectory.map((point) => ({
      timeMs: point.timeMs,
      value: point.y,
    })),
    secondTrajectory.map((point) => ({
      timeMs: point.timeMs,
      value: point.y,
    })),
    first.phaseMarkers.releaseProxyMs,
    second.phaseMarkers.releaseProxyMs,
  );
  return xSimilarity !== null && ySimilarity !== null
    ? Math.round((xSimilarity + ySimilarity) / 2)
    : null;
}

function averagePairSimilarity(
  darts: DartMetrics[],
  compare: (first: DartMetrics, second: DartMetrics) => number | null,
): number | null {
  const similarities = pairs(darts)
    .map(([first, second]) => compare(first, second))
    .filter((value): value is number => value !== null);
  return similarities.length > 0 ? Math.round(mean(similarities)) : null;
}

function releasePointDistance(
  first: DartMetrics,
  second: DartMetrics,
): number | null {
  const firstPoint = first.groups.geometry.releasePoint;
  const secondPoint = second.groups.geometry.releasePoint;
  if (!firstPoint || !secondPoint) {
    return null;
  }
  return Math.hypot(
    firstPoint.x - secondPoint.x,
    firstPoint.y - secondPoint.y,
  );
}

function pairDistance(first: DartMetrics, second: DartMetrics): number {
  const angle =
    Math.abs(first.releaseElbowAngle - second.releaseElbowAngle) / 8;
  const speedScale = Math.max(
    (first.peakSpeed + second.peakSpeed) / 2,
    1e-6,
  );
  const speed = Math.abs(first.peakSpeed - second.peakSpeed) / speedScale / 0.15;
  const firstStroke = first.groups.timing.forwardStrokeMs;
  const secondStroke = second.groups.timing.forwardStrokeMs;
  const timing =
    firstStroke !== null && secondStroke !== null
      ? Math.abs(firstStroke - secondStroke) / 80
      : 0;
  const releasePoint = (releasePointDistance(first, second) ?? 0) / 0.15;
  return angle + speed + timing + releasePoint;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function outlierDetails(
  darts: DartMetrics[],
): { dart: number | null; metric: string | null } {
  if (darts.length < 3) {
    return { dart: null, metric: null };
  }

  const angleMedian = median(darts.map((dart) => dart.releaseElbowAngle));
  const speedMedian = median(darts.map((dart) => dart.peakSpeed));
  const strokeValues = darts
    .map((dart) => dart.groups.timing.forwardStrokeMs)
    .filter((value): value is number => value !== null);
  const strokeMedian = strokeValues.length > 0 ? median(strokeValues) : null;

  const scored = darts.map((dart) => {
    const dimensions = [
      {
        label: 'release angle',
        score: Math.abs(dart.releaseElbowAngle - angleMedian) / 8,
      },
      {
        label: 'peak speed',
        score:
          Math.abs(dart.peakSpeed - speedMedian) /
          Math.max(speedMedian * 0.15, 1e-6),
      },
      {
        label: 'stroke timing',
        score:
          strokeMedian !== null &&
          dart.groups.timing.forwardStrokeMs !== null
            ? Math.abs(
                dart.groups.timing.forwardStrokeMs - strokeMedian,
              ) / 80
            : 0,
      },
    ];
    dimensions.sort((left, right) => right.score - left.score);
    return {
      dart: dart.dartNumber,
      score: dimensions.reduce((sum, dimension) => sum + dimension.score, 0),
      metric: dimensions[0].label,
    };
  });
  scored.sort((left, right) => right.score - left.score);
  return scored[0].score > 0.75
    ? { dart: scored[0].dart, metric: scored[0].metric }
    : { dart: null, metric: null };
}

export function computeRoundComparison(
  darts: DartMetrics[],
): RoundComparison {
  const comparableDarts = darts.filter(
    (dart) =>
      dart.analysisStatus === 'complete' &&
      dart.captureQuality.grade !== 'low',
  );
  const excludedDartNumbers = darts
    .filter((dart) => !comparableDarts.includes(dart))
    .map((dart) => dart.dartNumber);
  if (comparableDarts.length < 2) {
    return {
      comparedDartCount: comparableDarts.length,
      excludedDartNumbers,
      releasePointSpread: null,
      releaseAngleSpread: 0,
      timingSpreadMs: null,
      speedSimilarity: null,
      pathSimilarity: null,
      closestPair: null,
      outlierDart: null,
      outlierMetric: null,
      band: 'mixed',
      headline: 'Not enough high-confidence darts for a fair comparison.',
    };
  }

  const angles = comparableDarts.map((dart) => dart.releaseElbowAngle);
  const releaseAngleSpread = range(angles) ?? 0;
  const releaseDistances = pairs(comparableDarts)
    .map(([first, second]) => releasePointDistance(first, second))
    .filter((value): value is number => value !== null);
  const releasePointSpread =
    releaseDistances.length > 0 ? Math.max(...releaseDistances) : null;
  const strokeTimes = comparableDarts
    .map((dart) => dart.groups.timing.forwardStrokeMs)
    .filter((value): value is number => value !== null);
  const timingSpreadMs = range(strokeTimes);
  const speedShapeSimilarity = averagePairSimilarity(
    comparableDarts,
    speedSimilarity,
  );
  const pathShapeSimilarity = averagePairSimilarity(
    comparableDarts,
    trajectorySimilarity,
  );

  const dartPairs = pairs(comparableDarts);
  dartPairs.sort(
    ([firstA, secondA], [firstB, secondB]) =>
      pairDistance(firstA, secondA) - pairDistance(firstB, secondB),
  );
  const closestPair = dartPairs[0]
    ? [dartPairs[0][0].dartNumber, dartPairs[0][1].dartNumber] as [
        number,
        number,
      ]
    : null;
  const outlier = outlierDetails(comparableDarts);

  const wideSignals = [
    releaseAngleSpread >= 15,
    releasePointSpread !== null && releasePointSpread >= 0.3,
    timingSpreadMs !== null && timingSpreadMs >= 100,
    speedShapeSimilarity !== null && speedShapeSimilarity < 65,
    pathShapeSimilarity !== null && pathShapeSimilarity < 65,
  ].filter(Boolean).length;
  const tightSignals = [
    releaseAngleSpread < 8,
    releasePointSpread !== null && releasePointSpread < 0.15,
    timingSpreadMs !== null && timingSpreadMs < 50,
    speedShapeSimilarity !== null && speedShapeSimilarity >= 85,
    pathShapeSimilarity !== null && pathShapeSimilarity >= 85,
  ].filter(Boolean).length;
  const band =
    wideSignals >= 2 ? 'wide' : tightSignals >= 3 ? 'tight' : 'mixed';

  let headline = 'The measured throws shared a recognizable motion.';
  if (band === 'tight') {
    headline = 'Your valid throw signatures were tightly matched.';
  } else if (band === 'wide' && outlier.dart !== null) {
    headline = `Dart ${outlier.dart} drifted most in ${outlier.metric}.`;
  } else if (band === 'wide') {
    headline = 'The round varied across more than one part of the motion.';
  }

  return {
    comparedDartCount: comparableDarts.length,
    excludedDartNumbers,
    releasePointSpread,
    releaseAngleSpread,
    timingSpreadMs,
    speedSimilarity: speedShapeSimilarity,
    pathSimilarity: pathShapeSimilarity,
    closestPair,
    outlierDart: outlier.dart,
    outlierMetric: outlier.metric,
    band,
    headline,
  };
}
