"use client";

import { usePriceHistory } from "@/hooks/use-price-history";

interface PriceChartProps {
  marketId: string;
  currentPrice: number;
}

export function PriceChart({ marketId, currentPrice }: PriceChartProps) {
  const { data: points } = usePriceHistory(marketId);

  // Use Redis data or generate minimal fallback
  const prices = points && points.length >= 2
    ? points.map((p) => p.p)
    : [0.5, currentPrice];

  const W = 600;
  const H = 180;
  const PAD_T = 24;
  const PAD_B = 20;
  const PAD_L = 44;
  const PAD_R = 8;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const min = Math.min(...prices, 0.01);
  const max = Math.max(...prices, 0.99);
  const range = max - min || 0.1;
  const padded_min = Math.max(0, min - range * 0.1);
  const padded_max = Math.min(1, max + range * 0.1);
  const padded_range = padded_max - padded_min || 0.1;

  const toX = (i: number) => PAD_L + (i / (prices.length - 1)) * chartW;
  const toY = (v: number) => PAD_T + chartH - ((v - padded_min) / padded_range) * chartH;

  const pathD = prices
    .map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
    .join(" ");

  // Fill area under the YES line (top = price, bottom = chart bottom)
  const fillYesD = `${pathD} L ${toX(prices.length - 1).toFixed(1)} ${(PAD_T + chartH).toFixed(1)} L ${PAD_L.toFixed(1)} ${(PAD_T + chartH).toFixed(1)} Z`;

  // Fill area above the YES line (top = chart top, bottom = price)
  const fillNoD = `${pathD} L ${toX(prices.length - 1).toFixed(1)} ${PAD_T.toFixed(1)} L ${PAD_L.toFixed(1)} ${PAD_T.toFixed(1)} Z`;

  const lastPrice = prices[prices.length - 1];
  const lastX = toX(prices.length - 1);
  const lastY = toY(lastPrice);

  // Y-axis ticks
  const ticks = [0.25, 0.5, 0.75].filter(
    (t) => t > padded_min + padded_range * 0.08 && t < padded_max - padded_range * 0.08
  );

  return (
    <div className="border border-line p-[16px]">
      <div className="flex items-center justify-between mb-[12px]">
        <div className="text-caption">PRICE</div>
        <div className="flex gap-[16px] text-[11px] font-mono">
          <span className="text-yes">YES {(lastPrice * 100).toFixed(1)}%</span>
          <span className="text-no">NO {((1 - lastPrice) * 100).toFixed(1)}%</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto", maxHeight: 200 }}
      >
        <defs>
          <linearGradient id="yesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--yes)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--yes)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="noGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--no)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--no)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines + labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_L} y1={toY(t)} x2={W - PAD_R} y2={toY(t)}
              stroke="var(--line)" strokeWidth="0.5" strokeDasharray="2 3"
            />
            <text
              x={PAD_L - 6} y={toY(t) + 3}
              fill="var(--muted)" fontSize="9" fontFamily="var(--font-mono)"
              textAnchor="end"
            >
              {(t * 100).toFixed(0)}%
            </text>
          </g>
        ))}

        {/* 50% midline */}
        {padded_min < 0.5 && padded_max > 0.5 && (
          <line
            x1={PAD_L} y1={toY(0.5)} x2={W - PAD_R} y2={toY(0.5)}
            stroke="var(--line-2)" strokeWidth="0.5"
          />
        )}

        {/* YES fill (below line) */}
        <path d={fillYesD} fill="url(#yesGrad)" />

        {/* NO fill (above line) */}
        <path d={fillNoD} fill="url(#noGrad)" />

        {/* Price line */}
        <path d={pathD} stroke="var(--yes)" strokeWidth="1.5" fill="none" />

        {/* Current price dot */}
        <circle cx={lastX} cy={lastY} r="3" fill="var(--yes)" />
        <circle cx={lastX} cy={lastY} r="5" fill="var(--yes)" opacity="0.3" />

        {/* YES / NO labels */}
        <text
          x={PAD_L + 4} y={PAD_T + chartH - 4}
          fill="var(--yes)" fontSize="10" fontFamily="var(--font-mono)"
          opacity="0.6"
        >
          YES
        </text>
        <text
          x={PAD_L + 4} y={PAD_T + 12}
          fill="var(--no)" fontSize="10" fontFamily="var(--font-mono)"
          opacity="0.6"
        >
          NO
        </text>
      </svg>
    </div>
  );
}
