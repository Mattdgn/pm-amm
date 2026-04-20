"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, ComputeBudgetProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import idl from "@/lib/pm_amm_idl.json";
import { USDC_MINT } from "@/lib/constants";

/**
 * Simulate the swap on-chain to get exact output.
 * No client-side math approximation — uses the actual program.
 */
export function useSwapQuote(
  marketPda: string | undefined,
  side: "yes" | "no",
  amountUsdc: number // in USDC (e.g. 10 = 10 USDC)
) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery({
    queryKey: ["swap-quote", marketPda, side, amountUsdc, publicKey?.toBase58()],
    queryFn: async (): Promise<{
      output: number; // in token raw units (6 decimals)
      priceAfter: number;
      error: string | null;
    } | null> => {
      if (!publicKey || !marketPda || amountUsdc <= 0) return null;

      const market = new PublicKey(marketPda);
      const programId = new PublicKey(idl.address);
      const program = new Program(idl as any, { connection } as any);

      const yesMint = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), market.toBuffer()], programId
      )[0];
      const noMint = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), market.toBuffer()], programId
      )[0];
      const vault = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), market.toBuffer()], programId
      )[0];

      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const userYes = await getAssociatedTokenAddress(yesMint, publicKey);
      const userNo = await getAssociatedTokenAddress(noMint, publicKey);

      // Check if ATAs exist — if not, simulation will fail
      for (const ata of [userUsdc, userYes, userNo]) {
        try { await getAccount(connection, ata); } catch {
          return { output: 0, priceAfter: 0, error: "Token accounts not created yet. Trade once to create them." };
        }
      }

      const direction = side === "yes" ? { usdcToYes: {} } : { usdcToNo: {} };
      const lamports = Math.floor(amountUsdc * 1e6);

      // Build tx
      const ix = await (program.methods as any)
        .swap(direction, new BN(lamports), new BN(0))
        .accounts({
          signer: publicKey, market, collateralMint: USDC_MINT,
          yesMint, noMint, vault,
          userCollateral: userUsdc, userYes, userNo,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

      const tx = new Transaction().add(cuIx, ix);
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      // Simulate
      const sim = await connection.simulateTransaction(tx);

      if (sim.value.err) {
        return { output: 0, priceAfter: 0, error: `Simulation failed: ${JSON.stringify(sim.value.err)}` };
      }

      // Parse logs for token amounts
      // After the swap, the user's YES/NO balance changes.
      // We can compute the output from the pre/post token balances in simulation.
      // But simulation doesn't return balance changes directly.
      // Instead, look for "Program log: " messages or use the accounts delta.

      // Alternative: read the post-simulation account states
      // For now, parse the mint_to amount from logs
      const logs = sim.value.logs || [];

      // The swap instruction mints tokens. Look for the mint_to CPI.
      // The output is the amount minted to the user.
      // Since we can't easily parse the exact amount from logs,
      // let's use pre/post balance approach via simulateTransaction accounts.

      // Actually the simplest: simulate with returnData or use account changes
      // Let's just compute from pre-balances
      let preYes = 0, preNo = 0;
      try {
        preYes = Number((await getAccount(connection, userYes)).amount);
        preNo = Number((await getAccount(connection, userNo)).amount);
      } catch { /* accounts might not exist */ }

      // Simulate gives us the account state post-tx via inner instructions
      // But the RPC simulateTransaction doesn't return post-balances easily.

      // Cleanest approach: use the simulated account data
      // Re-simulate with accounts option
      const simWithAccounts = await connection.simulateTransaction(tx, {
        accounts: {
          encoding: "base64" as const,
          addresses: [userYes.toBase58(), userNo.toBase58()],
        },
      } as any);

      if (simWithAccounts.value.err) {
        return { output: 0, priceAfter: 0, error: "Simulation error" };
      }

      const postAccounts = simWithAccounts.value.accounts;
      if (!postAccounts || postAccounts.length < 2) {
        return { output: 0, priceAfter: 0, error: "Could not read post-simulation balances" };
      }

      // Decode token account to get amount (offset 64, 8 bytes LE)
      function decodeTokenAmount(data: string): number {
        const buf = Buffer.from(data, "base64");
        // SPL Token account layout: amount is at offset 64, u64 LE
        return Number(buf.readBigUInt64LE(64));
      }

      const postYes = postAccounts[0]?.data ? decodeTokenAmount((postAccounts[0].data as [string, string])[0]) : preYes;
      const postNo = postAccounts[1]?.data ? decodeTokenAmount((postAccounts[1].data as [string, string])[0]) : preNo;

      const output = side === "yes" ? postYes - preYes : postNo - preNo;

      return {
        output: Math.max(0, output),
        priceAfter: 0, // TODO: could also read market account post-sim
        error: null,
      };
    },
    enabled: !!publicKey && !!marketPda && amountUsdc > 0,
    refetchInterval: false, // Only on input change
    staleTime: 5_000,
  });
}
