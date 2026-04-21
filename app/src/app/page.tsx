"use client";

import { useState, useMemo } from "react";
import { StatusBar } from "@/components/layout/status-bar";
import { Sidebar, type SidebarFilter, type SidebarSort } from "@/components/layout/sidebar";
import { MarketTable } from "@/components/market-table";
import { MarketDetailPanel } from "@/components/market-detail-panel";
import { useMarkets } from "@/hooks/use-markets";
import { useUserPositions } from "@/hooks/use-user-positions";
import { usePriceRecorder } from "@/hooks/use-price-recorder";
import { usePriceHistories } from "@/hooks/use-price-histories";
import { PortfolioPanel } from "@/components/portfolio-panel";
import { poolValue } from "@/lib/pm-math";
import Link from "next/link";

export default function Home() {
  const { data: markets, isLoading, error } = useMarkets();
  const { data: userPositions } = useUserPositions(markets);
  usePriceRecorder(markets);
  const priceHistories = usePriceHistories(markets);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<SidebarFilter>("all");
  const [sort, setSort] = useState<SidebarSort>("tvl");

  const filtered = useMemo(() => {
    if (!markets) return [];
    let result = [...markets];

    if (filter === "active") result = result.filter((m) => !m.resolved);
    else if (filter === "resolved") result = result.filter((m) => m.resolved);
    else if (filter === "expiring") {
      const now = Math.floor(Date.now() / 1000);
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

  return (
    <>
      <StatusBar />
      <div className="grid min-h-[calc(100vh-38px)] grid-cols-1 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_300px]">
        <Sidebar
          filter={filter}
          sort={sort}
          onFilterChange={setFilter}
          onSortChange={setSort}
          positionCount={positionCount}
        />

        <main className="flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-[24px] py-[14px] border-b border-line font-mono text-[11px] text-muted tracking-[0.05em]">
            <div className="flex gap-[4px]">
              {(["all", "active", "expiring", "resolved"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={[
                    "px-[12px] py-[5px] rounded-sm border cursor-pointer",
                    "transition-all duration-[120ms] uppercase",
                    filter === f
                      ? "text-text-hi border-line-2 bg-surface"
                      : "text-muted border-transparent hover:text-text-hi",
                  ].join(" ")}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex gap-[10px] items-center">
              <Link href="/create">
                <button className="px-[10px] py-[5px] bg-text-hi text-bg border border-text-hi rounded-sm font-mono text-[11px] tracking-[0.03em] font-medium cursor-pointer">
                  + NEW MARKET
                </button>
              </Link>
            </div>
          </div>

          {isLoading && (
            <div className="flex-1 min-w-0 flex flex-col">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid gap-[16px] px-[24px] py-[12px] border-b border-line grid-cols-[48px_1fr_80px_80px_80px_100px_90px_80px]">
                  {Array.from({ length: 8 }).map((_, j) => (
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
                {filter === "positions"
                  ? "No positions found"
                  : "No markets yet"}
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
