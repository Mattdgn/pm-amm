"use client";

import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProgram } from "@/hooks/use-program";
import { formatUsdc, formatPrice, estimateSwapOutput } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";
import {
  PublicKey,
  ComputeBudgetProgram,
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

  // Live preview
  const preview = useMemo(() => {
    const val = parseFloat(amount);
    if (!val || val <= 0 || market.lEff <= 0) return null;
    return estimateSwapOutput(
      market.reserveYes,
      market.reserveNo,
      market.lEff,
      val,
      side
    );
  }, [amount, side, market.reserveYes, market.reserveNo, market.lEff]);

  const handleTrade = async () => {
    if (!program || !publicKey || !amount) return;
    setLoading(true);
    setResult(null);

    try {
      const marketPda = new PublicKey(market.publicKey);
      const lamports = Math.floor(parseFloat(amount) * 1e6);

      const yesMintPda = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()], program.programId
      )[0];
      const noMintPda = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()], program.programId
      )[0];
      const vaultPda = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPda.toBuffer()], program.programId
      )[0];

      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const userYes = await getAssociatedTokenAddress(yesMintPda, publicKey);
      const userNo = await getAssociatedTokenAddress(noMintPda, publicKey);

      // Create missing ATAs in separate tx
      const conn = program.provider.connection;
      const ataIxs: any[] = [];
      for (const [ata, mint] of [
        [userYes, yesMintPda], [userNo, noMintPda], [userUsdc, USDC_MINT],
      ] as [PublicKey, PublicKey][]) {
        if (!(await conn.getAccountInfo(ata))) {
          ataIxs.push(createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint));
        }
      }
      if (ataIxs.length > 0) {
        const { Transaction } = await import("@solana/web3.js");
        await program.provider.sendAndConfirm!(new Transaction().add(...ataIxs));
      }

      const direction = side === "yes" ? { usdcToYes: {} } : { usdcToNo: {} };
      const BN = (await import("@coral-xyz/anchor")).BN;

      const tx = await (program.methods as any)
        .swap(direction, new BN(lamports), new BN(0))
        .accounts({
          signer: publicKey, market: marketPda, collateralMint: USDC_MINT,
          yesMint: yesMintPda, noMint: noMintPda, vault: vaultPda,
          userCollateral: userUsdc, userYes, userNo,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .rpc();

      setResult(`Bought ${side.toUpperCase()} tokens! Tx: ${tx.slice(0, 12)}...`);
      setAmount("");
    } catch (err: any) {
      setResult(`Error: ${err.message?.slice(0, 100)}`);
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

        <Input
          type="number"
          placeholder="USDC amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.01"
        />

        {/* Live preview */}
        {preview && preview.output > 0 && (
          <div className="p-3 rounded-md bg-muted text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">You pay</span>
              <span className="font-mono">{parseFloat(amount).toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">You receive (est.)</span>
              <span className="font-mono font-bold">
                ~{(preview.output).toFixed(2)} {side.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg price</span>
              <span className="font-mono">
                {(parseFloat(amount) / preview.output).toFixed(4)} USDC/{side.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price after</span>
              <span className="font-mono">{formatPrice(preview.priceAfter)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price impact</span>
              <span className={`font-mono ${preview.priceImpact > 0.05 ? "text-destructive" : ""}`}>
                {(preview.priceImpact * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleTrade}
          disabled={!publicKey || !amount || loading || market.resolved}
        >
          {loading
            ? "Trading..."
            : preview && preview.output > 0
              ? `Buy ~${preview.output.toFixed(2)} ${side.toUpperCase()} for ${parseFloat(amount).toFixed(2)} USDC`
              : `Buy ${side.toUpperCase()}`}
        </Button>

        {result && (
          <p className="text-sm text-muted-foreground">{result}</p>
        )}
      </CardContent>
    </Card>
  );
}
