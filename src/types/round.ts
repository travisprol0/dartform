export type ThrowingHand = 'left' | 'right';
export type CameraFacingMode = 'environment' | 'user';

export type SpeedPoint = {
  /** Milliseconds relative to motion start. */
  timeMs: number;
  /** Forearm-lengths per second. */
  speed: number;
};

export type PhaseName =
  | 'aim'
  | 'backswing'
  | 'forward'
  | 'followThrough';

export type TrajectoryPoint = {
  /** Milliseconds relative to motion start. */
  timeMs: number;
  /** Wrist position relative to the starting shoulder, in forearm lengths. */
  x: number;
  y: number;
  phase: PhaseName;
};

export type PhaseMarkers = {
  aimStartMs: number | null;
  motionStartMs: number;
  rearMs: number | null;
  releaseProxyMs: number;
  settleMs: number | null;
};

export type CaptureQualityGrade = 'high' | 'medium' | 'low';

export type CaptureQuality = {
  /** Transparent signal-quality score, not a throw-quality score. */
  score: number;
  grade: CaptureQualityGrade;
  traceCoverage: number;
  meanVisibility: number;
  minVisibility: number;
  frameRate: number;
  frameJitterMs: number;
  maxGapMs: number;
  forearmScaleDrift: number;
  worldCoverage: number;
  handCoverage: number;
  reasons: string[];
};

export type PhaseMetrics = {
  aimHoldMs: number | null;
  aimWristSway: number | null;
  backswingMs: number | null;
  backswingLength: number | null;
  cockedElbowDeg: number | null;
  forwardStrokeMs: number | null;
  peakSpeed: number;
  timeToPeakMs: number | null;
  meanAcceleration: number | null;
  releaseElbowDeg: number;
  forearmElevationDeg: number | null;
  releaseHeightVsShoulder: number | null;
  elbowExtensionDeg: number | null;
  followThroughLength: number | null;
  followThroughContinuation: number | null;
  maxElbowLockDeg: number | null;
  settleTimeMs: number | null;
  smoothness: number | null;
  shoulderQuietRatio: number | null;
};

export type TimingMetrics = {
  aimHoldMs: number | null;
  backswingMs: number | null;
  forwardStrokeMs: number | null;
  releaseProxyMs: number | null;
  settleTimeMs: number | null;
  totalMotionMs: number | null;
  backswingToForwardRatio: number | null;
};

export type DeliveryMetrics = {
  peakSpeed: number;
  timeToPeakMs: number | null;
  meanAcceleration: number | null;
  peakAcceleration: number | null;
  peakLocationRatio: number | null;
  smoothness: number | null;
  hitchCount: number | null;
};

export type ReleasePoint = {
  x: number;
  y: number;
  /** Relative depth from MediaPipe world landmarks, in forearm lengths. */
  z?: number;
};

export type ArmGeometryMetrics = {
  cockedElbowDeg: number | null;
  releaseElbowDeg: number;
  maxElbowLockDeg: number | null;
  elbowExtensionDeg: number | null;
  forearmElevationDeg: number | null;
  upperArmElevationDeg: number | null;
  elbowAnchorDrift: number | null;
  releasePoint: ReleasePoint | null;
};

export type PathMetrics = {
  backswingLength: number | null;
  forwardStrokeLength: number | null;
  followThroughLength: number | null;
  directness: number | null;
  maxDeviation: number | null;
  curvature: number | null;
  followThroughContinuation: number | null;
};

export type BodyControlMetrics = {
  aimWristSway: number | null;
  shoulderDrift: number | null;
  headDrift: number | null;
  torsoSway: number | null;
  torsoLeanDeg: number | null;
  outOfPlaneMotion: number | null;
};

export type HandEstimateMetrics = {
  handAngleDeg: number | null;
  wristSnapDeg: number | null;
  confidence: number | null;
};

export type ThrowMetricGroups = {
  timing: TimingMetrics;
  delivery: DeliveryMetrics;
  geometry: ArmGeometryMetrics;
  path: PathMetrics;
  body: BodyControlMetrics;
  hand: HandEstimateMetrics;
};

export type InsightCategory =
  | 'timing'
  | 'delivery'
  | 'geometry'
  | 'path'
  | 'body'
  | 'capture'
  | 'repeatability';

export type CoachingInsight = {
  category: InsightCategory;
  headline: string;
  evidence: string;
  metricKey: string;
};

export type DartMetrics = {
  dartNumber: number;
  analysisStatus: 'complete' | 'degraded';
  peakTimestamp: number;
  coachingTip: string;
  speedProfile: SpeedPoint[];
  phases: PhaseMetrics;
  /** Release elbow angle in degrees (legacy alias). */
  releaseElbowAngle: number;
  /** Peak speed in forearm-lengths/s (legacy alias). */
  peakSpeed: number;
  /** Follow-through path in forearm-lengths (legacy alias). */
  followThrough: number;
  groups: ThrowMetricGroups;
  captureQuality: CaptureQuality;
  phaseMarkers: PhaseMarkers;
  trajectory: TrajectoryPoint[];
  insight: CoachingInsight;
};

export type MetricVariability = {
  releaseElbowCv: number;
  peakSpeedCv: number;
  strokeTimeCv: number;
  followThroughCv: number;
};

export type RepeatabilityBand = 'tight' | 'mixed' | 'wide';

export type RoundComparison = {
  comparedDartCount: number;
  excludedDartNumbers: number[];
  releasePointSpread: number | null;
  releaseAngleSpread: number;
  timingSpreadMs: number | null;
  speedSimilarity: number | null;
  pathSimilarity: number | null;
  closestPair: [number, number] | null;
  outlierDart: number | null;
  outlierMetric: string | null;
  band: RepeatabilityBand;
  headline: string;
};

export type PersonalBaselineComparison = {
  sampleSize: number;
  signatureMatch: number | null;
  releaseAngleDelta: number | null;
  peakSpeedDelta: number | null;
  strokeTimeDeltaMs: number | null;
  headline: string;
};

export type RoundSummary = {
  throwingHand: ThrowingHand;
  facingMode: CameraFacingMode;
  darts: DartMetrics[];
  avgElbowAngle: number;
  avgPeakSpeed: number;
  consistencyLabel: string;
  driftHeadline: string;
  /** Milliseconds between consecutive throw peaks. */
  tempoMs: number[];
  metricVariability: MetricVariability;
  comparison: RoundComparison;
  personalBaseline: PersonalBaselineComparison | null;
};

export type AppPhase = 'home' | 'capture' | 'results';
