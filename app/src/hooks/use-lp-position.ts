"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import idl from "@/lib/pm_amm_idl.json";
import { PROGRAM_ID } from "@/lib/constants";

const LP_SEED = Buffer.from("lp");

function i80f48ToNumber(raw: any): number {
  const bn = typeof raw === "bigint" ? raw : BigInt(raw.toString());
  return Number(bn) / 2 ** 48;
}

export interface LpPositionData {
  shares: number;
  collateralDeposited: number;
  yesCheckpoint: number;
  noCheckpoint: number;
  pda: string;
}

export function useLpPosition(marketPda: string | undefined) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery<LpPositionData | null>({
    queryKey: ["lp-position", marketPda, publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey || !marketPda) return null;
      const marketKey = new PublicKey(marketPda);
      const [lpPda] = PublicKey.findProgramAddressSync(
        [LP_SEED, marketKey.toBuffer(), publicKey.toBuffer()],
        new PublicKey(idl.address)
      );
      const program = new Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, { connection } as any);
      try {
        const lp = await (program.account as any).lpPosition.fetch(lpPda);
        return {
          shares: i80f48ToNumber(lp.shares),
          collateralDeposited: lp.collateralDeposited.toNumber(),
          yesCheckpoint: i80f48ToNumber(lp.yesPerShareCheckpoint),
          noCheckpoint: i80f48ToNumber(lp.noPerShareCheckpoint),
          pda: lpPda.toBase58(),
        };
      } catch {
        return null;
      }
    },
    enabled: !!publicKey && !!marketPda,
    refetchInterval: 5_000,
  });
}
