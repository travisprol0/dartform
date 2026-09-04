import type { DartMetrics } from '../types/round';
import { PhaseTimeline } from './PhaseTimeline';
import { SpeedSparkline } from './SpeedSparkline';
import { TrajectoryPlot } from './TrajectoryPlot';

type ThrowCardProps = {
  dart: DartMetrics;
};

function formatMs(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return `${Math.round(value)} ms`;
}

function formatNumber(
  value: number | null,
  digits: number,
  suffix = '',
): string | null {
  if (value === null) {
    return null;
  }
  return `${value.toFixed(digits)}${suffix}`;
}

type MetricProps = {
  label: string;
  value: string | null;
};

function Metric({ label, value }: MetricProps) {
  if (value === null) {
    return null;
  }
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ThrowCard({ dart }: ThrowCardProps) {
  const { groups } = dart;
  const { timing, delivery, geometry, path, body, hand } = groups;
  const speedMarkers = [
    dart.phaseMarkers.rearMs !== null
      ? { timeMs: dart.phaseMarkers.rearMs, label: 'Backswing end' }
      : null,
    {
      timeMs: dart.phaseMarkers.releaseProxyMs,
      label: 'Release proxy',
    },
    dart.phaseMarkers.settleMs !== null
      ? { timeMs: dart.phaseMarkers.settleMs, label: 'Settled' }
      : null,
  ].filter(
    (
      marker,
    ): marker is {
      timeMs: number;
      label: string;
    } => marker !== null,
  );

  return (
    <article className="throw-card">
      <div className="throw-card__header">
        <div className="throw-card__topline">
          <p className="throw-card__dart">Dart {dart.dartNumber}</p>
          <span
            className={`quality-badge quality-badge--${dart.captureQuality.grade}`}
          >
            {dart.captureQuality.grade} confidence
          </span>
        </div>
        <p className="throw-card__insight">{dart.insight.headline}</p>
        <p className="throw-card__evidence">{dart.insight.evidence}</p>
        <div className="throw-card__hero">
          <div>
            <p className="throw-card__label">Elbow at speed peak</p>
            <p className="throw-card__value">
              {geometry.releaseElbowDeg.toFixed(1)}°
            </p>
          </div>
          <div>
            <p className="throw-card__label">Relative wrist speed</p>
            <p className="throw-card__value">
              {delivery.peakSpeed.toFixed(1)}
              <span className="throw-card__unit"> forearms/s</span>
            </p>
          </div>
        </div>
      </div>

      <PhaseTimeline dart={dart} />

      {dart.speedProfile.length > 1 ? (
        <div className="throw-card__sparkline">
          <SpeedSparkline
            profile={dart.speedProfile}
            width={320}
            height={72}
            markers={speedMarkers}
            accessibleLabel={`Dart ${dart.dartNumber} relative wrist-speed curve with backswing, speed-peak, and settle markers.`}
          />
          <p className="throw-card__sparkline-label">
            Relative wrist speed; dashed lines mark phases
          </p>
        </div>
      ) : null}

      <dl className="metric-grid metric-grid--primary">
        <Metric label="Aim hold" value={timing.aimHoldMs === null ? null : formatMs(timing.aimHoldMs)} />
        <Metric label="Backswing" value={timing.backswingMs === null ? null : formatMs(timing.backswingMs)} />
        <Metric label="Forward stroke" value={timing.forwardStrokeMs === null ? null : formatMs(timing.forwardStrokeMs)} />
        <Metric
          label="Elbow extension"
          value={formatNumber(geometry.elbowExtensionDeg, 1, '°')}
        />
        <Metric
          label="Follow-through"
          value={formatNumber(path.followThroughLength, 2, ' forearms')}
        />
        <Metric
          label="Path directness"
          value={
            path.directness === null
              ? null
              : `${Math.round(path.directness * 100)}%`
          }
        />
      </dl>

      {dart.trajectory.length > 1 ? (
        <div className="throw-card__trajectory">
          <p className="throw-card__subheading">Wrist path</p>
          <TrajectoryPlot
            series={[
              {
                points: dart.trajectory,
                label: `Dart ${dart.dartNumber}`,
                stroke: '#5eead4',
              },
            ]}
            width={320}
            height={128}
            className="trajectory-plot"
          />
        </div>
      ) : null}

      <details className="mechanics-details">
        <summary>Advanced mechanics</summary>
        <p className="mechanics-details__note">
          Distances are normalized to your tracked forearm. Higher path
          directness means less side-to-side bend; 3D estimates appear only
          when world landmarks are dependable.
        </p>

        <h3>Timing and delivery</h3>
        <dl className="metric-grid">
          <Metric
            label="Back : forward rhythm"
            value={formatNumber(timing.backswingToForwardRatio, 2)}
          />
          <Metric
            label="Time to speed peak"
            value={
              delivery.timeToPeakMs === null
                ? null
                : formatMs(delivery.timeToPeakMs)
            }
          />
          <Metric
            label="Peak acceleration"
            value={formatNumber(delivery.peakAcceleration, 1, ' forearms/s²')}
          />
          <Metric
            label="Speed smoothness"
            value={formatNumber(delivery.smoothness, 2)}
          />
          <Metric
            label="Speed peaks"
            value={
              delivery.hitchCount === null
                ? null
                : `${delivery.hitchCount}`
            }
          />
          <Metric
            label="Peak within delivery"
            value={
              delivery.peakLocationRatio === null
                ? null
                : `${Math.round(delivery.peakLocationRatio * 100)}%`
            }
          />
        </dl>

        <h3>Arm and path</h3>
        <dl className="metric-grid">
          <Metric
            label="Cocked elbow"
            value={formatNumber(geometry.cockedElbowDeg, 1, '°')}
          />
          <Metric
            label="Elbow lock angle"
            value={formatNumber(geometry.maxElbowLockDeg, 1, '°')}
          />
          <Metric
            label="Forearm elevation"
            value={formatNumber(geometry.forearmElevationDeg, 1, '°')}
          />
          <Metric
            label="Upper-arm elevation"
            value={formatNumber(geometry.upperArmElevationDeg, 1, '°')}
          />
          <Metric
            label="Elbow-anchor drift"
            value={formatNumber(geometry.elbowAnchorDrift, 2, ' forearms')}
          />
          <Metric
            label="Forward path"
            value={formatNumber(path.forwardStrokeLength, 2, ' forearms')}
          />
          <Metric
            label="Path deviation"
            value={formatNumber(path.maxDeviation, 2, ' forearms')}
          />
          <Metric
            label="Finish direction"
            value={
              path.followThroughContinuation === null
                ? null
                : `${Math.round(path.followThroughContinuation * 100)}%`
            }
          />
        </dl>

        <h3>Stability</h3>
        <dl className="metric-grid">
          <Metric
            label="Aim sway"
            value={formatNumber(body.aimWristSway, 2, ' forearms')}
          />
          <Metric
            label="Shoulder drift"
            value={formatNumber(body.shoulderDrift, 2, ' forearms')}
          />
          <Metric
            label="Head drift"
            value={formatNumber(body.headDrift, 2, ' forearms')}
          />
          <Metric
            label="Torso sway"
            value={formatNumber(body.torsoSway, 2, ' forearms')}
          />
          <Metric
            label="Torso lean"
            value={formatNumber(body.torsoLeanDeg, 1, '°')}
          />
          <Metric
            label="Depth motion estimate"
            value={formatNumber(body.outOfPlaneMotion, 2, ' forearms')}
          />
        </dl>

        {hand.handAngleDeg !== null ? (
          <>
            <h3>Experimental hand estimate</h3>
            <p className="mechanics-details__note">
              Small hand landmarks can be noisy; use these only as a trend.
            </p>
            <dl className="metric-grid">
              <Metric
                label="Hand direction"
                value={formatNumber(hand.handAngleDeg, 1, '°')}
              />
              <Metric
                label="Wrist snap change"
                value={formatNumber(hand.wristSnapDeg, 1, '°')}
              />
              <Metric
                label="Hand confidence"
                value={
                  hand.confidence === null
                    ? null
                    : `${Math.round(hand.confidence * 100)}%`
                }
              />
            </dl>
          </>
        ) : null}

        <div className="capture-quality-detail">
          <h3>Capture quality: {dart.captureQuality.score}/100</h3>
          <p>
            {dart.captureQuality.frameRate.toFixed(0)} fps ·{' '}
            {Math.round(dart.captureQuality.traceCoverage * 100)}% trace
            coverage ·{' '}
            {Math.round(dart.captureQuality.meanVisibility * 100)}% arm
            visibility
          </p>
          {dart.captureQuality.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      </details>
    </article>
  );
}
