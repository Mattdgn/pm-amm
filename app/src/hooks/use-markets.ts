"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { Program } from "@coral-xyz/anchor";
import idl from "@/lib/pm_amm_idl.json";
import { PROGRAM_ID } from "@/lib/constants";
import { priceFromReserves } from "@/lib/pm-math";

export interface MarketData {
  publicKey: string;
  marketId: number;
  authority: string;
  name: string;
  startTs: number;
  endTs: number;
  lZero: number;
  reserveYes: number;
  reserveNo: number;
  totalLpShares: number;
  resolved: boolean;
  winningSide: number;
  price: number;
  lEff: number;
}

function i80f48ToNumber(raw: any): number {
  // Anchor deserializes u128 as BN. Convert Q64.64 to float.
  const bn = typeof raw === "bigint" ? raw : BigInt(raw.toString());
  return Number(bn) / 2 ** 48;
}

export function useMarkets() {
  const { connection } = useConnection();

  return useQuery<MarketData[]>({
    queryKey: ["markets"],
    queryFn: async () => {
      const provider = { connection } as any;
      const program = new Program(idl as any, provider);
      const accounts = await (program.account as any).market.all();

      return accounts.map((acc: any) => {
        const m = acc.account;
        const now = Math.floor(Date.now() / 1000);
        const remaining = Math.max(m.endTs.toNumber() - now, 1);
        const lZero = i80f48ToNumber(m.lZero);
        const lEff = lZero * Math.sqrt(remaining);
        const x = i80f48ToNumber(m.reserveYes);
        const y = i80f48ToNumber(m.reserveNo);
        const price = lEff > 0 && (x > 0 || y > 0)
          ? priceFromReserves(x, y, lEff)
          : 0.5;

        // Decode name: [u8; 64] → trim trailing zeros → UTF-8 string
        const nameBytes: number[] = m.name ?? [];
        const end = nameBytes.indexOf(0);
        const nameStr = new TextDecoder().decode(
          new Uint8Array(end >= 0 ? nameBytes.slice(0, end) : nameBytes)
        );

        return {
          publicKey: acc.publicKey.toBase58(),
          marketId: m.marketId.toNumber(),
          authority: m.authority.toBase58(),
          name: nameStr || `Market #${m.marketId.toNumber()}`,
          startTs: m.startTs.toNumber(),
          endTs: m.endTs.toNumber(),
          lZero,
          reserveYes: x,
          reserveNo: y,
          totalLpShares: i80f48ToNumber(m.totalLpShares),
          resolved: m.resolved,
          winningSide: m.winningSide,
          price,
          lEff,
        };
      });
    },
    refetchInterval: 10_000,
  });
}
