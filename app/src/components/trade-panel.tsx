"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { MetaRow } from "@/components/ui/meta-row";
import { useQueryClient } from "@tanstack/react-query";
import { useProgram } from "@/hooks/use-program";
import { useSwapQuote, type SwapMode } from "@/hooks/use-swap-quote";
import { formatUsdc } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";
import type { UserTokens } from "@/hooks/use-user-tokens";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { USDC_MINT, solscanTxUrl } from "@/lib/constants";
import { toast } from "sonner";

const SLIPPAGE_BPS = 100;

export function TradePanel({
  market,
  tokens,
}: {
  market: MarketData;
  tokens: UserTokens | null;
}) {
  const [mode, setMode] = useState<SwapMode>("buy");
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const program = useProgram();
  const { publicKey } = useWallet();

  const amountNum = parseFloat(amount) || 0;
  const rawAmount = mode === "buy" ? amountNum : amountNum * 1e6;

  const { data: quote, isLoading: quoteLoading } = useSwapQuote(
    market.publicKey, side, mode, rawAmount
  );

  const minOutput = quote?.output
    ? Math.floor(quote.output * (1 - SLIPPAGE_BPS / 10000))
    : 0;

  const maxSellable = side === "yes" ? (tokens?.yes ?? 0) : (tokens?.no ?? 0);

  const handleTrade = async () => {
    if (!program || !publicKey || !amount || !quote?.output) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const yesMintPda = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()], program.programId)[0];
      const noMintPda = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()], program.programId)[0];
      const vaultPda = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPda.toBuffer()], program.programId)[0];
      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const userYes = await getAssociatedTokenAddress(yesMintPda, publicKey);
      const userNo = await getAssociatedTokenAddress(noMintPda, publicKey);

      // Build ATA creation instructions (if needed) to bundle atomically
      const conn = program.provider.connection;
      const preIxs: any[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })];
      const atasCreated: { ata: PublicKey; mint: PublicKey }[] = [];
      for (const [ata, mint] of [
        [userYes, yesMintPda], [userNo, noMintPda], [userUsdc, USDC_MINT],
      ] as [PublicKey, PublicKey][]) {
        try { await getAccount(conn, ata); } catch {
          preIxs.push(createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint));
          atasCreated.push({ ata, mint });
        }
      }

      const direction = mode === "buy"
        ? (side === "yes" ? { usdcToYes: {} } : { usdcToNo: {} })
        : (side === "yes" ? { yesToUsdc: {} } : { noToUsdc: {} });

      const BN = (await import("@coral-xyz/anchor")).BN;
      const lamports = Math.floor(amountNum * 1e6);

      // Close ATAs that remain empty after swap (cleanup wallet, recover rent)
      // Buy YES → NO ATA empty; Buy NO → YES ATA empty
      // Sell YES → YES ATA may be empty (if sold all); NO ATA empty if just created
      const postIxs: any[] = [];
      const emptyAta = side === "yes" ? userNo : userYes;
      const wasCreated = atasCreated.some((a) => a.ata.equals(emptyAta));
      if (wasCreated) {
        postIxs.push(createCloseAccountInstruction(emptyAta, publicKey, publicKey));
      }

      const tx = await (program.methods as any)
        .swap(direction, new BN(lamports), new BN(minOutput))
        .accounts({
          signer: publicKey, market: marketPda, collateralMint: USDC_MINT,
          yesMint: yesMintPda, noMint: noMintPda, vault: vaultPda,
          userCollateral: userUsdc, userYes, userNo,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(preIxs)
        .postInstructions(postIxs)
        .rpc();

      // Refetch markets to get real post-trade price, then snap it
      queryClient.invalidateQueries({ queryKey: ["markets"] });
      setTimeout(async () => {
        const data = await queryClient.fetchQuery({ queryKey: ["markets"] });
        const updated = (data as any[])?.find((m: any) => m.publicKey === market.publicKey);
        if (updated?.price) {
          fetch("/api/price-snap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              marketId: market.publicKey,
              price: updated.price,
              timestamp: Math.floor(Date.now() / 1000),
              force: true,
            }),
          }).catch(() => {});
        }
      }, 2000);

      const desc = mode === "buy"
        ? `${formatUsdc(quote.output)} ${side.toUpperCase()} for ${amountNum.toFixed(2)} USDC`
        : `${amountNum.toFixed(2)} ${side.toUpperCase()} for ${formatUsdc(quote.output)} USDC`;
      toast.success(`${mode === "buy" ? "Bought" : "Sold"} ${side.toUpperCase()}`, {
        description: desc,
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
      setAmount("");
    } catch (err: any) {
      if (err.message?.includes("Slippage")) {
        toast.error("Slippage exceeded", { description: "Price moved. Try again." });
      } else {
        toast.error("Transaction failed", { description: err.message?.slice(0, 120) });
      }
    } finally {
      setLoading(false);
    }
  };

  const outputDisplay = quote?.output ? formatUsdc(quote.output) : "—";
  const inputUnit = mode === "buy" ? "USDC" : side.toUpperCase();
  const outputUnit = mode === "buy" ? side.toUpperCase() : "USDC";

  return (
    <div className="border border-line p-[16px] space-y-[12px]">
      <div className="text-caption">TRADE</div>

      {/* Mode toggle */}
      <div className="flex gap-[8px]">
        <Button
          variant={mode === "buy" ? "secondary" : "ghost"}
          onClick={() => { setMode("buy"); setAmount(""); }}
          className="flex-1 uppercase text-[11px] tracking-[0.05em]"
        >
          Buy
        </Button>
        <Button
          variant={mode === "sell" ? "secondary" : "ghost"}
          onClick={() => { setMode("sell"); setAmount(""); }}
          className="flex-1 uppercase text-[11px] tracking-[0.05em]"
        >
          Sell
        </Button>
      </div>

      {/* Side toggle */}
      <div className="flex gap-[6px]">
        <Button
          variant={side === "yes" ? "yes" : "ghost"}
          onClick={() => { setSide("yes"); setAmount(""); }}
          className="flex-1"
        >
          YES
        </Button>
        <Button
          variant={side === "no" ? "no" : "ghost"}
          onClick={() => { setSide("no"); setAmount(""); }}
          className="flex-1"
        >
          NO
        </Button>
      </div>

      {/* Amount */}
      <AmountInput
        label={mode === "buy" ? "YOU PAY" : "YOU SELL"}
        unit={inputUnit}
        type="number"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        min="0"
        step="0.01"
      />
      {mode === "sell" && maxSellable > 0 && (
        <button
          type="button"
          className="text-[11px] text-accent hover:text-text-hi font-mono transition-all duration-[120ms]"
          onClick={() => setAmount((maxSellable / 1e6).toString())}
        >
          Max: {formatUsdc(maxSellable)} {side.toUpperCase()}
        </button>
      )}

      {/* Quote */}
      {amountNum > 0 && (
        <div className="border-t border-line pt-[8px]">
          {quoteLoading ? (
            <p className="text-muted text-[12px] font-mono">Fetching quote...</p>
          ) : quote?.error ? (
            <p className="text-no text-[11px] font-mono">{quote.error}</p>
          ) : quote?.output ? (
            <>
              <MetaRow label="You receive" value={`${outputDisplay} ${outputUnit}`} />
              <MetaRow
                label="Avg price"
                value={
                  mode === "buy"
                    ? `${(amountNum * 1e6 / quote.output).toFixed(4)} USDC/${side.toUpperCase()}`
                    : `${(quote.output / (amountNum * 1e6)).toFixed(4)} USDC/${side.toUpperCase()}`
                }
              />
              <MetaRow label="Min output (1%)" value={`${formatUsdc(minOutput)} ${outputUnit}`} last />
            </>
          ) : null}
        </div>
      )}

      {/* Execute */}
      <Button
        variant={side === "yes" ? "yes" : "no"}
        className="w-full uppercase text-[11px] tracking-[0.05em]"
        onClick={handleTrade}
        disabled={!publicKey || !amount || loading || market.resolved || !quote?.output}
      >
        {loading ? "TRADING..." : `${mode.toUpperCase()} ${side.toUpperCase()}`}
      </Button>
    </div>
  );
}
