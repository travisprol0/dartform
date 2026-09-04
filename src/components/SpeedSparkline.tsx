import type { SpeedPoint } from '../types/round';

type SpeedSparklineProps = {
  profile: SpeedPoint[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
  /** When set, draws multiple profiles on one axis (e.g. round overlay). */
  profiles?: { points: SpeedPoint[]; stroke: string; opacity?: number }[];
};

export function SpeedSparkline({
  profile,
  width = 200,
  height = 48,
  stroke = '#5eead4',
  className,
  profiles,
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
        aria-hidden
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
      aria-hidden
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
          opacity={entry.opacity ?? 1}
          points={toPolyline(entry.points)}
        />
      ))}
    </svg>
  );
}
