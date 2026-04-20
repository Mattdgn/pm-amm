"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProgram } from "@/hooks/use-program";
import { useLpPosition } from "@/hooks/use-lp-position";
import { formatUsdc } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";
import { PublicKey, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { USDC_MINT } from "@/lib/constants";
import { BN } from "@coral-xyz/anchor";

export function LpPanel({ market }: { market: MarketData }) {
  const [depositAmt, setDepositAmt] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const program = useProgram();
  const { publicKey } = useWallet();
  const { data: lp } = useLpPosition(market.publicKey);

  const marketPda = new PublicKey(market.publicKey);
  const vaultPda = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketPda.toBuffer()],
    new PublicKey(program?.programId ?? USDC_MINT)
  )[0];

  const handleDeposit = async () => {
    if (!program || !publicKey || !depositAmt) return;
    setLoading(true);
    setMsg(null);
    try {
      const lamports = Math.floor(parseFloat(depositAmt) * 1e6);
      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const [lpPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), marketPda.toBuffer(), publicKey.toBuffer()],
        program.programId
      );

      await (program.methods as any)
        .depositLiquidity(new BN(lamports))
        .accounts({
          signer: publicKey,
          market: marketPda,
          collateralMint: USDC_MINT,
          vault: vaultPda,
          userCollateral: userUsdc,
          lpPosition: lpPda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .rpc();

      setMsg(`Deposited ${depositAmt} USDC`);
      setDepositAmt("");
    } catch (err: any) {
      setMsg(`Error: ${err.message?.slice(0, 80)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!program || !publicKey || !lp) return;
    setLoading(true);
    setMsg(null);
    try {
      const yesMint = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()], program.programId
      )[0];
      const noMint = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()], program.programId
      )[0];
      const userYes = await getAssociatedTokenAddress(yesMint, publicKey);
      const userNo = await getAssociatedTokenAddress(noMint, publicKey);
      const [lpPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), marketPda.toBuffer(), publicKey.toBuffer()],
        program.programId
      );

      // Withdraw all shares
      const sharesBn = new BN(
        (BigInt(Math.floor(lp.shares * 2 ** 48))).toString()
      );

      await (program.methods as any)
        .withdrawLiquidity(sharesBn)
        .accounts({
          signer: publicKey,
          market: marketPda,
          collateralMint: USDC_MINT,
          yesMint,
          noMint,
          lpPosition: lpPda,
          userYes,
          userNo,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .rpc();

      setMsg("Withdrew all liquidity");
    } catch (err: any) {
      setMsg(`Error: ${err.message?.slice(0, 80)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liquidity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lp && lp.shares > 0 && (
          <div className="p-3 rounded-md bg-muted text-sm space-y-1">
            <p>Your shares: {lp.shares.toFixed(2)}</p>
            <p>Deposited: ${formatUsdc(lp.collateralDeposited)}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="USDC to deposit"
            value={depositAmt}
            onChange={(e) => setDepositAmt(e.target.value)}
            min="0.001"
            step="0.01"
          />
          <Button
            onClick={handleDeposit}
            disabled={!publicKey || !depositAmt || loading || market.resolved}
          >
            {loading ? "..." : "Deposit"}
          </Button>
        </div>

        {lp && lp.shares > 0 && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleWithdraw}
            disabled={loading}
          >
            Withdraw All
          </Button>
        )}

        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </CardContent>
    </Card>
  );
}
