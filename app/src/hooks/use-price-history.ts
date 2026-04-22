"use client";

import { useQuery } from "@tanstack/react-query";

interface PricePoint {
  t: number;
  p: number;
}

export function usePriceHistory(marketId: string | undefined) {
  return useQuery<PricePoint[]>({
    queryKey: ["price-history", marketId],
    queryFn: async () => {
      if (!marketId) return [];
      const res = await fetch(`/api/price-history?market=${marketId}&limit=50`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.points ?? [];
    },
    enabled: !!marketId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
