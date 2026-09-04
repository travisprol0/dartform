import { useState } from 'react';
import type { RoundSummary } from '../types/round';
import {
  buildRoundGuideSpeedProfile,
  buildRoundGuideTrajectory,
} from '../analysis/formGuide';
import { throwingHandLabel } from '../analysis/throwingArm';
import { PhaseTimeline } from '../components/PhaseTimeline';
import { ReleasePointPlot } from '../components/ReleasePointPlot';
import { SpeedSparkline } from '../components/SpeedSparkline';
import { ThrowCard } from '../components/ThrowCard';
import { TrajectoryPlot } from '../components/TrajectoryPlot';
import {
  clearThrowHistory,
  storedThrowCount,
} from '../storage/throwHistory';

type ResultsPageProps = {
  round: RoundSummary;
  onThrowAgain: () => void;
  onDone: () => void;
};

const DART_COLORS = ['#5eead4', '#fbbf24', '#f472b6'];
const GUIDE_STROKE = '#e2e8f0';

export function ResultsPage({ round, onThrowAgain, onDone }: ResultsPageProps) {
  const [historyCount, setHistoryCount] = useState(() => storedThrowCount());
  const armLabel = throwingHandLabel(round.throwingHand);
  const guideSpeed = buildRoundGuideSpeedProfile(round.darts);
  const guidePath = buildRoundGuideTrajectory(round.darts);
  const overlayProfiles = [
    ...round.darts
      .map((dart, index) => ({
        points: dart.speedProfile,
        stroke: DART_COLORS[index % DART_COLORS.length],
        opacity:
          round.comparison.outlierDart !== null &&
          dart.dartNumber !== round.comparison.outlierDart
            ? 0.35
            : 0.9,
      }))
      .filter((profile) => profile.points.length > 1),
    ...(guideSpeed.length > 1
      ? [
          {
            points: guideSpeed,
            stroke: GUIDE_STROKE,
            opacity: 0.95,
            dashed: true,
          },
        ]
      : []),
  ];
  const trajectorySeries = [
    ...round.darts
      .map((dart, index) => ({
        points: dart.trajectory,
        label: `Dart ${dart.dartNumber}`,
        stroke: DART_COLORS[index % DART_COLORS.length],
        opacity:
          round.comparison.outlierDart !== null &&
          dart.dartNumber !== round.comparison.outlierDart
            ? 0.35
            : 0.9,
      }))
      .filter((series) => series.points.length > 1),
    ...(guidePath.length > 1
      ? [
          {
            points: guidePath,
            label: 'Form guide',
            stroke: GUIDE_STROKE,
            opacity: 0.95,
            dashed: true,
          },
        ]
      : []),
  ];
  const releasePointCount = round.darts.filter(
    (dart) => dart.groups.geometry.releasePoint !== null,
  ).length;

  const avgTempo =
    round.tempoMs.length > 0
      ? round.tempoMs.reduce((sum, value) => sum + value, 0) /
        round.tempoMs.length
      : null;
  const averageConfidence =
    round.darts.reduce(
      (sum, dart) => sum + dart.captureQuality.score,
      0,
    ) / round.darts.length;
  const confidenceGrade =
    averageConfidence >= 80
      ? 'high'
      : averageConfidence >= 55
        ? 'medium'
        : 'low';
  const highConfidenceDarts = round.darts.filter(
    (dart) =>
      dart.analysisStatus === 'complete' &&
      dart.captureQuality.grade !== 'low',
  ).length;

  const handleClearHistory = () => {
    if (
      window.confirm(
        'Clear all locally stored throw signatures? This cannot be undone.',
      )
    ) {
      clearThrowHistory();
      setHistoryCount(0);
    }
  };

  return (
    <main className="page page--scroll">
      <h1 className="title title--results">Round complete</h1>
      <p className="subtitle">
        {round.darts.length} darts tracked on your {armLabel} arm
      </p>

      <section className="summary-card round-signature">
        <div className="section-heading-row">
          <div>
            <p className="summary-label">Round signature</p>
            <h2 className="round-headline">{round.comparison.headline}</h2>
          </div>
          <span
            className={`repeatability-badge repeatability-badge--${round.comparison.band}`}
          >
            {round.comparison.band}
          </span>
        </div>

        <div className="summary-metrics">
          <div>
            <span>Elbow at speed peak</span>
            <strong>{round.avgElbowAngle.toFixed(1)}°</strong>
          </div>
          <div>
            <span>Relative wrist speed</span>
            <strong>{round.avgPeakSpeed.toFixed(1)} forearms/s</strong>
          </div>
          {avgTempo !== null ? (
            <div>
              <span>Throw tempo</span>
              <strong>{(avgTempo / 1000).toFixed(1)} s</strong>
            </div>
          ) : null}
        </div>

        <div className="confidence-line">
          <span className={`quality-badge quality-badge--${confidenceGrade}`}>
            {Math.round(averageConfidence)}/100 capture confidence
          </span>
          <span>
            {highConfidenceDarts}/{round.darts.length} darts fully analyzed
          </span>
        </div>

        {round.personalBaseline ? (
          <div className="personal-baseline">
            <p className="summary-label">Compared with your recent throws</p>
            <p className="personal-baseline__score">
              {round.personalBaseline.signatureMatch ?? '—'}% signature match
            </p>
            <p>{round.personalBaseline.headline}</p>
            <p className="personal-baseline__sample">
              Based on {round.personalBaseline.sampleSize} valid throws stored
              on this device.
            </p>
          </div>
        ) : (
          <p className="baseline-progress">
            Keep throwing: after 9 valid darts, comparisons switch from generic
            guides to your personal motion signature.
          </p>
        )}
      </section>

      <section className="comparison-card">
        <h2 className="section-title">Compare darts</h2>
        <p className="section-copy">
          These describe repeatability, not where a dart landed. Lower spreads
          and higher shape matches mean the camera saw a more repeatable motion.
        </p>
        {round.comparison.excludedDartNumbers.length > 0 ? (
          <p className="comparison-exclusion">
            Compared {round.comparison.comparedDartCount} high-confidence{' '}
            {round.comparison.comparedDartCount === 1 ? 'dart' : 'darts'}.
            Excluded{' '}
            {round.comparison.excludedDartNumbers
              .map((dartNumber) => `Dart ${dartNumber}`)
              .join(', ')}.
          </p>
        ) : null}

        <div className="comparison-grid">
          <div>
            <span>Release-angle spread</span>
            <strong>{round.comparison.releaseAngleSpread.toFixed(1)}°</strong>
          </div>
          <div>
            <span>Release-point spread</span>
            <strong>
              {round.comparison.releasePointSpread === null
                ? '—'
                : `${round.comparison.releasePointSpread.toFixed(2)} forearms`}
            </strong>
          </div>
          <div>
            <span>Stroke-time spread</span>
            <strong>
              {round.comparison.timingSpreadMs === null
                ? '—'
                : `${Math.round(round.comparison.timingSpreadMs)} ms`}
            </strong>
          </div>
          <div>
            <span>Speed-shape match</span>
            <strong>
              {round.comparison.speedSimilarity === null
                ? '—'
                : `${round.comparison.speedSimilarity}%`}
            </strong>
          </div>
          <div>
            <span>Path-shape match</span>
            <strong>
              {round.comparison.pathSimilarity === null
                ? '—'
                : `${round.comparison.pathSimilarity}%`}
            </strong>
          </div>
          <div>
            <span>Closest pair</span>
            <strong>
              {round.comparison.closestPair
                ? `Darts ${round.comparison.closestPair[0]} + ${round.comparison.closestPair[1]}`
                : '—'}
            </strong>
          </div>
        </div>

        <div className="phase-comparison">
          <h3>Phase timing</h3>
          {round.darts.map((dart) => (
            <div className="phase-comparison__row" key={dart.dartNumber}>
              <span>D{dart.dartNumber}</span>
              <PhaseTimeline dart={dart} compact />
            </div>
          ))}
        </div>

        {releasePointCount >= 2 ? (
          <div className="comparison-visual">
            <h3>Release-proxy point scatter</h3>
            <ReleasePointPlot
              darts={round.darts}
              colors={DART_COLORS}
              outlierDart={round.comparison.outlierDart}
              width={360}
              height={160}
            />
          </div>
        ) : null}

        {trajectorySeries.length > 0 ? (
          <div className="comparison-visual">
            <h3>Wrist-path signature</h3>
            <p className="section-copy">
              Solid lines are your darts. The dashed line is the textbook form
              guide: a straight delivery and a full finish.
            </p>
            <TrajectoryPlot
              series={trajectorySeries}
              width={360}
              height={170}
              className="trajectory-plot trajectory-plot--comparison"
            />
          </div>
        ) : null}

        {overlayProfiles.length > 0 ? (
          <div className="comparison-visual">
            <h3>Speed signature</h3>
            <p className="section-copy">
              Solid lines are your darts. The dashed line is a single smooth
              acceleration to release.
            </p>
            <SpeedSparkline
              profiles={overlayProfiles}
              width={360}
              height={100}
              className="results-sparkline"
              accessibleLabel={
                guideSpeed.length > 1
                  ? 'Overlaid relative wrist-speed signatures for this round, with a dashed form-guide curve.'
                  : 'Overlaid relative wrist-speed signatures for all three darts.'
              }
            />
          </div>
        ) : null}

        <div className="sparkline-legend" aria-label="Chart legend">
          {round.darts.map((dart, index) => (
            <span
              key={dart.dartNumber}
              className="sparkline-legend__item"
              style={{ color: DART_COLORS[index % DART_COLORS.length] }}
            >
              <i aria-hidden="true" />
              Dart {dart.dartNumber}
            </span>
          ))}
          {guideSpeed.length > 1 || guidePath.length > 1 ? (
            <span
              className="sparkline-legend__item sparkline-legend__item--guide"
              style={{ color: GUIDE_STROKE }}
            >
              <i aria-hidden="true" />
              Form guide
            </span>
          ) : null}
        </div>

        <details className="variability-details">
          <summary>Exact variation</summary>
          <p>{round.consistencyLabel}</p>
          <p>{round.driftHeadline}</p>
          <div className="variability-grid">
            <p>
              Release angle: {round.metricVariability.releaseElbowCv.toFixed(0)}%
            </p>
            <p>
              Wrist speed: {round.metricVariability.peakSpeedCv.toFixed(0)}%
            </p>
            <p>
              Stroke time: {round.metricVariability.strokeTimeCv.toFixed(0)}%
            </p>
            <p>
              Follow-through:{' '}
              {round.metricVariability.followThroughCv.toFixed(0)}%
            </p>
          </div>
        </details>
      </section>

      <h2 className="section-title">Per dart</h2>
      <p className="section-copy release-proxy-note">
        “Release” is estimated at peak wrist speed. A single side camera cannot
        see the exact instant the dart leaves your fingers.
      </p>
      {round.darts.map((dart) => (
        <ThrowCard key={dart.dartNumber} dart={dart} />
      ))}

      <div className="page-actions">
        <button type="button" className="primary-button" onClick={onThrowAgain}>
          Throw again
        </button>
        <button type="button" className="secondary-button" onClick={onDone}>
          Done
        </button>
      </div>
      {historyCount > 0 ? (
        <button
          type="button"
          className="history-clear-button"
          onClick={handleClearHistory}
        >
          Clear {historyCount} locally stored throw signatures
        </button>
      ) : null}
    </main>
  );
}
