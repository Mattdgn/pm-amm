"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { PROGRAM_ID } from "@/lib/constants";
import type { MarketData } from "@/hooks/use-markets";

/** Set of market publicKeys where the user holds YES or NO tokens. */
export function useUserPositions(markets: MarketData[] | undefined) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery<Set<string>>({
    queryKey: ["user-positions", publicKey?.toBase58(), markets?.length],
    queryFn: async () => {
      if (!publicKey || !markets || markets.length === 0) return new Set();

      const held = new Set<string>();

      await Promise.all(
        markets.map(async (m) => {
          try {
            const marketPda = new PublicKey(m.publicKey);
            const [yesMint] = PublicKey.findProgramAddressSync(
              [Buffer.from("yes_mint"), marketPda.toBuffer()], PROGRAM_ID
            );
            const [noMint] = PublicKey.findProgramAddressSync(
              [Buffer.from("no_mint"), marketPda.toBuffer()], PROGRAM_ID
            );

            const yesAta = await getAssociatedTokenAddress(yesMint, publicKey);
            const noAta = await getAssociatedTokenAddress(noMint, publicKey);

            const [yesInfo, noInfo] = await Promise.allSettled([
              getAccount(connection, yesAta),
              getAccount(connection, noAta),
            ]);

            const yesBalance = yesInfo.status === "fulfilled" ? Number(yesInfo.value.amount) : 0;
            const noBalance = noInfo.status === "fulfilled" ? Number(noInfo.value.amount) : 0;

            if (yesBalance > 0 || noBalance > 0) {
              held.add(m.publicKey);
            }
          } catch {
            // Skip markets where lookup fails
          }
        })
      );

      return held;
    },
    enabled: !!publicKey && !!markets && markets.length > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}
