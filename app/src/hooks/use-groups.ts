"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { Program } from "@anchor-lang/core";
import idl from "@/lib/pm_amm_idl.json";
import type { MarketData } from "@/hooks/use-markets";
import { sumProbabilities } from "@/lib/pm-math";

/** GroupMarket binary account size (matches state.rs::GroupMarket::LEN). */
const GROUP_ACCOUNT_SIZE = 1188;

/** Anchor BN-like type; we only read .toString() to widen-convert. */
type AnchorBn = { toString(): string };

const bnToNum = (bn: AnchorBn): number => Number(BigInt(bn.toString()));

export interface GroupData {
  publicKey: string;
  groupId: number;
  authority: string;
  name: string;
  startTs: number;
  endTs: number;
  legCount: number;
  /** Length = legCount. `null` slots indicate an attached pubkey we couldn't resolve. */
  legs: (MarketData | null)[];
  /** Pubkeys of all leg slots (raw, before resolution). */
  legPubkeys: string[];
  resolved: boolean;
  /** Index of the winning leg, or `null` if not resolved. */
  winningLeg: number | null;
  /** Σ p_i across attached legs. Should be ≈ 1; drift = arb opportunity. */
  sumProbabilities: number;
}

/** Decode the 64-byte name array into a UTF-8 string (trailing zeros trimmed). */
function decodeName(nameBytes: number[] | undefined): string {
  const arr = nameBytes ?? [];
  const end = arr.indexOf(0);
  return new TextDecoder().decode(new Uint8Array(end >= 0 ? arr.slice(0, end) : arr));
}

/**
 * Fetch all GroupMarket accounts and join each with its leg Market data.
 *
 * `markets` is passed in (from useMarkets) rather than re-fetched so the leg
 * price + reserves stay in sync with the rest of the UI on a single 10s tick.
 */
export function useGroups(markets: MarketData[] | undefined) {
  const { connection } = useConnection();

  const marketByPubkey = useMemo(
    () => new Map((markets ?? []).map((m) => [m.publicKey, m])),
    [markets],
  );

  return useQuery<GroupData[]>({
    queryKey: ["groups", markets?.length ?? 0],
    enabled: markets !== undefined,
    queryFn: async () => {
      const provider = { connection } as unknown as {
        connection: typeof connection;
      };
      const program = new Program(idl as unknown as object, provider);
      const accounts = await (
        program.account as unknown as {
          groupMarket: {
            all: (
              filters: { dataSize: number }[],
            ) => Promise<
              { publicKey: { toBase58: () => string }; account: Record<string, unknown> }[]
            >;
          };
        }
      ).groupMarket.all([{ dataSize: GROUP_ACCOUNT_SIZE }]);

      return accounts.map((acc) => buildGroupData(acc, marketByPubkey));
    },
    refetchInterval: 10_000,
  });
}

interface RawAccount {
  publicKey: { toBase58: () => string };
  account: Record<string, unknown>;
}

function buildGroupData(acc: RawAccount, marketByPubkey: Map<string, MarketData>): GroupData {
  const g = acc.account as {
    authority: { toBase58: () => string };
    groupId: AnchorBn;
    startTs: AnchorBn;
    endTs: AnchorBn;
    legCount: number;
    legs: { toBase58: () => string }[];
    resolved: boolean;
    winningLeg: number;
    name: number[];
  };

  const legCount = g.legCount;
  const legPubkeys = g.legs.slice(0, legCount).map((p) => p.toBase58());
  const legs: (MarketData | null)[] = legPubkeys.map((pk) => marketByPubkey.get(pk) ?? null);
  const legPrices = legs.filter((m): m is MarketData => m !== null).map((m) => m.price);
  const sumP = sumProbabilities(legPrices);

  const NO_WINNING_LEG = 0xff;
  const winningLeg = g.resolved && g.winningLeg !== NO_WINNING_LEG ? g.winningLeg : null;

  const groupId = bnToNum(g.groupId);
  const nameStr = decodeName(g.name) || `Group #${groupId}`;

  return {
    publicKey: acc.publicKey.toBase58(),
    groupId,
    authority: g.authority.toBase58(),
    name: nameStr,
    startTs: bnToNum(g.startTs),
    endTs: bnToNum(g.endTs),
    legCount,
    legs,
    legPubkeys,
    resolved: g.resolved,
    winningLeg,
    sumProbabilities: sumP,
  };
}

/** Fetch a single group by groupId, with its resolved legs. */
export function useGroup(groupId: number | bigint | undefined, markets: MarketData[] | undefined) {
  const { data: groups, ...rest } = useGroups(markets);
  const group = useMemo(() => {
    if (groupId === undefined || !groups) return undefined;
    const target = BigInt(groupId);
    return groups.find((g) => BigInt(g.groupId) === target);
  }, [groups, groupId]);

  return { data: group, ...rest };
}
