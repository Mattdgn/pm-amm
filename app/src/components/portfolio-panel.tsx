"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { MetaRow } from "@/components/ui/meta-row";
import { Figure } from "@/components/ui/figure";
import { Button } from "@/components/ui/button";
import { useMarkets, type MarketData } from "@/hooks/use-markets";
import { useUserTokens } from "@/hooks/use-user-tokens";
import { useLpPosition, type LpPositionData } from "@/hooks/use-lp-position";
import { useProgram } from "@/hooks/use-program";
import { formatUsdc, lpPositionPnl } from "@/lib/pm-math";
import { USDC_MINT, solscanTxUrl } from "@/lib/constants";
import { deriveYesMint, deriveNoMint } from "@/lib/pda";
import { BN } from "@anchor-lang/core";
import { toast } from "sonner";
import Link from "next/link";

function useUsdcBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery<number>({
    queryKey: ["usdc-balance", publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) return 0;
      try {
        const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const acc = await getAccount(connection, ata);
        return Number(acc.amount);
      } catch {
        return 0;
      }
    },
    enabled: !!publicKey,
    refetchInterval: 10_000,
  });
}

function TradePosition({ market }: { market: MarketData }) {
  const marketPda = new PublicKey(market.publicKey);
  const yesMint = deriveYesMint(marketPda).toBase58();
  const noMint = deriveNoMint(marketPda).toBase58();
  const { data: tokens } = useUserTokens(yesMint, noMint, USDC_MINT.toBase58());

  const yesAmt = tokens?.yes ?? 0;
  const noAmt = tokens?.no ?? 0;
  if (yesAmt === 0 && noAmt === 0) return null;

  const estValue = market.resolved
    ? (market.winningSide === 1 ? yesAmt : market.winningSide === 2 ? noAmt : 0)
    : yesAmt * market.price + noAmt * (1 - market.price);

  return (
    <Link href={`/market/${market.marketId}`} className="block border-b border-line py-[10px] hover:bg-surface transition-all duration-[120ms] -mx-[4px] px-[4px]">
      <div className="flex justify-between items-baseline mb-[4px]">
        <span className="font-sans text-[12px] text-text-hi truncate mr-[8px]">{market.name}</span>
        <span className="text-[11px] tnum text-text-dim shrink-0">~{formatUsdc(estValue)}</span>
      </div>
      <div className="flex gap-[12px] text-[10px]">
        {yesAmt > 0 && <span className="text-yes tnum">{formatUsdc(yesAmt)} YES</span>}
        {noAmt > 0 && <span className="text-no tnum">{formatUsdc(noAmt)} NO</span>}
      </div>
    </Link>
  );
}

function LpPositionRow({ market }: { market: MarketData }) {
  const { data: lp } = useLpPosition(market.publicKey);
  const marketPdaLp = new PublicKey(market.publicKey);
  const yMint = deriveYesMint(marketPdaLp).toBase58();
  const nMint = deriveNoMint(marketPdaLp).toBase58();
  const { data: lpTokens } = useUserTokens(yMint, nMint, USDC_MINT.toBase58());
  if (!lp || lp.shares <= 0) return null;

  const pos = lpPositionPnl(
    lp.shares, market.totalLpShares, lp.collateralDeposited, market.price, market.lEff,
    market.cumYesPerShare, market.cumNoPerShare, lp.yesCheckpoint, lp.noCheckpoint,
    lpTokens?.yes ?? 0, lpTokens?.no ?? 0, market.reserveYes, market.reserveNo,
  );

  return (
    <Link href={`/market/${market.marketId}/lp`} className="block border-b border-line py-[10px] hover:bg-surface transition-all duration-[120ms] -mx-[4px] px-[4px]">
      <div className="flex justify-between items-baseline mb-[4px]">
        <span className="font-sans text-[12px] text-text-hi truncate mr-[8px]">{market.name}</span>
        <span className={`text-[11px] tnum shrink-0 ${pos.pnl >= 0 ? "text-yes" : "text-no"}`}>
          {pos.pnl >= 0 ? "+" : ""}{formatUsdc(Math.abs(pos.pnl))}
        </span>
      </div>
      <div className="flex gap-[12px] text-[10px] text-muted">
        <span>Pool {pos.poolSharePct.toFixed(1)}%</span>
        <span>{formatUsdc(lp.collateralDeposited)} deposited</span>
      </div>
    </Link>
  );
}

function ResolvableMarket({ market }: { market: MarketData }) {
  const program = useProgram();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const now = Math.floor(Date.now() / 1000);
  const isExpired = now >= market.endTs;
  const isAuthority = publicKey?.toBase58() === market.authority;

  if (market.resolved || !isExpired || !isAuthority) return null;

  const handleResolve = async (side: "yes" | "no") => {
    if (!program || !publicKey) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const tx = await (program.methods as any)
        .resolveMarket({ [side]: {} })
        .accounts({
          signer: publicKey,
          market: marketPda,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .rpc();
      toast.success(`Resolved: ${side.toUpperCase()} wins`, {
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
      queryClient.invalidateQueries({ queryKey: ["markets"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) {
        toast.info("Transaction cancelled");
      } else {
        toast.error("Resolve failed", { description: msg.slice(0, 120) });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-b border-line py-[10px]">
      <div className="font-sans text-[12px] text-text-hi truncate mb-[6px]">{market.name}</div>
      <div className="flex gap-[6px]">
        <Button variant="yes" className="flex-1 text-[10px] py-[4px]" onClick={() => handleResolve("yes")} disabled={loading}>
          YES
        </Button>
        <Button variant="no" className="flex-1 text-[10px] py-[4px]" onClick={() => handleResolve("no")} disabled={loading}>
          NO
        </Button>
      </div>
    </div>
  );
}

export function PortfolioPanel() {
  const { publicKey } = useWallet();
  const { data: markets } = useMarkets();
  const { data: usdcBalance } = useUsdcBalance();

  if (!publicKey) {
    return (
      <aside className="border-l border-line p-[20px] hidden xl:flex items-center justify-center">
        <span className="text-muted font-mono text-[11px] tracking-[0.03em]">
          CONNECT WALLET
        </span>
      </aside>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const resolvable = markets?.filter(
    (m) => !m.resolved && now >= m.endTs && m.authority === publicKey.toBase58()
  ) ?? [];

  return (
    <aside className="border-l border-line p-[16px] font-mono text-[12px] hidden xl:block overflow-y-auto">
      <div className="text-[10px] text-muted uppercase tracking-[0.08em] pb-[8px] border-b border-line mb-[10px]">
        PORTFOLIO
      </div>

      <Figure
        label="USDC"
        value={formatUsdc(usdcBalance ?? 0)}
        size="data"
        color="default"
      />

      {/* Resolve actions */}
      {resolvable.length > 0 && (
        <>
          <div className="text-[10px] text-no uppercase tracking-[0.08em] mt-[16px] mb-[6px]">
            NEEDS RESOLUTION ({resolvable.length})
          </div>
          {resolvable.map((m) => (
            <ResolvableMarket key={m.publicKey} market={m} />
          ))}
        </>
      )}

      {/* Trade positions */}
      <div className="text-[10px] text-muted uppercase tracking-[0.08em] mt-[16px] mb-[6px]">
        BETS
      </div>
      {markets && markets.length > 0 ? (
        markets.map((m) => <TradePosition key={m.publicKey} market={m} />)
      ) : (
        <p className="text-[11px] text-muted py-[8px]">No markets.</p>
      )}

      {/* LP positions */}
      <div className="text-[10px] text-muted uppercase tracking-[0.08em] mt-[16px] mb-[6px]">
        LP POSITIONS
      </div>
      {markets && markets.length > 0 ? (
        markets.map((m) => <LpPositionRow key={m.publicKey} market={m} />)
      ) : (
        <p className="text-[11px] text-muted py-[8px]">No LP positions.</p>
      )}
    </aside>
  );
}
