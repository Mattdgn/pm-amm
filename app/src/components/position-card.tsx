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
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { USDC_MINT, solscanTxUrl } from "@/lib/constants";
import { BN } from "@coral-xyz/anchor";
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

  const handleRedeem = async () => {
    if (!program || !publicKey || redeemable <= 0) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const yesMint = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()], program.programId)[0];
      const noMint = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()], program.programId)[0];
      const vaultPda = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPda.toBuffer()], program.programId)[0];
      const tx = await (program.methods as any)
        .redeemPair(new BN(redeemable))
        .accounts({
          signer: publicKey, market: marketPda, collateralMint: USDC_MINT,
          yesMint, noMint, vault: vaultPda,
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
    } catch (err: any) {
      toast.error("Redeem failed", { description: err.message?.slice(0, 120) });
    } finally {
      setLoading(false);
    }
  };

  const handleClaimWinnings = async () => {
    if (!program || !publicKey || winningBalance <= 0) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const winningMint = PublicKey.findProgramAddressSync(
        [Buffer.from(winningSide === 1 ? "yes_mint" : "no_mint"), marketPda.toBuffer()],
        program.programId)[0];
      const vaultPda = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPda.toBuffer()], program.programId)[0];
      const userWinning = await getAssociatedTokenAddress(winningMint, publicKey);
      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const conn = program.provider.connection;
      const preIxs: any[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })];
      // Ensure USDC ATA exists (may have been closed)
      try { await getAccount(conn, userUsdc); } catch {
        preIxs.push(createAssociatedTokenAccountInstruction(publicKey, userUsdc, publicKey, USDC_MINT));
      }
      const tx = await (program.methods as any)
        .claimWinnings(new BN(winningBalance))
        .accounts({
          signer: publicKey, market: marketPda, collateralMint: USDC_MINT,
          winningMint, vault: vaultPda, userWinning, userCollateral: userUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(preIxs)
        .rpc();
      toast.success(`Claimed ${formatUsdc(winningBalance)} USDC!`, {
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
    } catch (err: any) {
      toast.error("Claim failed", { description: err.message?.slice(0, 120) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-line p-[16px] space-y-[12px]">
      <div className="text-caption">YOUR POSITION</div>

      <MetaRow label="USDC Balance" value={`${formatUsdc(usdcBalance)} USDC`} last={!hasPosition} />

      {hasPosition ? (
        <>
          <div className="flex gap-[32px]">
            <Figure label="YES" value={formatUsdc(yesAmount)} size="data" color="yes" />
            <Figure label="NO" value={formatUsdc(noAmount)} size="data" color="no" />
          </div>

          {/* On-chain value */}
          <div className="border-t border-line pt-[8px]">
            {market.resolved ? (
              <MetaRow label="Payout" value={`${formatUsdc(winningBalance)} USDC`} last />
            ) : valueLoading ? (
              <p className="text-muted text-[12px] font-mono">Calculating...</p>
            ) : posValue?.error ? (
              <p className="text-no text-[11px] font-mono">{posValue.error}</p>
            ) : posValue ? (
              <>
                {yesAmount > 0 && <MetaRow label="YES → USDC" value={formatUsdc(posValue.yesValueUsdc)} />}
                {noAmount > 0 && <MetaRow label="NO → USDC" value={formatUsdc(posValue.noValueUsdc)} />}
                <MetaRow label="Total value" value={`${formatUsdc(posValue.totalUsdc)} USDC`} last />
              </>
            ) : null}
          </div>

          {redeemable > 0 && !market.resolved && (
            <Button variant="secondary" className="w-full" onClick={handleRedeem} disabled={loading}>
              Redeem {formatUsdc(redeemable)} pairs
            </Button>
          )}

          {market.resolved && winningBalance > 0 && (
            <div className="space-y-[8px]">
              <Badge variant={winningSide === 1 ? "yes" : "no"} dot>
                {winningSide === 1 ? "YES" : "NO"} WON
              </Badge>
              <Button
                variant={winningSide === 1 ? "yes" : "no"}
                className="w-full"
                onClick={handleClaimWinnings}
                disabled={loading}
              >
                Claim {formatUsdc(winningBalance)} USDC
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted text-[12px] font-mono">No YES/NO tokens. Trade to open a position.</p>
      )}
    </div>
  );
}
