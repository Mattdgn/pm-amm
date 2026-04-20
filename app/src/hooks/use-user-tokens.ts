"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

export interface UserTokens {
  yes: number;
  no: number;
  usdc: number;
  yesAta: string;
  noAta: string;
  usdcAta: string;
}

export function useUserTokens(
  yesMint: string | undefined,
  noMint: string | undefined,
  usdcMint: string | undefined
) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery<UserTokens | null>({
    queryKey: ["user-tokens", publicKey?.toBase58(), yesMint, noMint],
    queryFn: async () => {
      if (!publicKey || !yesMint || !noMint || !usdcMint) return null;

      async function getBalance(mint: string): Promise<[number, string]> {
        try {
          const ata = await getAssociatedTokenAddress(
            new PublicKey(mint),
            publicKey!
          );
          const acc = await getAccount(connection, ata);
          return [Number(acc.amount), ata.toBase58()];
        } catch {
          return [0, ""];
        }
      }

      const [yes, yesAta] = await getBalance(yesMint);
      const [no, noAta] = await getBalance(noMint);
      const [usdc, usdcAta] = await getBalance(usdcMint);

      return { yes, no, usdc, yesAta, noAta, usdcAta };
    },
    enabled: !!publicKey && !!yesMint,
    refetchInterval: 5_000,
  });
}
