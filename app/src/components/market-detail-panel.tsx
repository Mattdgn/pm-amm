"use client";

import { MetaRow } from "@/components/ui/meta-row";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUserTokens } from "@/hooks/use-user-tokens";
import { usePositionValue } from "@/hooks/use-position-value";
import { formatUsdc, poolValue } from "@/lib/pm-math";
import { Countdown } from "@/components/ui/countdown";
import type { MarketData } from "@/hooks/use-markets";
import { USDC_MINT, PROGRAM_ID, solscanAccountUrl } from "@/lib/constants";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";

function truncateKey(key: string): string {
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

interface MarketDetailPanelProps {
  market: MarketData;
}

export function MarketDetailPanel({ market }: MarketDetailPanelProps) {
  const pv = market.lEff > 0 ? poolValue(market.price, market.lEff) : 0;
  const yesP = market.price * 100;

  // Derive mints for token lookup
  const marketPda = new PublicKey(market.publicKey);
  const yesMint = PublicKey.findProgramAddressSync(
    [Buffer.from("yes_mint"), marketPda.toBuffer()], PROGRAM_ID
  )[0].toBase58();
  const noMint = PublicKey.findProgramAddressSync(
    [Buffer.from("no_mint"), marketPda.toBuffer()], PROGRAM_ID
  )[0].toBase58();

  const { data: tokens } = useUserTokens(yesMint, noMint, USDC_MINT.toBase58());
  const { data: posValue } = usePositionValue(market.publicKey, tokens ?? null);

  const hasPosition = (tokens?.yes ?? 0) > 0 || (tokens?.no ?? 0) > 0;

  return (
    <aside className="border-l border-line p-[20px] font-mono text-[12px] hidden xl:block overflow-y-auto">
      <div className="flex justify-between text-[10px] text-muted uppercase tracking-[0.08em] pb-[10px] border-b border-line mb-[16px]">
        <span>SELECTED</span>
        <span>#{market.marketId}</span>
      </div>

      <div className="text-[10px] text-muted tracking-[0.03em] mb-[6px]">
        #{market.marketId} · {truncateKey(market.publicKey)}
      </div>
      <div className="font-sans text-[17px] text-text-hi tracking-[-0.015em] leading-[1.3] mb-[16px]">
        {market.name}
      </div>

      {/* Price boxes */}
      <div className="grid grid-cols-2 gap-[8px] mb-[12px]">
        <div className="p-[12px] border rounded-sm border-[color-mix(in_oklch,var(--yes)_30%,transparent)] bg-yes-soft">
          <div className="text-[10px] text-yes uppercase tracking-[0.08em] mb-[6px]">YES</div>
          <div className="text-[22px] text-yes tnum tracking-[-0.02em]">
            {market.price.toFixed(4)}
          </div>
        </div>
        <div className="p-[12px] border rounded-sm border-[color-mix(in_oklch,var(--no)_30%,transparent)] bg-no-soft">
          <div className="text-[10px] text-no uppercase tracking-[0.08em] mb-[6px]">NO</div>
          <div className="text-[22px] text-no tnum tracking-[-0.02em]">
            {(1 - market.price).toFixed(4)}
          </div>
        </div>
      </div>

      <ProbabilityBar yesPercent={yesP} className="mb-[16px]" />

      {/* Market meta */}
      <MetaRow label="TVL" value={`$${formatUsdc(pv)}`} />
      <MetaRow label="Expires" value={<Countdown endTs={market.endTs} />} />
      <MetaRow label="LP Shares" value={market.totalLpShares.toFixed(2)} />
      <MetaRow label="Address" value={truncateKey(market.publicKey)} last />

      {/* User position */}
      {hasPosition && (
        <>
          <div className="text-[10px] text-muted uppercase tracking-[0.08em] mt-[20px] mb-[8px]">
            YOUR POSITION
          </div>

          <div className="grid grid-cols-2 gap-[8px] mb-[8px]">
            {(tokens?.yes ?? 0) > 0 && (
              <div className="p-[8px] border border-line rounded-sm">
                <div className="text-[9px] text-yes uppercase tracking-[0.08em] mb-[4px]">YES</div>
                <div className="text-[16px] text-yes tnum">{formatUsdc(tokens!.yes)}</div>
              </div>
            )}
            {(tokens?.no ?? 0) > 0 && (
              <div className="p-[8px] border border-line rounded-sm">
                <div className="text-[9px] text-no uppercase tracking-[0.08em] mb-[4px]">NO</div>
                <div className="text-[16px] text-no tnum">{formatUsdc(tokens!.no)}</div>
              </div>
            )}
          </div>

          {/* Position value from on-chain simulation */}
          {posValue && !posValue.error && (
            <>
              {(tokens?.yes ?? 0) > 0 && (
                <MetaRow label="YES → USDC" value={`${formatUsdc(posValue.yesValueUsdc)}`} />
              )}
              {(tokens?.no ?? 0) > 0 && (
                <MetaRow label="NO → USDC" value={`${formatUsdc(posValue.noValueUsdc)}`} />
              )}
              <MetaRow label="Total value" value={`${formatUsdc(posValue.totalUsdc)} USDC`} last />
            </>
          )}
          {posValue?.error && (
            <div className="text-[10px] text-no mt-[4px]">{posValue.error}</div>
          )}

          {/* Resolved state */}
          {market.resolved && (
            <div className="mt-[8px]">
              <Badge variant={market.winningSide === 1 ? "yes" : "no"} dot>
                {market.winningSide === 1 ? "YES" : "NO"} WON
              </Badge>
            </div>
          )}
        </>
      )}

      {!hasPosition && tokens && (
        <div className="mt-[20px] text-[10px] text-muted uppercase tracking-[0.08em]">
          NO POSITION
        </div>
      )}

      {/* Actions */}
      {!market.resolved && (
        <div className="grid grid-cols-2 gap-[6px] mt-[14px]">
          <Link href={`/market/${market.marketId}`}>
            <Button variant="yes" className="w-full uppercase text-[11px] tracking-[0.05em]">
              BUY YES · {market.price.toFixed(2)}
            </Button>
          </Link>
          <Link href={`/market/${market.marketId}`}>
            <Button variant="no" className="w-full uppercase text-[11px] tracking-[0.05em]">
              BUY NO · {(1 - market.price).toFixed(2)}
            </Button>
          </Link>
        </div>
      )}

      <Link
        href={`/market/${market.marketId}`}
        className="block mt-[8px] text-center text-[11px] text-text-dim hover:text-text-hi transition-all duration-[120ms]"
      >
        Open market →
      </Link>

      <a
        href={solscanAccountUrl(market.publicKey)}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-[6px] text-center text-[11px] text-muted hover:text-text-hi transition-all duration-[120ms]"
      >
        Solscan ↗
      </a>
    </aside>
  );
}
