import type { SpeedPoint } from '../types/round';

type SpeedSparklineProps = {
  profile?: SpeedPoint[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
  /** When set, draws multiple profiles on one axis (e.g. round overlay). */
  profiles?: {
    points: SpeedPoint[];
    stroke: string;
    opacity?: number;
    dashed?: boolean;
  }[];
  markers?: { timeMs: number; label: string }[];
  accessibleLabel?: string;
};

export function SpeedSparkline({
  profile = [],
  width = 200,
  height = 48,
  stroke = '#5eead4',
  className,
  profiles,
  markers = [],
  accessibleLabel = 'Relative wrist speed over the captured throw.',
}: SpeedSparklineProps) {
  const allProfiles =
    profiles ??
    (profile.length > 1 ? [{ points: profile, stroke, opacity: 1 }] : []);

  if (allProfiles.every((entry) => entry.points.length < 2)) {
    return (
      <svg
        className={className}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Relative wrist speed was unavailable for this throw."
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#334155"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      </svg>
    );
  }

  const flatPoints = allProfiles.flatMap((entry) => entry.points);
  const minTime = Math.min(...flatPoints.map((point) => point.timeMs));
  const maxTime = Math.max(...flatPoints.map((point) => point.timeMs));
  const maxSpeed = Math.max(...flatPoints.map((point) => point.speed), 0.01);
  const timeSpan = Math.max(maxTime - minTime, 1);

  const toPolyline = (points: SpeedPoint[]) =>
    points
      .map((point) => {
        const x = ((point.timeMs - minTime) / timeSpan) * width;
        const y = height - (point.speed / maxSpeed) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={accessibleLabel}
    >
      <line
        x1={0}
        y1={height - 2}
        x2={width}
        y2={height - 2}
        stroke="#334155"
        strokeWidth={1}
      />
      {allProfiles.map((entry, index) => (
        <polyline
          key={index}
          fill="none"
          stroke={entry.stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={entry.dashed ? '6 5' : undefined}
          opacity={entry.opacity ?? 1}
          points={toPolyline(entry.points)}
        />
      ))}
      {markers
        .filter(
          (marker) =>
            marker.timeMs >= minTime && marker.timeMs <= maxTime,
        )
        .map((marker) => {
          const x = ((marker.timeMs - minTime) / timeSpan) * width;
          return (
            <line
              key={`${marker.label}-${marker.timeMs}`}
              x1={x}
              y1={0}
              x2={x}
              y2={height}
              className="speed-marker"
            >
              <title>{marker.label}</title>
            </line>
          );
        })}
    </svg>
  );
}
