import type { RoundSummary } from '../types/round';
import { throwingHandLabel } from '../analysis/throwingArm';
import { SpeedSparkline } from '../components/SpeedSparkline';
import { ThrowCard } from '../components/ThrowCard';

type ResultsPageProps = {
  round: RoundSummary;
  onThrowAgain: () => void;
  onDone: () => void;
};

const DART_COLORS = ['#5eead4', '#fbbf24', '#f472b6'];

export function ResultsPage({ round, onThrowAgain, onDone }: ResultsPageProps) {
  const armLabel = throwingHandLabel(round.throwingHand);
  const overlayProfiles = round.darts
    .filter((dart) => dart.speedProfile.length > 1)
    .map((dart, index) => ({
      points: dart.speedProfile,
      stroke: DART_COLORS[index % DART_COLORS.length],
      opacity: 0.9,
    }));

  const avgTempo =
    round.tempoMs.length > 0
      ? round.tempoMs.reduce((sum, value) => sum + value, 0) /
        round.tempoMs.length
      : null;

  return (
    <main className="page page--scroll">
      <h1 className="title title--results">Round complete</h1>
      <p className="subtitle">
        {round.darts.length} darts tracked on your {armLabel} arm
      </p>

      <div className="summary-card">
        <p className="summary-label">Average release angle</p>
        <p className="summary-value">{round.avgElbowAngle.toFixed(1)}°</p>
        <p className="summary-label">Average peak speed</p>
        <p className="summary-value">
          {round.avgPeakSpeed.toFixed(1)}
          <span className="summary-unit"> forearm/s</span>
        </p>
        {overlayProfiles.length > 0 ? (
          <>
            <p className="summary-label">Speed signature overlay</p>
            <SpeedSparkline
              profile={[]}
              profiles={overlayProfiles}
              width={320}
              height={72}
              className="results-sparkline"
            />
            <div className="sparkline-legend">
              {round.darts.map((dart, index) => (
                <span
                  key={dart.dartNumber}
                  className="sparkline-legend__item"
                  style={{ color: DART_COLORS[index % DART_COLORS.length] }}
                >
                  Dart {dart.dartNumber}
                </span>
              ))}
            </div>
          </>
        ) : null}
        <p className="consistency">{round.consistencyLabel}</p>
        <p className="drift-headline">{round.driftHeadline}</p>
        {avgTempo !== null ? (
          <p className="tempo-line">
            Avg tempo between throws: {(avgTempo / 1000).toFixed(1)} s
          </p>
        ) : null}
      </div>

      <div className="variability-card">
        <h2 className="section-title">Repeatability</h2>
        <div className="variability-grid">
          <p className="variability-stat">
            Release angle CV:{' '}
            {round.metricVariability.releaseElbowCv.toFixed(0)}%
          </p>
          <p className="variability-stat">
            Peak speed CV: {round.metricVariability.peakSpeedCv.toFixed(0)}%
          </p>
          <p className="variability-stat">
            Stroke time CV: {round.metricVariability.strokeTimeCv.toFixed(0)}%
          </p>
          <p className="variability-stat">
            Follow-through CV:{' '}
            {round.metricVariability.followThroughCv.toFixed(0)}%
          </p>
        </div>
      </div>

      <h2 className="section-title">Per dart</h2>
      {round.darts.map((dart) => (
        <ThrowCard key={dart.dartNumber} dart={dart} />
      ))}

      <button type="button" className="primary-button" onClick={onThrowAgain}>
        Throw again
      </button>
      <button type="button" className="secondary-button" onClick={onDone}>
        Done
      </button>
    </main>
  );
}
