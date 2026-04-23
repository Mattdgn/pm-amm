"use client";

import { useEffect, useRef } from "react";
import type { MarketData } from "@/hooks/use-markets";

const DEBOUNCE_MS = 15_000;
const MIN_PRICE_DELTA = 0.002; // Only record if price moved meaningfully (0.2%)

/**
 * Passive hook: records price snapshots to /api/price-snap
 * only when prices actually change (post-trade), not from time decay.
 */
export function usePriceRecorder(markets: MarketData[] | undefined) {
  const lastSnap = useRef<Map<string, { time: number; price: number }>>(new Map());

  useEffect(() => {
    if (!markets?.length) return;
    const now = Date.now();

    for (const m of markets) {
      if (m.resolved || m.lEff <= 0) continue;
      const last = lastSnap.current.get(m.publicKey);
      if (last && now - last.time < DEBOUNCE_MS) continue;

      // Skip if price hasn't moved meaningfully (avoids fake trends from time decay)
      if (last && Math.abs(m.price - last.price) < MIN_PRICE_DELTA) continue;

      lastSnap.current.set(m.publicKey, { time: now, price: m.price });
      const ts = Math.floor(now / 1000);

      fetch("/api/price-snap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId: m.publicKey, price: m.price, timestamp: ts }),
      }).catch(() => {});
    }
  }, [markets]);
}
