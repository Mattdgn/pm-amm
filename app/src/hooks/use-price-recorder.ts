"use client";

import { useEffect, useRef } from "react";
import type { MarketData } from "@/hooks/use-markets";

const DEBOUNCE_MS = 30_000;

/**
 * Passive hook: records price snapshots to /api/price-snap
 * whenever market prices change. Debounced per market (30s).
 */
export function usePriceRecorder(markets: MarketData[] | undefined) {
  const lastSnap = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!markets?.length) return;
    const now = Date.now();

    for (const m of markets) {
      if (m.resolved || m.lEff <= 0) continue;
      const last = lastSnap.current.get(m.publicKey) ?? 0;
      if (now - last < DEBOUNCE_MS) continue;

      lastSnap.current.set(m.publicKey, now);
      const ts = Math.floor(now / 1000);

      fetch("/api/price-snap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId: m.publicKey, price: m.price, timestamp: ts }),
      }).catch(() => {});
    }
  }, [markets]);
}
