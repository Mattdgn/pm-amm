"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, ComputeBudgetProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { Program, BN } from "@coral-xyz/anchor";
import idl from "@/lib/pm_amm_idl.json";
import { USDC_MINT, PROGRAM_ID } from "@/lib/constants";
import type { UserTokens } from "@/hooks/use-user-tokens";

export interface PositionValue {
  yesValueUsdc: number; // lamports of USDC you'd get selling all YES
  noValueUsdc: number;  // lamports of USDC you'd get selling all NO
  totalUsdc: number;    // total position value in USDC lamports
  error: string | null;
}

/** Simulate selling all YES and NO tokens to get exact USDC value from the program. */
export function usePositionValue(
  marketPda: string | undefined,
  tokens: UserTokens | null
) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const yesAmount = tokens?.yes ?? 0;
  const noAmount = tokens?.no ?? 0;

  return useQuery<PositionValue | null>({
    queryKey: ["position-value", marketPda, yesAmount, noAmount],
    queryFn: async () => {
      if (!publicKey || !marketPda) return null;
      if (yesAmount <= 0 && noAmount <= 0) return null;

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

        // Ensure ATAs exist for simulation
        const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
        const ataIxs: any[] = [];
        const atas = [
          { ata: userUsdc, mint: USDC_MINT },
          { ata: userYes, mint: yesMint },
          { ata: userNo, mint: noMint },
        ];
        for (const { ata, mint } of atas) {
          const info = await connection.getAccountInfo(ata);
          if (!info) {
            ataIxs.push(createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint));
          }
        }

        let yesValueUsdc = 0;
        let noValueUsdc = 0;

        // Simulate selling YES tokens
        if (yesAmount > 0) {
          yesValueUsdc = await simulateSell(
            program, connection, publicKey,
            { yesToUsdc: {} }, yesAmount,
            market, yesMint, noMint, vault,
            userUsdc, userYes, userNo,
            ataIxs, userUsdc
          );
        }

        // Simulate selling NO tokens
        if (noAmount > 0) {
          noValueUsdc = await simulateSell(
            program, connection, publicKey,
            { noToUsdc: {} }, noAmount,
            market, yesMint, noMint, vault,
            userUsdc, userYes, userNo,
            ataIxs, userUsdc
          );
        }

        return {
          yesValueUsdc,
          noValueUsdc,
          totalUsdc: yesValueUsdc + noValueUsdc,
          error: null,
        };
      } catch (e: any) {
        return {
          yesValueUsdc: 0, noValueUsdc: 0, totalUsdc: 0,
          error: e.message?.slice(0, 80) || "Unknown error",
        };
      }
    },
    enabled: !!publicKey && !!marketPda && (yesAmount > 0 || noAmount > 0),
    staleTime: 10_000,
    retry: false,
  });
}

async function simulateSell(
  program: any,
  connection: any,
  publicKey: PublicKey,
  direction: any,
  amount: number,
  market: PublicKey,
  yesMint: PublicKey,
  noMint: PublicKey,
  vault: PublicKey,
  userUsdc: PublicKey,
  userYes: PublicKey,
  userNo: PublicKey,
  ataIxs: any[],
  outputAta: PublicKey
): Promise<number> {
  // Get pre-balance of USDC ATA
  let preBal = 0;
  try {
    const info = await connection.getAccountInfo(outputAta);
    if (info && info.data.length >= 72) {
      const view = new DataView(info.data.buffer, info.data.byteOffset);
      preBal = Number(view.getBigUint64(64, true));
    }
  } catch { /* ATA doesn't exist */ }

  const ix = await (program.methods as any)
    .swap(direction, new BN(amount), new BN(0))
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

  if (sim.value.err) return 0;

  // Read post-balance from simulated accounts
  const postAccounts = (sim.value as any).accounts;
  if (postAccounts?.[0]?.data) {
    const buf = Uint8Array.from(atob(postAccounts[0].data[0]), c => c.charCodeAt(0));
    const view = new DataView(buf.buffer);
    const postBal = Number(view.getBigUint64(64, true));
    return Math.max(postBal - preBal, 0);
  }

  return 0;
}
