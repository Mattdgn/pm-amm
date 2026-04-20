"use client";

import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProgram } from "@/hooks/use-program";
import { useSwapQuote } from "@/hooks/use-swap-quote";
import { formatUsdc, formatPrice } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { USDC_MINT } from "@/lib/constants";

const SLIPPAGE_BPS = 100; // 1% default slippage

export function TradePanel({ market }: { market: MarketData }) {
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const program = useProgram();
  const { publicKey } = useWallet();

  const amountNum = parseFloat(amount) || 0;
  const { data: quote, isLoading: quoteLoading } = useSwapQuote(
    market.publicKey, side, amountNum
  );

  // Min output with slippage
  const minOutput = quote?.output
    ? Math.floor(quote.output * (1 - SLIPPAGE_BPS / 10000))
    : 0;

  const handleTrade = async () => {
    if (!program || !publicKey || !amount || !quote?.output) return;
    setLoading(true);
    setResult(null);

    try {
      const marketPda = new PublicKey(market.publicKey);
      const lamports = Math.floor(amountNum * 1e6);

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

      // Create missing ATAs
      const conn = program.provider.connection;
      const ataIxs: any[] = [];
      for (const [ata, mint] of [
        [userYes, yesMintPda], [userNo, noMintPda], [userUsdc, USDC_MINT],
      ] as [PublicKey, PublicKey][]) {
        try { await getAccount(conn, ata); } catch {
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
        .swap(direction, new BN(lamports), new BN(minOutput))
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
      if (err.message?.includes("Slippage")) {
        setResult("Slippage exceeded — price moved. Try again.");
      } else {
        setResult(`Error: ${err.message?.slice(0, 100)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const outputDisplay = quote?.output ? formatUsdc(quote.output) : "—";
  const avgPrice = quote?.output && amountNum > 0
    ? (amountNum * 1e6 / quote.output).toFixed(4)
    : "—";

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

        {/* On-chain quote */}
        {amountNum > 0 && (
          <div className="p-3 rounded-md bg-muted text-sm space-y-1.5">
            {quoteLoading ? (
              <p className="text-muted-foreground">Fetching quote...</p>
            ) : quote?.error ? (
              <p className="text-destructive text-xs">{quote.error}</p>
            ) : quote?.output ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">You pay</span>
                  <span className="font-mono">{amountNum.toFixed(2)} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">You receive</span>
                  <span className="font-mono font-bold text-green-400">
                    {outputDisplay} {side.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg price</span>
                  <span className="font-mono">{avgPrice} USDC/{side.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Min output (1% slippage)</span>
                  <span className="font-mono">{formatUsdc(minOutput)} {side.toUpperCase()}</span>
                </div>
              </>
            ) : null}
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleTrade}
          disabled={!publicKey || !amount || loading || market.resolved || !quote?.output}
        >
          {loading
            ? "Trading..."
            : quote?.output
              ? `Buy ${outputDisplay} ${side.toUpperCase()} for ${amountNum.toFixed(2)} USDC`
              : `Buy ${side.toUpperCase()}`}
        </Button>

        {result && (
          <p className="text-sm text-muted-foreground">{result}</p>
        )}
      </CardContent>
    </Card>
  );
}
