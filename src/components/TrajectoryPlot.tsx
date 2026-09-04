import type { TrajectoryPoint } from '../types/round';

export type TrajectorySeries = {
  points: TrajectoryPoint[];
  label: string;
  stroke: string;
  opacity?: number;
  dashed?: boolean;
};

type TrajectoryPlotProps = {
  series: TrajectorySeries[];
  width?: number;
  height?: number;
  className?: string;
};

export function TrajectoryPlot({
  series,
  width = 320,
  height = 150,
  className,
}: TrajectoryPlotProps) {
  const populated = series.filter((entry) => entry.points.length > 1);
  if (populated.length === 0) {
    return null;
  }

  const points = populated.flatMap((entry) => entry.points);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const padding = 12;
  const xSpan = Math.max(maxX - minX, 0.1);
  const ySpan = Math.max(maxY - minY, 0.1);
  const scale = Math.min(
    (width - padding * 2) / xSpan,
    (height - padding * 2) / ySpan,
  );
  const contentWidth = xSpan * scale;
  const contentHeight = ySpan * scale;
  const xOffset = (width - contentWidth) / 2;
  const yOffset = (height - contentHeight) / 2;

  const toCanvas = (point: TrajectoryPoint) => ({
    x: xOffset + (point.x - minX) * scale,
    y: yOffset + (point.y - minY) * scale,
  });
  const polyline = (trajectory: TrajectoryPoint[]) =>
    trajectory
      .map((point) => {
        const canvas = toCanvas(point);
        return `${canvas.x.toFixed(1)},${canvas.y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Normalized wrist paths for ${populated.map((entry) => entry.label).join(', ')}. Circles mark the release proxy.`}
    >
      <line
        x1={padding}
        y1={height / 2}
        x2={width - padding}
        y2={height / 2}
        className="trajectory-plot__axis"
      />
      {populated.map((entry) => {
        const releasePoint =
          [...entry.points]
            .reverse()
            .find((point) => point.phase === 'forward') ??
          entry.points[entry.points.length - 1];
        const releaseCanvas = toCanvas(releasePoint);
        return (
          <g key={entry.label}>
            <polyline
              fill="none"
              stroke={entry.stroke}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={entry.dashed ? '6 5' : undefined}
              opacity={entry.opacity ?? 1}
              points={polyline(entry.points)}
            />
            <circle
              cx={releaseCanvas.x}
              cy={releaseCanvas.y}
              r={4}
              fill={entry.stroke}
              stroke="#0f172a"
              strokeWidth={1.5}
            />
          </g>
        );
      })}
    </svg>
  );
}
