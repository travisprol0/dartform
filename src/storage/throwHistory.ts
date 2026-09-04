import type {
  CameraFacingMode,
  CoachingInsight,
  DartMetrics,
  PersonalBaselineComparison,
  RoundSummary,
  ThrowingHand,
} from '../types/round';

const STORAGE_KEY = 'dartform.throw-history.v1';
const MAX_STORED_THROWS = 120;
const MIN_BASELINE_THROWS = 9;

type StoredThrowSignature = {
  recordedAt: number;
  throwingHand: ThrowingHand;
  facingMode: CameraFacingMode;
  releaseAngle: number;
  peakSpeed: number;
  strokeTimeMs: number | null;
  followThrough: number | null;
  pathDirectness: number | null;
  captureQuality: number;
};

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage !== undefined;
  } catch {
    return false;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isStoredThrowSignature(
  value: unknown,
): value is StoredThrowSignature {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const entry = value as Partial<StoredThrowSignature>;
  return (
    isFiniteNumber(entry.recordedAt) &&
    (entry.throwingHand === 'left' || entry.throwingHand === 'right') &&
    (entry.facingMode === 'environment' || entry.facingMode === 'user') &&
    isFiniteNumber(entry.releaseAngle) &&
    isFiniteNumber(entry.peakSpeed) &&
    isNullableNumber(entry.strokeTimeMs) &&
    isNullableNumber(entry.followThrough) &&
    isNullableNumber(entry.pathDirectness) &&
    isFiniteNumber(entry.captureQuality)
  );
}

function loadHistory(): StoredThrowSignature[] {
  if (!storageAvailable()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isStoredThrowSignature)
      : [];
  } catch {
    return [];
  }
}

function saveHistory(history: StoredThrowSignature[]): void {
  if (!storageAvailable()) {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(history.slice(-MAX_STORED_THROWS)),
    );
  } catch {
    // Private browsing and storage quotas should not block a completed round.
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function medianAbsoluteDeviation(values: number[], center: number): number {
  return median(values.map((value) => Math.abs(value - center)));
}

function mean(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function validBaseline(
  throwingHand: ThrowingHand,
  facingMode: CameraFacingMode,
): StoredThrowSignature[] {
  return loadHistory()
    .filter(
      (entry) =>
        entry.throwingHand === throwingHand &&
        entry.facingMode === facingMode &&
        entry.captureQuality >= 55,
    )
    .slice(-60);
}

function roundAverages(darts: DartMetrics[]): {
  releaseAngle: number;
  peakSpeed: number;
  strokeTimeMs: number | null;
} {
  const validDarts = darts.filter(
    (dart) =>
      dart.analysisStatus === 'complete' &&
      dart.captureQuality.grade !== 'low',
  );
  const source = validDarts.length > 0 ? validDarts : darts;
  const strokeTimes = source
    .map((dart) => dart.groups.timing.forwardStrokeMs)
    .filter((value): value is number => value !== null);
  return {
    releaseAngle:
      source.reduce((sum, dart) => sum + dart.releaseElbowAngle, 0) /
      Math.max(source.length, 1),
    peakSpeed:
      source.reduce((sum, dart) => sum + dart.peakSpeed, 0) /
      Math.max(source.length, 1),
    strokeTimeMs: mean(strokeTimes),
  };
}

export function personalizedInsightForDart(
  throwingHand: ThrowingHand,
  facingMode: CameraFacingMode,
  dart: DartMetrics,
): CoachingInsight | null {
  if (
    dart.analysisStatus !== 'complete' ||
    dart.captureQuality.grade === 'low'
  ) {
    return null;
  }
  const history = validBaseline(throwingHand, facingMode);
  if (history.length < MIN_BASELINE_THROWS) {
    return null;
  }
  const minimumDimensionSamples = Math.min(
    MIN_BASELINE_THROWS,
    Math.max(5, Math.ceil(history.length * 0.7)),
  );

  const dimensions = [
    {
      metricKey: 'releaseElbowDeg',
      category: 'geometry' as const,
      label: 'Release-proxy angle',
      current: dart.groups.geometry.releaseElbowDeg,
      history: history.map((entry) => entry.releaseAngle),
      minimumScale: 3,
      digits: 1,
      unit: '°',
      headline: 'Match your usual elbow position',
    },
    {
      metricKey: 'peakSpeed',
      category: 'delivery' as const,
      label: 'Relative wrist speed',
      current: dart.groups.delivery.peakSpeed,
      history: history.map((entry) => entry.peakSpeed),
      minimumScale: Math.max(dart.groups.delivery.peakSpeed * 0.08, 0.1),
      digits: 1,
      unit: ' forearms/s',
      headline: 'Match your usual acceleration',
    },
    {
      metricKey: 'forwardStrokeMs',
      category: 'timing' as const,
      label: 'Forward stroke',
      current: dart.groups.timing.forwardStrokeMs,
      history: history
        .map((entry) => entry.strokeTimeMs)
        .filter((value): value is number => value !== null),
      minimumScale: 30,
      digits: 0,
      unit: ' ms',
      headline: 'Return to your usual stroke rhythm',
    },
    {
      metricKey: 'followThroughLength',
      category: 'path' as const,
      label: 'Follow-through',
      current: dart.groups.path.followThroughLength,
      history: history
        .map((entry) => entry.followThrough)
        .filter((value): value is number => value !== null),
      minimumScale: 0.08,
      digits: 2,
      unit: ' forearms',
      headline: 'Match your usual finish',
    },
    {
      metricKey: 'pathDirectness',
      category: 'path' as const,
      label: 'Path directness',
      current: dart.groups.path.directness,
      history: history
        .map((entry) => entry.pathDirectness)
        .filter((value): value is number => value !== null),
      minimumScale: 0.06,
      digits: 0,
      unit: '%',
      headline: 'Return to your usual delivery path',
    },
  ]
    .filter(
      (dimension) =>
        dimension.current !== null &&
        dimension.history.length >= minimumDimensionSamples,
    )
    .map((dimension) => {
      const center = median(dimension.history);
      const scale = Math.max(
        medianAbsoluteDeviation(dimension.history, center) * 1.4826,
        dimension.minimumScale,
      );
      const current =
        dimension.metricKey === 'pathDirectness'
          ? (dimension.current ?? 0) * 100
          : (dimension.current ?? 0);
      const comparableCenter =
        dimension.metricKey === 'pathDirectness' ? center * 100 : center;
      const comparableScale =
        dimension.metricKey === 'pathDirectness' ? scale * 100 : scale;
      return {
        ...dimension,
        center: comparableCenter,
        delta: current - comparableCenter,
        deviation: Math.abs(current - comparableCenter) / comparableScale,
      };
    })
    .sort((left, right) => right.deviation - left.deviation);

  const largest = dimensions[0];
  if (!largest || largest.deviation < 1.25) {
    return null;
  }
  const direction = largest.delta >= 0 ? 'higher' : 'lower';
  return {
    category: 'repeatability',
    metricKey: largest.metricKey,
    headline: largest.headline,
    evidence: `${largest.label} was ${Math.abs(largest.delta).toFixed(largest.digits)}${largest.unit} ${direction} than your median.`,
  };
}

export function compareWithPersonalBaseline(
  throwingHand: ThrowingHand,
  facingMode: CameraFacingMode,
  darts: DartMetrics[],
): PersonalBaselineComparison | null {
  const history = validBaseline(throwingHand, facingMode);
  if (history.length < MIN_BASELINE_THROWS) {
    return null;
  }

  const current = roundAverages(darts);
  const releaseValues = history.map((entry) => entry.releaseAngle);
  const speedValues = history.map((entry) => entry.peakSpeed);
  const strokeValues = history
    .map((entry) => entry.strokeTimeMs)
    .filter((value): value is number => value !== null);
  const releaseCenter = median(releaseValues);
  const speedCenter = median(speedValues);
  const strokeCenter =
    strokeValues.length >= MIN_BASELINE_THROWS
      ? median(strokeValues)
      : null;
  const releaseDelta = current.releaseAngle - releaseCenter;
  const speedDelta = current.peakSpeed - speedCenter;
  const strokeDelta =
    current.strokeTimeMs !== null && strokeCenter !== null
      ? current.strokeTimeMs - strokeCenter
      : null;

  const dimensions = [
    {
      label: 'release angle',
      delta: releaseDelta,
      scale: Math.max(
        medianAbsoluteDeviation(releaseValues, releaseCenter) * 1.4826,
        3,
      ),
      unit: '°',
    },
    {
      label: 'wrist speed',
      delta: speedDelta,
      scale: Math.max(
        medianAbsoluteDeviation(speedValues, speedCenter) * 1.4826,
        Math.max(speedCenter * 0.08, 0.1),
      ),
      unit: '',
    },
    ...(strokeDelta !== null && strokeCenter !== null
      ? [
          {
            label: 'stroke time',
            delta: strokeDelta,
            scale: Math.max(
              medianAbsoluteDeviation(strokeValues, strokeCenter) * 1.4826,
              30,
            ),
            unit: ' ms',
          },
        ]
      : []),
  ];
  const normalizedDistance = mean(
    dimensions.map((dimension) =>
      Math.min(Math.abs(dimension.delta) / (dimension.scale * 3), 1),
    ),
  );
  const signatureMatch =
    normalizedDistance === null
      ? null
      : Math.round((1 - normalizedDistance) * 100);

  dimensions.sort(
    (left, right) =>
      Math.abs(right.delta) / right.scale -
      Math.abs(left.delta) / left.scale,
  );
  const largest = dimensions[0];
  let headline = 'This round sat inside your usual motion signature.';
  if (signatureMatch !== null && signatureMatch < 80) {
    const direction = largest.delta >= 0 ? 'higher' : 'lower';
    const precision = largest.label === 'stroke time' ? 0 : 1;
    headline = `${largest.label[0].toUpperCase()}${largest.label.slice(1)} was ${Math.abs(largest.delta).toFixed(precision)}${largest.unit} ${direction} than usual.`;
  }

  return {
    sampleSize: history.length,
    signatureMatch,
    releaseAngleDelta: releaseDelta,
    peakSpeedDelta: speedDelta,
    strokeTimeDeltaMs: strokeDelta,
    headline,
  };
}

export function recordRoundInHistory(round: RoundSummary): void {
  const recordedAt = Date.now();
  const additions: StoredThrowSignature[] = round.darts
    .filter(
      (dart) =>
        dart.analysisStatus === 'complete' &&
        dart.captureQuality.grade !== 'low',
    )
    .map((dart) => ({
      recordedAt,
      throwingHand: round.throwingHand,
      facingMode: round.facingMode,
      releaseAngle: dart.releaseElbowAngle,
      peakSpeed: dart.peakSpeed,
      strokeTimeMs: dart.groups.timing.forwardStrokeMs,
      followThrough: dart.groups.path.followThroughLength,
      pathDirectness: dart.groups.path.directness,
      captureQuality: dart.captureQuality.score,
    }));
  saveHistory([...loadHistory(), ...additions]);
}

export function clearThrowHistory(): void {
  if (!storageAvailable()) {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Clearing history is best-effort when storage access is restricted.
  }
}

export function storedThrowCount(): number {
  return loadHistory().filter((entry) => entry.captureQuality >= 55).length;
}
