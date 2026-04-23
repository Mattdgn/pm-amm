"use client";

import { use, useState } from "react";
import { StatusBar } from "@/components/layout/status-bar";
import { Figure } from "@/components/ui/figure";
import { MetaRow } from "@/components/ui/meta-row";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PriceChart } from "@/components/price-chart";
import { ResidualsWidget } from "@/components/residuals-widget";
import { useMarkets } from "@/hooks/use-markets";
import { useUserTokens } from "@/hooks/use-user-tokens";
import { useLpPosition } from "@/hooks/use-lp-position";
import { useProgram } from "@/hooks/use-program";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatUsdc,
  poolValue,
  expectedDailyLvr,
  expectedTerminalWealth,
  simulateLpDeposit,
  lpPositionPnl,
  formatTimeRemaining,
} from "@/lib/pm-math";
import { deriveYesMint, deriveNoMint } from "@/lib/pda";
import { USDC_MINT, solscanTxUrl } from "@/lib/constants";
import {
  PublicKey,
  ComputeBudgetProgram,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { BN } from "@anchor-lang/core";
import { toast } from "sonner";
import Link from "next/link";

export default function LpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: markets, isLoading } = useMarkets();
  const market = markets?.find((m) => m.marketId === Number(id));

  const marketPda = market ? new PublicKey(market.publicKey) : undefined;
  const yesMint = marketPda ? deriveYesMint(marketPda).toBase58() : undefined;
  const noMint = marketPda ? deriveNoMint(marketPda).toBase58() : undefined;

  const { data: tokens } = useUserTokens(yesMint, noMint, USDC_MINT.toBase58());
  const { data: lp } = useLpPosition(market?.publicKey);
  const program = useProgram();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();

  const [depositAmt, setDepositAmt] = useState("");
  const [loading, setLoading] = useState(false);

  const name = market?.name ?? `Market #${id}`;
  const now = Math.floor(Date.now() / 1000);
  const remaining = market ? Math.max(market.endTs - now, 0) : 0;
  const isExpired = remaining <= 0;

  // --- Pool stats ---
  const pv = market ? poolValue(market.price, market.lEff) : 0;
  const dailyLvr = market ? expectedDailyLvr(market.price, market.lEff, remaining) : 0;

  // --- Position P&L ---
  const posData = market && lp && lp.shares > 0
    ? lpPositionPnl(
        lp.shares, market.totalLpShares, lp.collateralDeposited, market.price, market.lEff,
        market.cumYesPerShare, market.cumNoPerShare, lp.yesCheckpoint, lp.noCheckpoint,
        tokens?.yes ?? 0, tokens?.no ?? 0, market.reserveYes, market.reserveNo,
      )
    : null;

  // --- Deposit simulation ---
  const depositNum = parseFloat(depositAmt) || 0;
  const depositSim = market && depositNum > 0
    ? simulateLpDeposit(
        depositNum * 1e6, market.price, market.lEff,
        market.totalLpShares, remaining, market.lZero,
      )
    : null;

  // --- Handlers ---
  const handleDeposit = async () => {
    if (!program || !publicKey || !depositAmt || !market) return;
    setLoading(true);
    try {
      const mPda = new PublicKey(market.publicKey);
      const vault = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), mPda.toBuffer()], program.programId)[0];
      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const [lpPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), mPda.toBuffer(), publicKey.toBuffer()], program.programId);

      const tx = await (program.methods as any)
        .depositLiquidity(new BN(Math.floor(depositNum * 1e6)))
        .accounts({
          signer: publicKey, market: mPda, collateralMint: USDC_MINT,
          vault, userCollateral: userUsdc, lpPosition: lpPda,
          systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .rpc();

      toast.success(`Deposited ${depositNum} USDC`, {
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
      setDepositAmt("");
      queryClient.invalidateQueries({ queryKey: ["lp-position"] });
      queryClient.invalidateQueries({ queryKey: ["markets"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) {
        toast.info("Transaction cancelled");
      } else {
        toast.error("Deposit failed", { description: msg.slice(0, 120) });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!program || !publicKey || !lp || !market) return;
    setLoading(true);
    try {
      const mPda = new PublicKey(market.publicKey);
      const yMint = deriveYesMint(mPda);
      const nMint = deriveNoMint(mPda);
      const userYes = await getAssociatedTokenAddress(yMint, publicKey);
      const userNo = await getAssociatedTokenAddress(nMint, publicKey);
      const [lpPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), mPda.toBuffer(), publicKey.toBuffer()], program.programId);

      const conn = program.provider.connection;
      const preIxs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })];
      for (const [ata, mint] of [[userYes, yMint], [userNo, nMint]] as [PublicKey, PublicKey][]) {
        try { await getAccount(conn, ata); } catch {
          preIxs.push(createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint));
        }
      }

      const sharesBn = new BN((BigInt(Math.floor(lp.shares * 2 ** 48))).toString());
      const tx = await (program.methods as any)
        .withdrawLiquidity(sharesBn)
        .accounts({
          signer: publicKey, market: mPda, collateralMint: USDC_MINT,
          yesMint: yMint, noMint: nMint, lpPosition: lpPda,
          userYes, userNo, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(preIxs)
        .rpc();

      toast.success("Withdrew all liquidity", {
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
      queryClient.invalidateQueries({ queryKey: ["lp-position"] });
      queryClient.invalidateQueries({ queryKey: ["markets"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) {
        toast.info("Transaction cancelled");
      } else {
        toast.error("Withdraw failed", { description: msg.slice(0, 120) });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-[48px] py-[32px]">
        <div className="flex items-center gap-[12px] mb-[16px]">
          <Link
            href={`/market/${id}`}
            className="text-[12px] text-muted hover:text-text-hi transition-all duration-[120ms] font-mono tracking-[0.03em]"
          >
            ← {name}
          </Link>
        </div>

        {isLoading && <p className="text-muted font-mono text-[12px]">Loading...</p>}
        {!isLoading && !market && <p className="text-no font-mono text-[12px]">Market not found.</p>}

        {market && (
          <div className="space-y-[24px]">
            {/* Title */}
            <div className="flex items-center gap-[12px] flex-wrap">
              <h2 className="text-title">Provide Liquidity</h2>
              {isExpired
                ? <Badge variant="no">Expired</Badge>
                : <Badge variant="yes" dot>{formatTimeRemaining(market.endTs)} left</Badge>}
            </div>

            {/* Pool Overview */}
            <div className="border border-line p-[16px] space-y-[12px]">
              <div className="text-caption">POOL OVERVIEW</div>
              <div className="flex gap-[32px] flex-wrap">
                <Figure label="Pool Value" value={`$${formatUsdc(pv)}`} size="data" />
                <Figure label="YES Price" value={market.price.toFixed(4)} size="data" color="yes" />
                <Figure label="NO Price" value={(1 - market.price).toFixed(4)} size="data" color="no" />
              </div>
              <MetaRow label="Total LP Shares" value={market.totalLpShares.toFixed(2)} />
              <MetaRow label="L_0" value={market.lZero.toFixed(6)} />
              <MetaRow label="L_eff" value={market.lEff.toFixed(2)} />
              <MetaRow
                label="Expected Daily LVR"
                value={`$${formatUsdc(dailyLvr)}`}
                last
              />
            </div>

            {/* LP Economics */}
            <div className="border border-line p-[16px] space-y-[12px]">
              <div className="text-caption">LP ECONOMICS — pm-AMM</div>
              <div className="space-y-[6px] text-[12px] text-muted font-mono">
                <p>LPs earn YES+NO tokens over time via the <span className="text-text-hi">dC_t mechanism</span> (residuals). Your payout depends on which side wins.</p>
                <p>The <span className="text-text-hi">LVR cost</span> (loss vs rebalancing) is the fee traders implicitly pay you. It&apos;s uniform across time and price — the key innovation of pm-AMM.</p>
                <p>On average across many markets (random walk), LPs keep ~50% of their deposit. But on <span className="text-text-hi">individual markets</span>, you can profit or lose more depending on the outcome.</p>
              </div>
              {lp && lp.collateralDeposited > 0 && posData && (
                <>
                  <MetaRow
                    label="Expected value (prob-weighted)"
                    value={(() => {
                      const ev = posData.ifYesWins * market.price + posData.ifNoWins * (1 - market.price);
                      const evPct = ((ev - lp.collateralDeposited) / lp.collateralDeposited * 100);
                      return <span className={evPct >= 0 ? "text-yes" : "text-no"}>
                        ${formatUsdc(ev)} ({evPct >= 0 ? "+" : ""}{evPct.toFixed(1)}%)
                      </span>;
                    })()}
                    last
                  />
                </>
              )}
            </div>

            {/* Your Position */}
            {lp && lp.shares > 0 && posData && (
              <div className="border border-line p-[16px] space-y-[12px]">
                <div className="text-caption">YOUR LP POSITION</div>
                <MetaRow label="Deposited" value={`$${formatUsdc(lp.collateralDeposited)}`} />
                <MetaRow label="Pool Share" value={`${posData.poolSharePct.toFixed(2)}%`} />
                <MetaRow label="Still in pool" value={`$${formatUsdc(posData.poolValue)}`} />
                <MetaRow label="YES tokens (pending+wallet)" value={`${formatUsdc(posData.totalYes)}`} />
                <MetaRow label="NO tokens (pending+wallet)" value={`${formatUsdc(posData.totalNo)}`} />

                <div className="border-t border-line pt-[8px] mt-[8px]">
                  <p className="text-[10px] text-muted uppercase tracking-[0.08em] mb-[6px]">AT RESOLUTION</p>
                  {(() => {
                    const dep = lp.collateralDeposited;
                    const yesReturn = posData.ifYesWins;
                    const noReturn = posData.ifNoWins;
                    const yesPnl = ((yesReturn - dep) / dep * 100);
                    const noPnl = ((noReturn - dep) / dep * 100);
                    return (
                      <>
                        <MetaRow label="If YES wins" value={
                          <span className={yesPnl >= 0 ? "text-yes" : "text-no"}>
                            ${formatUsdc(yesReturn)} ({yesPnl >= 0 ? "+" : ""}{yesPnl.toFixed(1)}%)
                          </span>
                        } />
                        <MetaRow label="If NO wins" value={
                          <span className={noPnl >= 0 ? "text-yes" : "text-no"}>
                            ${formatUsdc(noReturn)} ({noPnl >= 0 ? "+" : ""}{noPnl.toFixed(1)}%)
                          </span>
                        } last />
                      </>
                    );
                  })()}
                </div>

                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleWithdraw}
                  disabled={loading || market.resolved}
                >
                  {loading ? "WITHDRAWING..." : "Withdraw All"}
                </Button>
              </div>
            )}

            {/* Residuals */}
            {lp && lp.shares > 0 && (
              <ResidualsWidget market={market} />
            )}

            {/* Deposit */}
            {!isExpired && !market.resolved && (
              <div className="border border-line p-[16px] space-y-[12px]">
                <div className="text-caption">DEPOSIT LIQUIDITY</div>

                <div className="flex gap-[8px]">
                  <AmountInput
                    placeholder="0.00"
                    unit="USDC"
                    value={depositAmt}
                    onChange={(e) => setDepositAmt(e.target.value)}
                    type="number"
                    min="0.001"
                    step="0.01"
                    className="flex-1"
                  />
                  <Button
                    variant="yes"
                    onClick={handleDeposit}
                    disabled={!publicKey || !depositAmt || loading || depositNum <= 0}
                    className="shrink-0"
                  >
                    {loading ? "..." : "Deposit"}
                  </Button>
                </div>

                {/* Deposit simulation */}
                {depositSim && depositNum > 0 && (
                  <div className="border-t border-line pt-[8px] space-y-[2px]">
                    <MetaRow label="Shares received" value={`${(depositSim.newShares / 1e6).toFixed(2)}`} />
                    <MetaRow label="Your pool share" value={`${depositSim.poolSharePct.toFixed(2)}%`} />
                    <MetaRow label="Est. daily yield (dC_t)" value={`$${formatUsdc(depositSim.estDailyYield)}`} />
                    <MetaRow
                      label="Expected at expiry"
                      value={`~$${formatUsdc(depositNum * 1e6 / 2)}`}
                      last
                    />
                    <p className="text-[10px] text-muted/60 font-mono pt-[4px]">
                      Based on E[W_T] = W_0/2 (random walk assumption). Actual returns depend on price path.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Price chart for context */}
            <PriceChart marketId={market.publicKey} currentPrice={market.price} />
          </div>
        )}
      </main>
    </>
  );
}
