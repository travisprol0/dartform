import type { DartMetrics, PhaseName } from '../types/round';

type PhaseTimelineProps = {
  dart: DartMetrics;
  compact?: boolean;
};

type TimelineSegment = {
  phase: PhaseName;
  label: string;
  durationMs: number;
};

export function PhaseTimeline({
  dart,
  compact = false,
}: PhaseTimelineProps) {
  const timing = dart.groups.timing;
  const segments: TimelineSegment[] = [
    timing.aimHoldMs !== null
      ? { phase: 'aim', label: 'Aim', durationMs: timing.aimHoldMs }
      : null,
    timing.backswingMs !== null
      ? {
          phase: 'backswing',
          label: 'Back',
          durationMs: timing.backswingMs,
        }
      : null,
    timing.forwardStrokeMs !== null
      ? {
          phase: 'forward',
          label: 'Forward',
          durationMs: timing.forwardStrokeMs,
        }
      : null,
    timing.settleTimeMs !== null
      ? {
          phase: 'followThrough',
          label: 'Finish',
          durationMs: timing.settleTimeMs,
        }
      : null,
  ].filter((segment): segment is TimelineSegment => segment !== null);

  if (segments.length === 0) {
    return null;
  }

  const description = segments
    .map(
      (segment) =>
        `${segment.label} ${Math.max(0, Math.round(segment.durationMs))} milliseconds`,
    )
    .join(', ');

  return (
    <div
      className={`phase-timeline${compact ? ' phase-timeline--compact' : ''}`}
      role="img"
      aria-label={`Throw phase timing: ${description}`}
    >
      <div className="phase-timeline__bar">
        {segments.map((segment) => (
          <div
            key={segment.phase}
            className={`phase-timeline__segment phase-timeline__segment--${segment.phase}`}
            style={{ flexGrow: Math.max(segment.durationMs, 20) }}
            title={`${segment.label}: ${Math.round(segment.durationMs)} ms`}
          />
        ))}
      </div>
      {!compact ? (
        <div className="phase-timeline__labels" aria-hidden="true">
          {segments.map((segment) => (
            <span key={segment.phase}>
              {segment.label} {Math.round(segment.durationMs)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
