import type { DartMetrics } from '../types/round';

type ReleasePointPlotProps = {
  darts: DartMetrics[];
  colors: string[];
  outlierDart: number | null;
  width?: number;
  height?: number;
};

export function ReleasePointPlot({
  darts,
  colors,
  outlierDart,
  width = 240,
  height = 150,
}: ReleasePointPlotProps) {
  const plotted = darts
    .map((dart, index) => ({
      dartNumber: dart.dartNumber,
      point: dart.groups.geometry.releasePoint,
      color: colors[index % colors.length],
    }))
    .filter(
      (
        entry,
      ): entry is {
        dartNumber: number;
        point: { x: number; y: number; z?: number };
        color: string;
      } => entry.point !== null,
    );
  if (plotted.length < 2) {
    return null;
  }

  const centerX =
    plotted.reduce((sum, entry) => sum + entry.point.x, 0) / plotted.length;
  const centerY =
    plotted.reduce((sum, entry) => sum + entry.point.y, 0) / plotted.length;
  const radius = Math.max(
    ...plotted.map((entry) =>
      Math.hypot(entry.point.x - centerX, entry.point.y - centerY),
    ),
    0.05,
  );
  const padding = 20;
  const scale =
    Math.min(width - padding * 2, height - padding * 2) / (radius * 2.5);
  const toCanvas = (point: { x: number; y: number }) => ({
    x: width / 2 + (point.x - centerX) * scale,
    y: height / 2 + (point.y - centerY) * scale,
  });

  return (
    <svg
      className="release-point-plot"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Release-proxy point scatter for ${plotted.map((entry) => `Dart ${entry.dartNumber}`).join(', ')}.`}
    >
      <line
        x1={padding}
        y1={height / 2}
        x2={width - padding}
        y2={height / 2}
        className="release-point-plot__axis"
      />
      <line
        x1={width / 2}
        y1={padding}
        x2={width / 2}
        y2={height - padding}
        className="release-point-plot__axis"
      />
      {plotted.map((entry) => {
        const canvas = toCanvas(entry.point);
        const dimmed =
          outlierDart !== null && entry.dartNumber !== outlierDart;
        return (
          <g
            key={entry.dartNumber}
            opacity={dimmed ? 0.35 : 1}
          >
            <circle
              cx={canvas.x}
              cy={canvas.y}
              r={7}
              fill={entry.color}
              stroke="#0f172a"
              strokeWidth={2}
            />
            <text
              x={canvas.x}
              y={canvas.y + 3}
              textAnchor="middle"
              className="release-point-plot__label"
            >
              {entry.dartNumber}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
