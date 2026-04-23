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
import { PublicKey, ComputeBudgetProgram, type TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { USDC_MINT, solscanTxUrl } from "@/lib/constants";
import { deriveYesMint, deriveNoMint, deriveVault } from "@/lib/pda";
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
  const maxSellable = side === "yes" ? (tokens?.yes ?? 0) : (tokens?.no ?? 0);
  const sellExceeds = mode === "sell" && amountNum * 1e6 > maxSellable;
  const rawAmount = mode === "buy" ? amountNum : amountNum * 1e6;

  const { data: quote, isLoading: quoteLoading } = useSwapQuote(
    market.publicKey, side, mode, sellExceeds ? 0 : rawAmount
  );

  const minOutput = quote?.output
    ? Math.floor(quote.output * (1 - SLIPPAGE_BPS / 10000))
    : 0;

  const handleTrade = async () => {
    if (!program || !publicKey || !amount || !quote?.output) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const yesMintPda = deriveYesMint(marketPda);
      const noMintPda = deriveNoMint(marketPda);
      const vaultPda = deriveVault(marketPda);
      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const userYes = await getAssociatedTokenAddress(yesMintPda, publicKey);
      const userNo = await getAssociatedTokenAddress(noMintPda, publicKey);

      // Build ATA creation instructions (if needed) to bundle atomically
      const conn = program.provider.connection;
      const preIxs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })];
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

      const BN = (await import("@anchor-lang/core")).BN;
      const lamports = Math.floor(amountNum * 1e6);

      // Close ATAs that remain empty after swap (cleanup wallet, recover rent)
      // Buy YES → NO ATA empty; Buy NO → YES ATA empty
      // Sell YES → YES ATA may be empty (if sold all); NO ATA empty if just created
      const postIxs: TransactionInstruction[] = [];
      const emptyAta = side === "yes" ? userNo : userYes;
      const wasCreated = atasCreated.some((a) => a.ata.equals(emptyAta));
      if (wasCreated) {
        postIxs.push(createCloseAccountInstruction(emptyAta, publicKey, publicKey));
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anchor IDL types require cast
      const tx = await (program.methods as any)
        .swap(direction, new BN(lamports), new BN(minOutput))
        .accounts({
          signer: publicKey, market: marketPda, collateralMint: USDC_MINT,
          yesMint: yesMintPda, noMint: noMintPda, vault: vaultPda,
          userCollateral: userUsdc, userYes: userYes, userNo: userNo,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(preIxs)
        .postInstructions(postIxs)
        .rpc();

      // Refetch markets to get post-trade price, then snap it
      const data = await queryClient.fetchQuery({ queryKey: ["markets"], staleTime: 0 });
      const updated = (data as MarketData[])?.find((m) => m.publicKey === market.publicKey);
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
        }).catch(console.error);
      }

      const desc = mode === "buy"
        ? `${formatUsdc(quote.output)} ${side.toUpperCase()} for ${amountNum.toFixed(2)} USDC`
        : `${amountNum.toFixed(2)} ${side.toUpperCase()} for ${formatUsdc(quote.output)} USDC`;
      toast.success(`${mode === "buy" ? "Bought" : "Sold"} ${side.toUpperCase()}`, {
        description: desc,
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
      setAmount("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) { toast.info("Transaction cancelled"); setLoading(false); return; }
      if (msg.includes("Slippage")) {
        toast.error("Slippage exceeded", { description: "Price moved. Try again." });
      } else {
        toast.error("Transaction failed", { description: msg.slice(0, 120) });
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
      {sellExceeds && (
        <p className="text-no text-[11px] font-mono">Insufficient balance</p>
      )}
      {amountNum > 0 && !sellExceeds && (
        <div className="border-t border-line pt-[8px]">
          {quoteLoading ? (
            <p className="text-muted text-[12px] font-mono">Fetching quote...</p>
          ) : quote?.error ? (
            <p className="text-no text-[11px] font-mono">
              {quote.error.includes("ProgramFailedToComplete")
                ? "Exceeds on-chain compute limit — reduce amount"
                : quote.error.includes("AccountNotInitialized")
                  ? "Token account missing — first buy will create it"
                  : quote.error.includes("InsufficientFunds") || quote.error.includes("0x1")
                    ? "Insufficient balance"
                    : quote.error}
            </p>
          ) : quote?.output ? (
            <>
              {(() => {
                const avgP = mode === "buy"
                  ? amountNum * 1e6 / quote.output
                  : quote.output / (amountNum * 1e6);
                const fairP = mode === "buy"
                  ? (side === "yes" ? market.price : 1 - market.price)
                  : (side === "yes" ? market.price : 1 - market.price);
                const slippage = fairP > 0 ? Math.abs(avgP - fairP) / fairP * 100 : 0;
                return (
                  <>
                    <MetaRow label="You receive" value={`${outputDisplay} ${outputUnit}`} />
                    <MetaRow label="Avg price" value={`${avgP.toFixed(4)} USDC/${side.toUpperCase()}`} />
                    <MetaRow label="Slippage" value={`${slippage.toFixed(1)}%`} />
                    {slippage > 5 && (
                      <div className="text-[11px] font-mono py-[6px] px-[8px] mt-[4px] border rounded-sm border-[color-mix(in_oklch,var(--no)_40%,transparent)] bg-[color-mix(in_oklch,var(--no)_8%,transparent)] text-no">
                        {slippage > 20 ? "⚠ Extreme slippage" : "⚠ High slippage"} — you are moving the price significantly
                      </div>
                    )}
                    <MetaRow label="Min output (1%)" value={`${formatUsdc(minOutput)} ${outputUnit}`} last />
                  </>
                );
              })()}
            </>
          ) : null}
        </div>
      )}

      {/* Execute */}
      <Button
        variant={side === "yes" ? "yes" : "no"}
        className="w-full uppercase text-[11px] tracking-[0.05em]"
        onClick={handleTrade}
        disabled={!publicKey || !amount || loading || market.resolved || !quote?.output || sellExceeds}
      >
        {loading ? "TRADING..." : `${mode.toUpperCase()} ${side.toUpperCase()}`}
      </Button>
    </div>
  );
}
