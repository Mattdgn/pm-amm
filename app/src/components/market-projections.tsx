"use client";

import { useMemo } from "react";
import { MetaRow } from "@/components/ui/meta-row";
import { formatUsdc, formatPrice, poolValue, priceFromReserves } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";

const POINTS = 6;

export function MarketProjections({ market }: { market: MarketData }) {
  const projections = useMemo(() => {
    if (market.lZero <= 0 || market.resolved) return [];
    const now = Math.floor(Date.now() / 1000);
    const totalRemaining = Math.max(market.endTs - now, 0);
    if (totalRemaining <= 0) return [];

    const step = totalRemaining / POINTS;
    const pvNow = poolValue(market.price, market.lEff);

    return Array.from({ length: POINTS + 1 }, (_, i) => {
      const remaining = Math.max(totalRemaining - i * step, 1);
      const lEff = market.lZero * Math.sqrt(remaining);
      const price = lEff > 0
        ? priceFromReserves(market.reserveYes, market.reserveNo, lEff)
        : market.price;
      const pv = poolValue(price, lEff);

      let label: string;
      if (i === 0) label = "Now";
      else if (i === POINTS) label = "At expiry";
      else {
        const d = Math.floor(remaining / 86400);
        const h = Math.floor((remaining % 86400) / 3600);
        label = d > 0 ? `In ${d}d ${h}h` : `In ${h}h`;
      }

      return { label, pv, pvPct: pvNow > 0 ? (pv / pvNow) * 100 : 0, price, isNow: i === 0, isExpiry: i === POINTS };
    });
  }, [market]);

  if (projections.length === 0) return null;

  return (
    <div className="border border-line p-[16px] space-y-[8px]">
      <div className="text-caption">POOL VALUE OVER TIME</div>
      <p className="text-[12px] text-text-dim">How liquidity decreases toward expiry</p>

      {projections.map((row, i) => (
        <div key={i} className="space-y-[4px]">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className={row.isNow ? "text-text-hi font-medium" : "text-muted"}>
              {row.label}
            </span>
            <div className="flex items-center gap-[12px]">
              <span className="text-muted">{formatPrice(row.price)}</span>
              <span className={`tnum ${row.isNow ? "text-text-hi" : "text-text"}`}>
                ${formatUsdc(row.pv)}
              </span>
            </div>
          </div>
          <div className="h-[2px] bg-line overflow-hidden">
            <div
              className={`h-full transition-all ${
                row.isExpiry ? "bg-no" : row.pvPct < 40 ? "bg-accent" : "bg-yes"
              }`}
              style={{ width: `${row.pvPct}%`, opacity: 0.6 }}
            />
          </div>
        </div>
      ))}

      <p className="text-[11px] text-muted pt-[4px] font-mono">
        Assumes no new trades.
      </p>
    </div>
  );
}
