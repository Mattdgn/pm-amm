"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useProgram } from "@/hooks/use-program";
import { formatUsdc } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";
import {
  PublicKey,
  ComputeBudgetProgram,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { USDC_MINT } from "@/lib/constants";

export function TradePanel({ market }: { market: MarketData }) {
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const program = useProgram();
  const { publicKey } = useWallet();

  const handleTrade = async () => {
    if (!program || !publicKey || !amount) return;
    setLoading(true);
    setResult(null);

    try {
      const marketPda = new PublicKey(market.publicKey);
      const lamports = Math.floor(parseFloat(amount) * 1e6);

      const yesMintPda = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()],
        program.programId
      )[0];
      const noMintPda = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()],
        program.programId
      )[0];
      const vaultPda = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPda.toBuffer()],
        program.programId
      )[0];

      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const userYes = await getAssociatedTokenAddress(yesMintPda, publicKey);
      const userNo = await getAssociatedTokenAddress(noMintPda, publicKey);

      // Create ATAs if they don't exist
      const preIxs = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ];
      const conn = program.provider.connection;
      for (const [ata, mint] of [
        [userYes, yesMintPda],
        [userNo, noMintPda],
        [userUsdc, USDC_MINT],
      ] as [PublicKey, PublicKey][]) {
        const acc = await conn.getAccountInfo(ata);
        if (!acc) {
          preIxs.push(
            createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint)
          );
        }
      }

      const direction =
        side === "yes" ? { usdcToYes: {} } : { usdcToNo: {} };

      const BN = (await import("@coral-xyz/anchor")).BN;
      const tx = await (program.methods as any)
        .swap(direction, new BN(lamports), new BN(0))
        .accounts({
          signer: publicKey,
          market: marketPda,
          collateralMint: USDC_MINT,
          yesMint: yesMintPda,
          noMint: noMintPda,
          vault: vaultPda,
          userCollateral: userUsdc,
          userYes,
          userNo,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(preIxs)
        .rpc();

      setResult(`Bought ${side.toUpperCase()} tokens. Tx: ${tx.slice(0, 8)}...`);
      setAmount("");
    } catch (err: any) {
      setResult(`Error: ${err.message?.slice(0, 80)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={side === "yes" ? "default" : "outline"}
            onClick={() => setSide("yes")}
            className="flex-1"
          >
            Buy YES
          </Button>
          <Button
            variant={side === "no" ? "default" : "outline"}
            onClick={() => setSide("no")}
            className="flex-1"
          >
            Buy NO
          </Button>
        </div>

        <div>
          <Input
            type="number"
            placeholder="USDC amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
          />
        </div>

        <Button
          className="w-full"
          onClick={handleTrade}
          disabled={!publicKey || !amount || loading || market.resolved}
        >
          {loading ? "Trading..." : `Buy ${side.toUpperCase()}`}
        </Button>

        {result && (
          <p className="text-sm text-muted-foreground">{result}</p>
        )}
      </CardContent>
    </Card>
  );
}
