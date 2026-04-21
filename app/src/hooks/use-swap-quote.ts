"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, ComputeBudgetProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { Program, BN } from "@coral-xyz/anchor";
import idl from "@/lib/pm_amm_idl.json";
import { USDC_MINT, PROGRAM_ID } from "@/lib/constants";

export type SwapMode = "buy" | "sell";

export interface SwapQuote {
  output: number;
  error: string | null;
}

/**
 * On-chain swap quote via simulateTransaction.
 * - buy: USDC → YES/NO (amount is in USDC, output is tokens)
 * - sell: YES/NO → USDC (amount is in tokens, output is USDC)
 */
export function useSwapQuote(
  marketPda: string | undefined,
  side: "yes" | "no",
  mode: SwapMode,
  amount: number
) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery<SwapQuote | null>({
    queryKey: ["swap-quote", marketPda, side, mode, amount],
    queryFn: async () => {
      if (!publicKey || !marketPda || amount <= 0) return null;

      try {
        const market = new PublicKey(marketPda);
        const programId = new PublicKey(idl.address);
        const program = new Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, { connection } as any);

        const yesMint = PublicKey.findProgramAddressSync(
          [Buffer.from("yes_mint"), market.toBuffer()], programId)[0];
        const noMint = PublicKey.findProgramAddressSync(
          [Buffer.from("no_mint"), market.toBuffer()], programId)[0];
        const vault = PublicKey.findProgramAddressSync(
          [Buffer.from("vault"), market.toBuffer()], programId)[0];

        const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const userYes = await getAssociatedTokenAddress(yesMint, publicKey);
        const userNo = await getAssociatedTokenAddress(noMint, publicKey);

        // Output ATA depends on direction
        const outputAta = mode === "buy"
          ? (side === "yes" ? userYes : userNo)  // buying tokens → output is token ATA
          : userUsdc;                             // selling tokens → output is USDC ATA

        // Ensure ATAs exist for simulation
        const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
        const ataIxs: any[] = [];
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

        // Pre-balance of output ATA
        let preBal = 0;
        try {
          const info = await connection.getAccountInfo(outputAta);
          if (info && info.data.length >= 72) {
            const view = new DataView(info.data.buffer, info.data.byteOffset);
            preBal = Number(view.getBigUint64(64, true));
          }
        } catch { /* ATA doesn't exist */ }

        // Direction
        let direction: any;
        if (mode === "buy") {
          direction = side === "yes" ? { usdcToYes: {} } : { usdcToNo: {} };
        } else {
          direction = side === "yes" ? { yesToUsdc: {} } : { noToUsdc: {} };
        }

        // Amount in lamports: USDC (buy) or token amount (sell)
        const lamports = mode === "buy"
          ? Math.floor(amount * 1e6)
          : Math.floor(amount);

        const ix = await (program.methods as any)
          .swap(direction, new BN(lamports), new BN(0))
          .accounts({
            signer: publicKey, market, collateralMint: USDC_MINT,
            yesMint, noMint, vault,
            userCollateral: userUsdc, userYes, userNo,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction();

        const tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
          ...ataIxs,
          ix
        );
        tx.feePayer = publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        const sim = await connection.simulateTransaction(tx, undefined, [outputAta]);

        if (sim.value.err) {
          return { output: 0, error: `Sim error: ${JSON.stringify(sim.value.err)}` };
        }

        const postAccounts = (sim.value as any).accounts;
        if (postAccounts?.[0]?.data) {
          const buf = Uint8Array.from(atob(postAccounts[0].data[0]), c => c.charCodeAt(0));
          const view = new DataView(buf.buffer);
          const postBal = Number(view.getBigUint64(64, true));
          return { output: postBal - preBal, error: null };
        }

        return { output: 0, error: "Could not read simulation result" };
      } catch (e: any) {
        return { output: 0, error: e.message?.slice(0, 80) || "Unknown error" };
      }
    },
    enabled: !!publicKey && !!marketPda && amount > 0,
    staleTime: 10_000,
    retry: false,
  });
}
