"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  ComputeBudgetProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { Program, BN } from "@anchor-lang/core";
import idl from "@/lib/pm_amm_idl.json";
import { USDC_MINT } from "@/lib/constants";
import { deriveYesMint, deriveNoMint, deriveVault } from "@/lib/pda";
import { estimateSwapOutput } from "@/lib/pm-math";

export type SwapMode = "buy" | "sell";

export interface SwapQuote {
  output: number;
  error: string | null;
  estimated?: boolean;
}

interface MarketReserves {
  reserveYes: number;
  reserveNo: number;
  lEff: number;
}

/**
 * Swap quote: tries on-chain simulation first, falls back to client-side math.
 * Client-side uses the same pm-AMM formulas (float64 port of on-chain I80F48).
 */
export function useSwapQuote(
  marketPda: string | undefined,
  side: "yes" | "no",
  mode: SwapMode,
  amount: number,
  reserves?: MarketReserves,
) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery<SwapQuote | null>({
    queryKey: ["swap-quote", marketPda, side, mode, amount],
    queryFn: async () => {
      if (!publicKey || !marketPda || amount <= 0) return null;

      // Try on-chain simulation first
      const onChain = await tryOnChainQuote(
        connection, publicKey, marketPda, side, mode, amount,
      );
      if (onChain) return onChain;

      // Fallback: client-side estimation using pm-AMM math
      if (reserves && reserves.lEff > 0) {
        return clientSideQuote(reserves, side, mode, amount);
      }

      return { output: 0, error: null };
    },
    enabled: !!publicKey && !!marketPda && amount > 0,
    staleTime: 10_000,
    retry: false,
  });
}

/** Client-side quote using the same pm-AMM formulas (float64). */
function clientSideQuote(
  reserves: MarketReserves,
  side: "yes" | "no",
  mode: SwapMode,
  amount: number,
): SwapQuote {
  const lamports = mode === "buy" ? Math.floor(amount * 1e6) : Math.floor(amount);
  if (mode === "sell") {
    // Sell YES/NO → USDC: mirror the buy math with reversed sides
    const sellSide = side === "yes" ? "no" : "yes";
    const est = estimateSwapOutput(
      reserves.reserveYes, reserves.reserveNo, reserves.lEff, lamports, sellSide,
    );
    // For sell, output is USDC (the "extra" reserves freed by removing tokens)
    // Use the buy-reverse approximation
    return { output: Math.max(0, Math.floor(est.output)), error: null, estimated: true };
  }
  const est = estimateSwapOutput(
    reserves.reserveYes, reserves.reserveNo, reserves.lEff, lamports, side,
  );
  return { output: Math.max(0, Math.floor(est.output)), error: null, estimated: true };
}

/** Try on-chain simulation. Returns null if simulation can't run. */
async function tryOnChainQuote(
  connection: ReturnType<typeof useConnection>["connection"],
  publicKey: PublicKey,
  marketPda: string,
  side: "yes" | "no",
  mode: SwapMode,
  amount: number,
): Promise<SwapQuote | null> {
  try {
    const market = new PublicKey(marketPda);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const program = new Program(idl as any, { connection } as any);

    const yesMint = deriveYesMint(market);
    const noMint = deriveNoMint(market);
    const vault = deriveVault(market);

    const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
    const userYes = await getAssociatedTokenAddress(yesMint, publicKey);
    const userNo = await getAssociatedTokenAddress(noMint, publicKey);

    const outputAta =
      mode === "buy" ? (side === "yes" ? userYes : userNo) : userUsdc;

    // Check which ATAs need creation
    const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
    const ataIxs: TransactionInstruction[] = [];
    for (const { ata, mint } of [
      { ata: userUsdc, mint: USDC_MINT },
      { ata: userYes, mint: yesMint },
      { ata: userNo, mint: noMint },
    ]) {
      const info = await connection.getAccountInfo(ata);
      if (!info) {
        ataIxs.push(createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint));
      }
    }

    // Pre-balance
    let preBal = 0;
    try {
      const info = await connection.getAccountInfo(outputAta);
      if (info && info.data.length >= 72) {
        const view = new DataView(info.data.buffer, info.data.byteOffset);
        preBal = Number(view.getBigUint64(64, true));
      }
    } catch {
      /* ATA doesn't exist yet */
    }

    // Direction
    let direction: Record<string, Record<string, never>>;
    if (mode === "buy") {
      direction = side === "yes" ? { usdcToYes: {} } : { usdcToNo: {} };
    } else {
      direction = side === "yes" ? { yesToUsdc: {} } : { noToUsdc: {} };
    }

    const lamports = mode === "buy" ? Math.floor(amount * 1e6) : Math.floor(amount);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ix = await (program.methods as any)
      .swap(direction, new BN(lamports), new BN(0))
      .accounts({
        signer: publicKey,
        market,
        collateralMint: USDC_MINT,
        yesMint,
        noMint,
        vault,
        userCollateral: userUsdc,
        userYes,
        userNo,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ...ataIxs,
      ix,
    );
    tx.feePayer = publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const sim = await connection.simulateTransaction(tx, undefined, [outputAta]);

    if (sim.value.err) {
      // Simulation failed (no SOL for ATA rent, account missing, etc.)
      // Return null so caller falls back to client-side
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postAccounts = (sim.value as any).accounts;
    if (postAccounts?.[0]?.data) {
      const buf = Uint8Array.from(atob(postAccounts[0].data[0]), (c) => c.charCodeAt(0));
      const view = new DataView(buf.buffer);
      const postBal = Number(view.getBigUint64(64, true));
      return { output: postBal - preBal, error: null };
    }

    return null;
  } catch {
    return null;
  }
}
