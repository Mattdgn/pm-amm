"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Figure } from "@/components/ui/figure";
import { MetaRow } from "@/components/ui/meta-row";
import { useProgram } from "@/hooks/use-program";
import { usePositionValue } from "@/hooks/use-position-value";
import { formatUsdc } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";
import type { UserTokens } from "@/hooks/use-user-tokens";
import { PublicKey, ComputeBudgetProgram, type TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { USDC_MINT, solscanTxUrl } from "@/lib/constants";
import { deriveYesMint, deriveNoMint, deriveVault } from "@/lib/pda";
import { BN } from "@anchor-lang/core";
import { toast } from "sonner";

export function PositionCard({
  market,
  tokens,
}: {
  market: MarketData;
  tokens: UserTokens | null;
}) {
  const [loading, setLoading] = useState(false);
  const program = useProgram();
  const { publicKey } = useWallet();
  const { data: posValue, isLoading: valueLoading } = usePositionValue(market.publicKey, tokens);

  if (!publicKey) return null;

  const yesAmount = tokens?.yes ?? 0;
  const noAmount = tokens?.no ?? 0;
  const usdcBalance = tokens?.usdc ?? 0;
  const hasPosition = yesAmount > 0 || noAmount > 0;
  const redeemable = Math.min(yesAmount, noAmount);
  const winningSide = market.winningSide;
  const winningBalance = winningSide === 1 ? yesAmount : winningSide === 2 ? noAmount : 0;
  const losingBalance = winningSide === 1 ? noAmount : winningSide === 2 ? yesAmount : 0;

  const handleRedeem = async () => {
    if (!program || !publicKey || redeemable <= 0) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const yesMint = deriveYesMint(marketPda);
      const noMint = deriveNoMint(marketPda);
      const vaultPda = deriveVault(marketPda);
      const tx = await (program.methods as any)
        .redeemPair(new BN(redeemable))
        .accounts({
          signer: publicKey, market: marketPda, collateralMint: USDC_MINT,
          yesMint: yesMint, noMint: noMint, vault: vaultPda,
          userYes: new PublicKey(tokens!.yesAta),
          userNo: new PublicKey(tokens!.noAta),
          userCollateral: new PublicKey(tokens!.usdcAta),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .rpc();
      toast.success(`Redeemed ${formatUsdc(redeemable)} USDC`, {
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) { toast.info("Transaction cancelled"); setLoading(false); return; }
      toast.error("Redeem failed", { description: msg.slice(0, 120) });
    } finally {
      setLoading(false);
    }
  };

  const handleClaimWinnings = async () => {
    if (!program || !publicKey || !hasPosition) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const yesMint = deriveYesMint(marketPda);
      const noMint = deriveNoMint(marketPda);
      const vaultPda = deriveVault(marketPda);
      const userYes = await getAssociatedTokenAddress(yesMint, publicKey);
      const userNo = await getAssociatedTokenAddress(noMint, publicKey);
      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const conn = program.provider.connection;
      const preIxs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })];
      // Ensure all ATAs exist
      for (const [ata, mint] of [[userYes, yesMint], [userNo, noMint], [userUsdc, USDC_MINT]] as [PublicKey, PublicKey][]) {
        try { await getAccount(conn, ata); } catch {
          preIxs.push(createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint));
        }
      }
      const tx = await (program.methods as any)
        .claimWinnings(new BN(1)) // amount ignored by contract, settles everything
        .accounts({
          signer: publicKey, market: marketPda, collateralMint: USDC_MINT,
          yesMint, noMint, vault: vaultPda,
          userYes, userNo, userCollateral: userUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(preIxs)
        .rpc();
      const payout = winningBalance > 0 ? formatUsdc(winningBalance) : "0";
      const burned = losingBalance > 0 ? formatUsdc(losingBalance) : "0";
      toast.success(
        winningBalance > 0
          ? `Claimed ${payout} USDC + burned ${burned} losing tokens`
          : `Burned ${burned} losing tokens`,
        { action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") } },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) {
        toast.info("Transaction cancelled");
      } else {
        toast.error("Settle failed", { description: msg.slice(0, 120) });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-line p-[16px] space-y-[12px]">
      <div className="text-caption">YOUR POSITION</div>

      <MetaRow label="USDC Balance" value={`${formatUsdc(usdcBalance)} USDC`} last={!hasPosition} />

      {market.resolved ? (
        /* === RESOLVED === */
        hasPosition ? (
          <div className="space-y-[12px]">
            <div className="flex gap-[32px]">
              <Figure label="YES" value={formatUsdc(yesAmount)} size="data" color="yes" />
              <Figure label="NO" value={formatUsdc(noAmount)} size="data" color="no" />
            </div>

            {winningBalance > 0 && (
              <MetaRow label="Payout" value={`${formatUsdc(winningBalance)} USDC`} last />
            )}

            <Button
              variant={winningSide === 1 ? "yes" : "no"}
              className="w-full"
              onClick={handleClaimWinnings}
              disabled={loading}
            >
              {loading ? "SETTLING..." : winningBalance > 0
                ? `Settle — ${formatUsdc(winningBalance)} USDC`
                : "Settle — clean up tokens"}
            </Button>
          </div>
        ) : (
          <p className="text-muted text-[12px] font-mono">No position in this market.</p>
        )
      ) : (
        /* === ACTIVE === */
        hasPosition ? (
          <>
            <div className="flex gap-[32px]">
              <Figure label="YES" value={formatUsdc(yesAmount)} size="data" color="yes" />
              <Figure label="NO" value={formatUsdc(noAmount)} size="data" color="no" />
            </div>

            <div className="border-t border-line pt-[8px]">
              {valueLoading ? (
                <p className="text-muted text-[12px] font-mono">Calculating...</p>
              ) : posValue?.error ? (
                <p className="text-no text-[11px] font-mono">{posValue.error}</p>
              ) : posValue ? (
                <>
                  {yesAmount > 0 && <MetaRow label="YES → USDC" value={formatUsdc(posValue.yesValueUsdc)} />}
                  {noAmount > 0 && <MetaRow label="NO → USDC" value={formatUsdc(posValue.noValueUsdc)} />}
                  <MetaRow label="Sell now" value={`${formatUsdc(posValue.totalUsdc)} USDC`} />
                  {yesAmount > 0 && (
                    <MetaRow label="If YES wins" value={
                      <span className="text-yes">+{formatUsdc(yesAmount)} USDC</span>
                    } />
                  )}
                  {noAmount > 0 && (
                    <MetaRow label="If NO wins" value={
                      <span className="text-no">+{formatUsdc(noAmount)} USDC</span>
                    } last />
                  )}
                  {yesAmount > 0 && noAmount === 0 && (
                    <MetaRow label="If NO wins" value={
                      <span className="text-no">$0.00</span>
                    } last />
                  )}
                  {noAmount > 0 && yesAmount === 0 && (
                    <MetaRow label="If YES wins" value={
                      <span className="text-no">$0.00</span>
                    } last />
                  )}
                </>
              ) : null}
            </div>

            {redeemable > 0 && (
              <Button variant="secondary" className="w-full" onClick={handleRedeem} disabled={loading}>
                Redeem {formatUsdc(redeemable)} pairs
              </Button>
            )}
          </>
        ) : (
          <p className="text-muted text-[12px] font-mono">No YES/NO tokens. Trade to open a position.</p>
        )
      )}
    </div>
  );
}
