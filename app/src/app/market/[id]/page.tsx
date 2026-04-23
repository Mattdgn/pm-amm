"use client";

import { use } from "react";
import { StatusBar } from "@/components/layout/status-bar";
import { TradePanel } from "@/components/trade-panel";
import { LpPanel } from "@/components/lp-panel";
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

  const programId = "GQGSTV9dig5fEwcfMpgqHjo9jAhxtnusMEbx8SrBBYnQ";
  const marketPda = market ? new PublicKey(market.publicKey) : undefined;
  const yesMint = marketPda
    ? PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()],
        new PublicKey(programId)
      )[0].toBase58()
    : undefined;
  const noMint = marketPda
    ? PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()],
        new PublicKey(programId)
      )[0].toBase58()
    : undefined;

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

        {market && (
          <div className="space-y-[24px]">
            {/* Header */}
            <div className="flex items-center gap-[12px] flex-wrap">
              <h2 className="text-title">{name}</h2>
              {market.resolved ? (
                <Badge variant={market.winningSide === 1 ? "yes" : "no"}>
                  {market.winningSide === 1 ? "YES" : "NO"} WON
                </Badge>
              ) : (
                <Badge variant="yes" dot>Active</Badge>
              )}
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

            {/* Prices + prob bar */}
            <div>
              <div className="flex gap-[48px] mb-[12px]">
                <Figure label="YES" value={market.price.toFixed(4)} size="price" color="yes" />
                <Figure label="NO" value={(1 - market.price).toFixed(4)} size="price" color="no" />
              </div>
              <ProbabilityBar yesPercent={market.price * 100} />
            </div>

            {/* Price chart */}
            <PriceChart marketId={market.publicKey} currentPrice={market.price} />

            {/* Meta */}
            <div className="max-w-md">
              <MetaRow label="Pool Value" value={`$${formatUsdc(poolValue(market.price, market.lEff))}`} />
              <MetaRow label="Expires" value={<Countdown endTs={market.endTs} />} last />
            </div>

            {/* Projections */}
            {!market.resolved && <MarketProjections market={market} />}

            {/* Position */}
            <PositionCard market={market} tokens={tokens ?? null} />

            {/* Trade / LP */}
            {!market.resolved ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                <TradePanel market={market} tokens={tokens ?? null} />
                <div className="space-y-[16px]">
                  <LpPanel market={market} />
                  <ResidualsWidget market={market} />
                </div>
              </div>
            ) : (
              <div className="space-y-[16px]">
                <LpPanel market={market} />
                <ResidualsWidget market={market} />
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
