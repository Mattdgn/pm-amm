"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { Sparkline } from "@/components/ui/sparkline";
import { formatUsdc, formatTimeRemaining, poolValue } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";

/** Generate a sparkline trending toward the market's current price. */
function marketSparkline(marketId: number, currentPrice: number): number[] {
  let s = marketId * 7 + 1;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const pts: number[] = [];
  let v = 0.5;
  const target = currentPrice;
  const drift = (target - 0.5) / 30;
  for (let i = 0; i < 30; i++) {
    v += (rnd() - 0.5) * 0.03 + drift;
    v = Math.max(0.05, Math.min(0.95, v));
    pts.push(v);
  }
  pts[pts.length - 1] = currentPrice;
  return pts;
}

function getStatus(m: MarketData): "active" | "expiring" | "resolved-yes" | "resolved-no" {
  if (m.resolved) return m.winningSide === 1 ? "resolved-yes" : "resolved-no";
  const remaining = m.endTs - Math.floor(Date.now() / 1000);
  if (remaining > 0 && remaining < 86400) return "expiring";
  return "active";
}

function truncateKey(key: string): string {
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

interface MarketTableProps {
  markets: MarketData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MarketTable({ markets, selectedId, onSelect }: MarketTableProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <div
        className={[
          "grid gap-[16px] px-[24px] py-[10px]",
          "border-b border-line",
          "font-mono text-[10px] text-muted uppercase tracking-[0.08em]",
          "grid-cols-[48px_1fr_80px_80px_80px_100px_90px_80px]",
        ].join(" ")}
      >
        <div>ID</div>
        <div>MARKET</div>
        <div className="text-right">YES</div>
        <div className="text-right">NO</div>
        <div>TREND</div>
        <div className="text-center">PROB</div>
        <div className="text-right">TVL</div>
        <div className="text-right">STATUS</div>
      </div>

      {/* Rows */}
      {markets.map((m) => {
        const status = getStatus(m);
        const isResolved = m.resolved;
        const isSelected = selectedId === m.publicKey;
        const pv = m.lEff > 0 ? poolValue(m.price, m.lEff) : 0;
        const yesP = m.price * 100;

        return (
          <div
            key={m.publicKey}
            onClick={() => onSelect(m.publicKey)}
            className={[
              "grid gap-[16px] px-[24px] items-center",
              "border-b border-line font-mono text-[12px]",
              "cursor-pointer relative",
              "transition-all duration-[120ms]",
              "h-[var(--row)]",
              isSelected ? "bg-surface" : "hover:bg-surface",
              isResolved ? "opacity-55 hover:opacity-100" : "",
              "grid-cols-[48px_1fr_80px_80px_80px_100px_90px_80px]",
            ].join(" ")}
          >
            {isSelected && (
              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
            )}
            <div className="text-muted text-[11px]">#{m.marketId}</div>
            <div className="flex items-center gap-[8px] min-w-0 font-sans text-[13px] text-text-hi tracking-[-0.005em]">
              <span className="truncate">Market #{m.marketId}</span>
              <span className="text-[10px] text-muted font-mono shrink-0">
                {truncateKey(m.publicKey)}
              </span>
            </div>
            <div className="text-right text-yes tnum text-[13px] tracking-[-0.01em]">
              {m.price.toFixed(4)}
            </div>
            <div className="text-right text-no tnum text-[13px] tracking-[-0.01em]">
              {(1 - m.price).toFixed(4)}
            </div>
            <div>
              <Sparkline
                points={marketSparkline(m.marketId, m.price)}
                color={m.price >= 0.5 ? "var(--yes)" : "var(--no)"}
                width={64}
                height={18}
              />
            </div>
            <div className="px-[4px]">
              <ProbabilityBar yesPercent={yesP} showLabels={false} />
            </div>
            <div className="text-right tnum text-text">${formatUsdc(pv)}</div>
            <div className="text-right">
              <StatusBadge variant={status} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
