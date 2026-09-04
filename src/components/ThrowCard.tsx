import type { DartMetrics } from '../types/round';
import { SpeedSparkline } from './SpeedSparkline';

type ThrowCardProps = {
  dart: DartMetrics;
  compact?: boolean;
};

function formatMs(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return `${Math.round(value)} ms`;
}

function formatRatio(value: number | null, suffix = ''): string {
  if (value === null) {
    return '—';
  }
  return `${value.toFixed(2)}${suffix}`;
}

export function ThrowCard({ dart, compact = false }: ThrowCardProps) {
  const { phases } = dart;

  return (
    <div className={`throw-card${compact ? ' throw-card--compact' : ''}`}>
      <div className="throw-card__header">
        <p className="throw-card__dart">Dart {dart.dartNumber}</p>
        <div className="throw-card__hero">
          <div>
            <p className="throw-card__label">Release elbow</p>
            <p className="throw-card__value">
              {phases.releaseElbowDeg.toFixed(1)}°
            </p>
          </div>
          <div>
            <p className="throw-card__label">Peak speed</p>
            <p className="throw-card__value">
              {phases.peakSpeed.toFixed(1)}
              <span className="throw-card__unit"> forearm/s</span>
            </p>
          </div>
        </div>
      </div>

      {dart.speedProfile.length > 1 ? (
        <div className="throw-card__sparkline">
          <SpeedSparkline profile={dart.speedProfile} width={280} height={56} />
          <p className="throw-card__sparkline-label">Wrist speed (forearm/s)</p>
        </div>
      ) : null}

      <div className="throw-card__grid">
        {phases.aimHoldMs !== null ? (
          <p className="throw-card__stat">
            Aim hold: {formatMs(phases.aimHoldMs)}
          </p>
        ) : null}
        {phases.backswingMs !== null ? (
          <p className="throw-card__stat">
            Backswing: {formatMs(phases.backswingMs)}
          </p>
        ) : null}
        {phases.forwardStrokeMs !== null ? (
          <p className="throw-card__stat">
            Forward stroke: {formatMs(phases.forwardStrokeMs)}
          </p>
        ) : null}
        {phases.elbowExtensionDeg !== null ? (
          <p className="throw-card__stat">
            Extension: {phases.elbowExtensionDeg.toFixed(1)}°
          </p>
        ) : null}
        {phases.followThroughLength !== null ? (
          <p className="throw-card__stat">
            Follow-through: {formatRatio(phases.followThroughLength, '× forearm')}
          </p>
        ) : null}
        {phases.smoothness !== null ? (
          <p className="throw-card__stat">
            Smoothness: {phases.smoothness < 0.35 ? 'Smooth' : 'Stuttery'}
          </p>
        ) : null}
      </div>

      <p className="throw-card__tip">{dart.coachingTip}</p>
    </div>
  );
}
