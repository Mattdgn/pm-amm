"use client";

import { useState, useMemo } from "react";
import { StatusBar } from "@/components/layout/status-bar";
import { Sidebar, type SidebarFilter, type SidebarSort } from "@/components/layout/sidebar";
import { MarketTable } from "@/components/market-table";
import { MarketDetailPanel } from "@/components/market-detail-panel";
import { useMarkets } from "@/hooks/use-markets";
import { useUserPositions } from "@/hooks/use-user-positions";
import { PortfolioPanel } from "@/components/portfolio-panel";
import { poolValue } from "@/lib/pm-math";
import Link from "next/link";

export default function Home() {
  const { data: markets, isLoading, error } = useMarkets();
  const { data: userPositions } = useUserPositions(markets);
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
      <div className="grid min-h-[calc(100vh-38px)]" style={{ gridTemplateColumns: "220px 1fr 300px" }}>
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
            <div className="p-[24px] text-muted font-mono text-[12px]">Loading markets...</div>
          )}
          {error && (
            <div className="p-[24px] text-no font-mono text-[12px]">
              Error: {(error as Error).message}
            </div>
          )}
          {filtered.length > 0 && (
            <MarketTable markets={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <div className="p-[24px] text-muted font-mono text-[12px]">
              {filter === "positions" ? "No positions found. Trade to open one." : "No markets found."}
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
