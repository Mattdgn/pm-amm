"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProgram } from "@/hooks/use-program";
import { formatUsdc } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";
import type { UserTokens } from "@/hooks/use-user-tokens";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { USDC_MINT } from "@/lib/constants";
import { BN } from "@coral-xyz/anchor";

export function PositionCard({
  market,
  tokens,
}: {
  market: MarketData;
  tokens: UserTokens | null;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const program = useProgram();
  const { publicKey } = useWallet();

  if (!tokens || (tokens.yes === 0 && tokens.no === 0)) return null;

  const redeemable = Math.min(tokens.yes, tokens.no);
  const winningSide = market.winningSide; // 0=unresolved, 1=yes, 2=no
  const winningBalance = winningSide === 1 ? tokens.yes : winningSide === 2 ? tokens.no : 0;

  const handleRedeem = async () => {
    if (!program || !publicKey || redeemable <= 0) return;
    setLoading(true);
    setMsg(null);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const yesMint = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()], program.programId
      )[0];
      const noMint = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()], program.programId
      )[0];
      const vaultPda = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPda.toBuffer()], program.programId
      )[0];

      await (program.methods as any)
        .redeemPair(new BN(redeemable))
        .accounts({
          signer: publicKey,
          market: marketPda,
          collateralMint: USDC_MINT,
          yesMint,
          noMint,
          vault: vaultPda,
          userYes: new PublicKey(tokens.yesAta),
          userNo: new PublicKey(tokens.noAta),
          userCollateral: new PublicKey(tokens.usdcAta),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .rpc();

      setMsg(`Redeemed ${formatUsdc(redeemable)} USDC`);
    } catch (err: any) {
      setMsg(`Error: ${err.message?.slice(0, 80)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimWinnings = async () => {
    if (!program || !publicKey || winningBalance <= 0) return;
    setLoading(true);
    setMsg(null);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const winningMint = PublicKey.findProgramAddressSync(
        [Buffer.from(winningSide === 1 ? "yes_mint" : "no_mint"), marketPda.toBuffer()],
        program.programId
      )[0];
      const vaultPda = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPda.toBuffer()], program.programId
      )[0];
      const userWinning = await getAssociatedTokenAddress(winningMint, publicKey);
      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);

      await (program.methods as any)
        .claimWinnings(new BN(winningBalance))
        .accounts({
          signer: publicKey,
          market: marketPda,
          collateralMint: USDC_MINT,
          winningMint,
          vault: vaultPda,
          userWinning,
          userCollateral: userUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setMsg(`Claimed ${formatUsdc(winningBalance)} USDC!`);
    } catch (err: any) {
      setMsg(`Error: ${err.message?.slice(0, 80)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Position</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">YES: </span>
            <span className="font-mono">{formatUsdc(tokens.yes)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">NO: </span>
            <span className="font-mono">{formatUsdc(tokens.no)}</span>
          </div>
        </div>

        {redeemable > 0 && !market.resolved && (
          <Button variant="outline" className="w-full" onClick={handleRedeem} disabled={loading}>
            Redeem {formatUsdc(redeemable)} pairs for USDC
          </Button>
        )}

        {market.resolved && winningBalance > 0 && (
          <div className="space-y-2">
            <Badge variant="default">
              {winningSide === 1 ? "YES" : "NO"} won!
            </Badge>
            <Button className="w-full" onClick={handleClaimWinnings} disabled={loading}>
              Claim {formatUsdc(winningBalance)} USDC
            </Button>
          </div>
        )}

        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </CardContent>
    </Card>
  );
}
