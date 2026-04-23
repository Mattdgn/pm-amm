"use client";

import { useState, useMemo } from "react";
import { StatusBar } from "@/components/layout/status-bar";
import { MarketTable } from "@/components/market-table";
import { MarketDetailPanel } from "@/components/market-detail-panel";
import { useMarkets } from "@/hooks/use-markets";
import { useUserPositions } from "@/hooks/use-user-positions";
import { usePriceRecorder } from "@/hooks/use-price-recorder";
import { usePriceHistories } from "@/hooks/use-price-histories";
import { PortfolioPanel } from "@/components/portfolio-panel";
import { poolValue } from "@/lib/pm-math";
import Link from "next/link";

type Filter = "all" | "active" | "expiring" | "resolved" | "positions";
type Sort = "tvl" | "expiry" | "newest";

export default function Home() {
  const { data: markets, isLoading, error } = useMarkets();
  const { data: userPositions } = useUserPositions(markets);
  usePriceRecorder(markets);
  const priceHistories = usePriceHistories(markets);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("tvl");

  const filtered = useMemo(() => {
    if (!markets) return [];
    let result = [...markets];
    const now = Math.floor(Date.now() / 1000);

    if (filter === "active") result = result.filter((m) => !m.resolved && m.endTs > now);
    else if (filter === "resolved") result = result.filter((m) => m.resolved);
    else if (filter === "expiring") {
      result = result.filter((m) => !m.resolved && m.endTs - now > 0 && m.endTs - now < 86400);
    } else if (filter === "positions") {
      result = result.filter((m) => userPositions?.has(m.publicKey));
    }

    if (sort === "tvl") {
      result.sort((a, b) => {
        const pvA = a.lEff > 0 ? poolValue(a.price, a.lEff) : 0;
        const pvB = b.lEff > 0 ? poolValue(b.price, b.lEff) : 0;
        return pvB - pvA;
      });
    } else if (sort === "expiry") {
      result.sort((a, b) => a.endTs - b.endTs);
    } else if (sort === "newest") {
      result.sort((a, b) => b.startTs - a.startTs);
    }

    return result;
  }, [markets, filter, sort, userPositions]);

  const selectedMarket = markets?.find((m) => m.publicKey === selectedId) ?? null;
  const positionCount = userPositions?.size ?? 0;

  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: markets?.length },
    { key: "active", label: "Active", count: markets?.filter((m) => !m.resolved && m.endTs > Math.floor(Date.now() / 1000)).length },
    { key: "expiring", label: "<24h" },
    { key: "resolved", label: "Resolved", count: markets?.filter((m) => m.resolved).length },
    { key: "positions", label: "My bets", count: positionCount || undefined },
  ];

  const sorts: { key: Sort; label: string }[] = [
    { key: "tvl", label: "TVL" },
    { key: "expiry", label: "Expiry" },
    { key: "newest", label: "New" },
  ];

  return (
    <>
      <StatusBar />
      <div className="grid min-h-[calc(100vh-38px)] grid-cols-1 xl:grid-cols-[1fr_300px]">
        <main className="flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-[24px] py-[12px] border-b border-line font-mono text-[11px] tracking-[0.05em] gap-[12px] flex-wrap">
            {/* Filters */}
            <div className="flex gap-[4px]">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={[
                    "px-[10px] py-[4px] rounded-sm border cursor-pointer",
                    "transition-all duration-[120ms] uppercase",
                    filter === f.key
                      ? "text-text-hi border-line-2 bg-surface"
                      : "text-muted border-transparent hover:text-text-hi",
                  ].join(" ")}
                >
                  {f.label}
                  {f.count !== undefined && f.count > 0 && (
                    <span className="ml-[4px] text-muted text-[10px]">{f.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Sort + Create */}
            <div className="flex gap-[8px] items-center">
              <div className="flex gap-[2px] border border-line rounded-sm">
                {sorts.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSort(s.key)}
                    className={[
                      "px-[8px] py-[3px] text-[10px] cursor-pointer transition-all duration-[120ms]",
                      sort === s.key ? "text-text-hi bg-surface" : "text-muted hover:text-text-hi",
                    ].join(" ")}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <Link href="/create">
                <button className="px-[10px] py-[4px] bg-text-hi text-bg border border-text-hi rounded-sm font-mono text-[11px] tracking-[0.03em] font-medium cursor-pointer">
                  + NEW
                </button>
              </Link>
            </div>
          </div>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="flex-1 min-w-0 flex flex-col">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid gap-[12px] px-[24px] py-[12px] border-b border-line grid-cols-[1fr_60px_160px_80px_72px_60px]">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <div key={j} className="h-[14px] animate-pulse rounded-sm bg-surface border border-line" />
                  ))}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-[24px] text-no font-mono text-[12px]">
              Error: {(error as Error).message}
            </div>
          )}

          {filtered.length > 0 && (
            <MarketTable markets={filtered} selectedId={selectedId} onSelect={setSelectedId} priceHistories={priceHistories} />
          )}

          {!isLoading && !error && filtered.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-[12px] p-[48px]">
              <div className="text-[11px] text-muted font-mono uppercase tracking-[0.05em]">
                {filter === "positions" ? "No positions found" : "No markets yet"}
              </div>
              <Link href="/create">
                <button className="px-[14px] py-[6px] bg-text-hi text-bg border border-text-hi rounded-sm font-mono text-[11px] tracking-[0.03em] font-medium cursor-pointer">
                  + CREATE MARKET
                </button>
              </Link>
            </div>
          )}
        </main>

        {selectedMarket ? (
          <MarketDetailPanel market={selectedMarket} />
        ) : (
          <PortfolioPanel />
        )}
      </div>
    </>
  );
}
