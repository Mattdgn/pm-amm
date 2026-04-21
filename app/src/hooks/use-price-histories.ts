"use client";

import { useQuery } from "@tanstack/react-query";
import type { MarketData } from "@/hooks/use-markets";

interface PricePoint {
  t: number;
  p: number;
}

/**
 * Fetch price histories for all active markets.
 * Returns a Map<publicKey, number[]> of price arrays for sparklines.
 * Falls back gracefully if Redis is not configured (empty map).
 */
export function usePriceHistories(
  markets: MarketData[] | undefined
): Map<string, number[]> | undefined {
  const ids = markets?.filter((m) => !m.resolved).map((m) => m.publicKey) ?? [];

  const { data } = useQuery({
    queryKey: ["price-histories", ids.join(",")],
    queryFn: async () => {
      const results = new Map<string, number[]>();
      const fetches = ids.map(async (id) => {
        try {
          const res = await fetch(`/api/price-history?market=${id}&limit=30`);
          if (!res.ok) return;
          const json = await res.json();
          const points: PricePoint[] = json.points ?? [];
          if (points.length >= 3) {
            results.set(id, points.map((p) => p.p));
          }
        } catch {
          // Silently skip — fallback to seed sparkline
        }
      });
      await Promise.all(fetches);
      return results;
    },
    enabled: ids.length > 0,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  return data;
}
