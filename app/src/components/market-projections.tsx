"use client";

import { useMemo } from "react";
import { MetaRow } from "@/components/ui/meta-row";
import { formatUsdc, poolValue, formatTimeRemaining } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";

export function MarketProjections({ market }: { market: MarketData }) {
  const data = useMemo(() => {
    if (market.lZero <= 0 || market.resolved) return null;
    const now = Math.floor(Date.now() / 1000);
    const remaining = Math.max(market.endTs - now, 0);
    if (remaining <= 0) return null;

    const pvNow = poolValue(market.price, market.lEff);

    // Mid-point
    const midRemaining = remaining / 2;
    const midLEff = market.lZero * Math.sqrt(midRemaining);
    const pvMid = poolValue(market.price, midLEff);

    // At expiry (L_eff → 0, pool value → 0)
    const dailyLvr = pvNow / (2 * remaining / 86400);

    return { pvNow, pvMid, dailyLvr, remaining, midRemaining };
  }, [market]);

  if (!data) return null;

  return (
    <div className="border border-line p-[16px] space-y-[4px]">
      <div className="text-caption mb-[8px]">POOL STATS</div>
      <MetaRow label="Pool Value" value={`$${formatUsdc(data.pvNow)}`} />
      <MetaRow
        label={`Value in ${formatTimeRemaining(market.endTs - Math.floor((market.endTs - Math.floor(Date.now() / 1000)) / 2))}`}
        value={`$${formatUsdc(data.pvMid)}`}
      />
      <MetaRow label="Daily LVR cost" value={`$${formatUsdc(data.dailyLvr)}`} />
      <MetaRow label="At expiry" value="$0.00" last />
    </div>
  );
}
