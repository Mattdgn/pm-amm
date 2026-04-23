"use client";

import { use } from "react";
import { StatusBar } from "@/components/layout/status-bar";
import { TradePanel } from "@/components/trade-panel";
import { RecentTrades } from "@/components/recent-trades";
import { ResidualsWidget } from "@/components/residuals-widget";
import { PositionCard } from "@/components/position-card";
import { MarketProjections } from "@/components/market-projections";
import { PriceChart } from "@/components/price-chart";
import { Figure } from "@/components/ui/figure";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { MetaRow } from "@/components/ui/meta-row";
import { Badge } from "@/components/ui/badge";
import { useMarkets } from "@/hooks/use-markets";
import { useUserTokens } from "@/hooks/use-user-tokens";
import { formatUsdc, poolValue } from "@/lib/pm-math";
import { Countdown } from "@/components/ui/countdown";
import { USDC_MINT, solscanAccountUrl } from "@/lib/constants";
import { deriveYesMint, deriveNoMint } from "@/lib/pda";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import Link from "next/link";

export default function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: markets, isLoading } = useMarkets();
  const market = markets?.find((m) => m.marketId === Number(id));

  const marketPda = market ? new PublicKey(market.publicKey) : undefined;
  const yesMint = marketPda ? deriveYesMint(marketPda).toBase58() : undefined;
  const noMint = marketPda ? deriveNoMint(marketPda).toBase58() : undefined;

  const { data: tokens } = useUserTokens(yesMint, noMint, USDC_MINT.toBase58());
  const name = market?.name ?? `Market #${id}`;

  return (
    <>
      <StatusBar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-[48px] py-[32px]">
        <Link
          href="/"
          className="text-[12px] text-muted hover:text-text-hi transition-all duration-[120ms] mb-[16px] block font-mono tracking-[0.03em]"
        >
          ← BACK
        </Link>

        {isLoading && <p className="text-muted font-mono text-[12px]">Loading...</p>}
        {!isLoading && !market && <p className="text-no font-mono text-[12px]">Market #{id} not found.</p>}

        {market && (() => {
          const now = Math.floor(Date.now() / 1000);
          const isExpired = now >= market.endTs;
          const isResolved = market.resolved;
          const isAwaitingResolution = isExpired && !isResolved;
          const isActive = !isExpired && !isResolved;

          const headerBadge = isResolved
            ? <Badge variant={market.winningSide === 1 ? "yes" : "no"}>{market.winningSide === 1 ? "YES" : "NO"} WON</Badge>
            : isAwaitingResolution
              ? <Badge variant="no">Awaiting Resolution</Badge>
              : <Badge variant="yes" dot>Active</Badge>;

          return (
            <div className="space-y-[24px]">
              {/* Header */}
              <div className="flex items-center gap-[12px] flex-wrap">
                <h2 className="text-title">{name}</h2>
                {headerBadge}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("Link copied");
                  }}
                  className="text-[11px] text-muted hover:text-text-hi transition-all duration-[120ms] font-mono cursor-pointer"
                >
                  Copy link
                </button>
                <a
                  href={solscanAccountUrl(market.publicKey)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-muted hover:text-text-hi transition-all duration-[120ms] font-mono"
                >
                  Solscan ↗
                </a>
              </div>

              {isResolved ? (
                /* ====== RESOLVED ====== */
                <div className="space-y-[24px]">
                  <div className={`border p-[24px] text-center space-y-[8px] ${
                    market.winningSide === 1
                      ? "border-yes/30 bg-yes/5"
                      : "border-no/30 bg-no/5"
                  }`}>
                    <p className="text-[11px] font-mono text-muted uppercase tracking-[0.08em]">Resolved</p>
                    <p className={`text-[32px] font-mono font-bold tracking-tight ${
                      market.winningSide === 1 ? "text-yes" : "text-no"
                    }`}>
                      {market.winningSide === 1 ? "YES" : "NO"}
                    </p>
                    <p className="text-[12px] text-muted font-mono">
                      {new Date(market.endTs * 1000).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </p>
                  </div>

                  <PriceChart marketId={market.publicKey} currentPrice={market.price} />
                  <PositionCard market={market} tokens={tokens ?? null} />

                  <Link
                    href={`/market/${id}/lp`}
                    className="block border border-line p-[16px] text-center text-[12px] text-muted hover:text-text-hi hover:border-line-2 transition-all duration-[120ms] font-mono"
                  >
                    Manage Liquidity Position ↗
                  </Link>
                </div>

              ) : isAwaitingResolution ? (
                /* ====== EXPIRED — AWAITING RESOLUTION ====== */
                <div className="space-y-[24px]">
                  <div className="border border-line-2 p-[24px] text-center space-y-[8px]">
                    <p className="text-[11px] font-mono text-muted uppercase tracking-[0.08em]">Market Expired</p>
                    <p className="text-[24px] font-mono font-bold tracking-tight text-muted">
                      Awaiting Resolution
                    </p>
                    <p className="text-[12px] text-muted font-mono">
                      Expired {new Date(market.endTs * 1000).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                    <p className="text-[11px] text-muted/60 font-mono mt-[4px]">
                      Trading is closed. The market authority will resolve the outcome.
                    </p>
                  </div>

                  {/* Last known prices */}
                  <div>
                    <p className="text-caption mb-[8px]">LAST PRICE</p>
                    <div className="flex gap-[48px] mb-[12px]">
                      <Figure label="YES" value={market.price.toFixed(4)} size="price" color="yes" />
                      <Figure label="NO" value={(1 - market.price).toFixed(4)} size="price" color="no" />
                    </div>
                    <ProbabilityBar yesPercent={market.price * 100} />
                  </div>

                  <PriceChart marketId={market.publicKey} currentPrice={market.price} />
                  <PositionCard market={market} tokens={tokens ?? null} />

                  <Link
                    href={`/market/${id}/lp`}
                    className="block border border-line p-[16px] text-center text-[12px] text-muted hover:text-text-hi hover:border-line-2 transition-all duration-[120ms] font-mono"
                  >
                    Manage Liquidity Position ↗
                  </Link>
                </div>

              ) : (
                /* ====== ACTIVE ====== */
                <div className="space-y-[24px]">
                  <div>
                    <div className="flex gap-[48px] mb-[12px]">
                      <Figure label="YES" value={market.price.toFixed(4)} size="price" color="yes" />
                      <Figure label="NO" value={(1 - market.price).toFixed(4)} size="price" color="no" />
                    </div>
                    <ProbabilityBar yesPercent={market.price * 100} />
                  </div>

                  <PriceChart marketId={market.publicKey} currentPrice={market.price} />

                  <div className="max-w-md">
                    <MetaRow label="Pool Value" value={`$${formatUsdc(poolValue(market.price, market.lEff))}`} />
                    <MetaRow label="Expires" value={<Countdown endTs={market.endTs} />} last />
                  </div>

                  <MarketProjections market={market} />
                  <PositionCard market={market} tokens={tokens ?? null} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                    <TradePanel market={market} tokens={tokens ?? null} />
                    <div className="space-y-[16px]">
                      <Link
                        href={`/market/${id}/lp`}
                        className="flex items-center justify-center border border-line p-[16px] text-[12px] text-muted hover:text-text-hi hover:border-line-2 transition-all duration-[120ms] font-mono"
                      >
                        Provide Liquidity ↗
                      </Link>
                      <RecentTrades marketPda={market.publicKey} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </main>
    </>
  );
}
