interface SparklineProps {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
  midline?: boolean;
  className?: string;
}

export function Sparkline({
  points,
  color = "var(--text-dim)",
  width = 80,
  height = 20,
  midline = true,
  className = "",
}: SparklineProps) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const toX = (i: number) => (i / (points.length - 1)) * width;
  const toY = (v: number) => height - 1 - ((v - min) / range) * (height - 2);

  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: "block" }}
    >
      {midline && (
        <line
          x1="0"
          y1={toY(0.5)}
          x2={width}
          y2={toY(0.5)}
          stroke="var(--line-2)"
          strokeWidth="0.5"
          strokeDasharray="1 2"
        />
      )}
      <path d={d} stroke={color} strokeWidth="1" fill="none" />
      <circle cx={toX(points.length - 1)} cy={toY(last)} r="1.5" fill={color} />
    </svg>
  );
}
