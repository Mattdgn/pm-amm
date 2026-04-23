"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { Program } from "@anchor-lang/core";
import idl from "@/lib/pm_amm_idl.json";
import { PROGRAM_ID } from "@/lib/constants";
import { priceFromReserves, i80f48ToNumber } from "@/lib/pm-math";

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

export function useMarkets() {
  const { connection } = useConnection();

  return useQuery<MarketData[]>({
    queryKey: ["markets"],
    queryFn: async () => {
      const provider = { connection } as any;
      const program = new Program(idl as any, provider);
      // Filter by new Market account size (443 bytes) to skip old-layout accounts (379 bytes)
      const accounts = await (program.account as any).market.all([
        { dataSize: 443 },
      ]);

      return accounts.map((acc: any) => {
        const m = acc.account;
        const now = Math.floor(Date.now() / 1000);
        const remaining = Math.max(m.endTs.toNumber() - now, 1);
        const lZero = i80f48ToNumber(m.lZero);
        const lEff = lZero * Math.sqrt(remaining);
        const x = i80f48ToNumber(m.reserveYes);
        const y = i80f48ToNumber(m.reserveNo);
        const price = m.resolved
          ? (m.winningSide === 1 ? 1 : m.winningSide === 2 ? 0 : 0.5)
          : lEff > 0 && (x > 0 || y > 0)
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
