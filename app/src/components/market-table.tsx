"use client";

import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { Sparkline } from "@/components/ui/sparkline";
import { Countdown } from "@/components/ui/countdown";
import { formatUsdc, poolValue } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";

function getStatus(m: MarketData): "active" | "expiring" | "resolved-yes" | "resolved-no" {
  if (m.resolved) return m.winningSide === 1 ? "resolved-yes" : "resolved-no";
  const remaining = m.endTs - Math.floor(Date.now() / 1000);
  if (remaining > 0 && remaining < 86400) return "expiring";
  if (remaining <= 0) return "expiring";
  return "active";
}

interface MarketTableProps {
  markets: MarketData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  priceHistories?: Map<string, number[]>;
}

export function MarketTable({ markets, selectedId, onSelect, priceHistories }: MarketTableProps) {
  const router = useRouter();

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-x-auto">
      {/* Header */}
      <div
        className={[
          "grid gap-[12px] px-[24px] py-[10px]",
          "border-b border-line",
          "font-mono text-[10px] text-muted uppercase tracking-[0.08em]",
          "grid-cols-[1fr_60px_160px_80px_72px_60px]",
        ].join(" ")}
      >
        <div>Market</div>
        <div>Trend</div>
        <div className="text-center">Probability</div>
        <div className="text-right">TVL</div>
        <div className="text-right">Expires</div>
        <div className="text-right">Status</div>
      </div>

      {/* Rows */}
      {markets.map((m) => {
        const status = getStatus(m);
        const isResolved = m.resolved;
        const isSelected = selectedId === m.publicKey;
        const pv = m.lEff > 0 ? poolValue(m.price, m.lEff) : 0;
        const yesP = Math.round(m.price * 100);
        const noP = 100 - yesP;

        return (
          <div
            key={m.publicKey}
            onClick={() => onSelect(m.publicKey)}
            onDoubleClick={() => router.push(`/market/${m.marketId}`)}
            className={[
              "grid gap-[12px] px-[24px] items-center",
              "border-b border-line font-mono text-[12px]",
              "cursor-pointer relative",
              "transition-all duration-[120ms]",
              "h-[var(--row)]",
              isSelected ? "bg-surface" : "hover:bg-surface",
              isResolved ? "opacity-55 hover:opacity-100" : "",
              "grid-cols-[1fr_60px_160px_80px_72px_60px]",
            ].join(" ")}
          >
            {isSelected && (
              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
            )}

            {/* Market name */}
            <div className="min-w-0 font-sans text-[13px] text-text-hi tracking-[-0.005em] truncate">
              {m.name}
            </div>

            {/* Sparkline */}
            <div>
              <Sparkline
                points={priceHistories?.get(m.publicKey) ?? [m.price, m.price]}
                color={m.price >= 0.5 ? "var(--yes)" : "var(--no)"}
                width={48}
                height={18}
              />
            </div>

            {/* Probability bar with prices inline */}
            <div className="flex items-center gap-[6px]">
              <span className="text-yes text-[11px] tnum w-[32px] text-right">{yesP}%</span>
              <div className="flex-1 h-[2px] bg-no/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yes rounded-full transition-all duration-[300ms]"
                  style={{ width: `${yesP}%` }}
                />
              </div>
              <span className="text-no text-[11px] tnum w-[32px]">{noP}%</span>
            </div>

            {/* TVL */}
            <div className="text-right tnum text-text">${formatUsdc(pv)}</div>

            {/* Expires */}
            <div className="text-right text-[11px]">
              <Countdown endTs={m.endTs} />
            </div>

            {/* Status */}
            <div className="text-right">
              <StatusBadge variant={status} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
