"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { CLUSTER } from "@/lib/constants";
import { deriveYesMint } from "@/lib/pda";

interface TradeEvent {
  signature: string;
  time: number;
  type: string;
  side?: "YES" | "NO";
  prob?: string;
  wallet: string;
  color: string;
}

function truncateWallet(key: string): string {
  return `${key.slice(0, 4)}..${key.slice(-3)}`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function RecentTrades({ marketPda }: { marketPda: string }) {
  const { connection } = useConnection();

  // Derive YES mint to identify YES vs NO tokens in tx balance changes
  const marketKey = new PublicKey(marketPda);
  const yesMintKey = deriveYesMint(marketKey).toBase58();

  const { data: trades, isLoading } = useQuery<TradeEvent[]>({
    queryKey: ["recent-trades", marketPda],
    queryFn: async () => {
      const sigs = await connection.getSignaturesForAddress(marketKey, { limit: 10 });
      const results: TradeEvent[] = [];

      for (const sig of sigs) {
        try {
          const tx = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
          if (!tx || tx.meta?.err) continue;

          const logs = tx.meta?.logMessages ?? [];
          const ixLog = logs.find((l) => l.includes("Instruction:"));
          const ixName = ixLog?.replace(/.*Instruction: /, "")?.trim() ?? "";
          if (!["Swap", "DepositLiquidity", "WithdrawLiquidity", "RedeemPair", "ClaimWinnings", "ResolveMarket"].includes(ixName)) continue;

          const wallet = tx.transaction.message.accountKeys[0]?.pubkey?.toBase58() ?? "";
          let type = ixName;
          let side: "YES" | "NO" | undefined;
          let prob: string | undefined;
          let color = "text-muted";

          if (ixName === "Swap") {
            const pre = tx.meta?.preTokenBalances ?? [];
            const post = tx.meta?.postTokenBalances ?? [];
            const usdcMint = "8m8VRDdvuxE4MQZBX8RqKMpuwqBYTQiME7n85Mw73j6A";

            // Find which non-USDC token the user received (= BUY) or sent (= SELL)
            let bought = false;
            for (const postBal of post) {
              if (postBal.owner !== wallet) continue;
              if (postBal.mint === usdcMint) continue;

              const preBal = pre.find((p) => p.accountIndex === postBal.accountIndex);
              const preAmt = Number(preBal?.uiTokenAmount?.amount ?? "0");
              const postAmt = Number(postBal.uiTokenAmount.amount);
              const delta = postAmt - preAmt;

              if (delta === 0) continue;

              // Identify YES vs NO by comparing mint with derived YES mint
              side = postBal.mint === yesMintKey ? "YES" : "NO";
              bought = delta > 0;

              // Calculate probability from USDC amount / token amount
              const usdcPost = post.find((p) => p.owner === wallet && p.mint === usdcMint);
              const usdcPre = pre.find((p) => p.owner === wallet && p.mint === usdcMint);
              if (usdcPost && usdcPre) {
                const usdcDelta = Math.abs(Number(usdcPost.uiTokenAmount.amount) - Number(usdcPre.uiTokenAmount.amount));
                const tokenDelta = Math.abs(delta);
                if (tokenDelta > 0) {
                  const avgPrice = usdcDelta / tokenDelta;
                  prob = `${Math.round(avgPrice * 100)}%`;
                }
              }
              break;
            }

            type = bought ? `BUY ${side}` : `SELL ${side}`;
            color = side === "YES" ? "text-yes" : "text-no";
          } else {
            const labels: Record<string, { t: string; c: string }> = {
              DepositLiquidity: { t: "LP DEPOSIT", c: "text-yes" },
              WithdrawLiquidity: { t: "LP WITHDRAW", c: "text-no" },
              RedeemPair: { t: "REDEEM", c: "text-muted" },
              ClaimWinnings: { t: "SETTLE", c: "text-yes" },
              ResolveMarket: { t: "RESOLVED", c: "text-text-hi" },
            };
            const info = labels[ixName];
            if (info) { type = info.t; color = info.c; }
          }

          results.push({ signature: sig.signature, time: sig.blockTime ?? 0, type, side, prob, wallet, color });
        } catch { /* skip */ }
      }
      return results;
    },
    enabled: !!marketPda,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  return (
    <div className="border border-line p-[16px] space-y-[6px]">
      <div className="text-caption">RECENT ACTIVITY</div>

      {isLoading && <p className="text-[11px] text-muted font-mono">Loading...</p>}
      {!isLoading && (!trades || trades.length === 0) && <p className="text-[11px] text-muted font-mono">No activity yet.</p>}

      {trades && trades.length > 0 && (
        <div className="space-y-[1px]">
          {trades.map((t) => (
            <a
              key={t.signature}
              href={`https://solscan.io/tx/${t.signature}?cluster=${CLUSTER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between py-[5px] border-b border-line last:border-0 hover:bg-surface -mx-[4px] px-[4px] transition-all duration-[120ms]"
            >
              <div className="flex items-center gap-[6px]">
                <span className={`text-[10px] font-mono font-medium uppercase tracking-[0.05em] ${t.color}`}>
                  {t.type}
                </span>
                {t.prob && (
                  <span className="text-[10px] font-mono text-text-dim">
                    at {t.prob}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-[8px] text-[10px] font-mono text-muted">
                <span>{truncateWallet(t.wallet)}</span>
                <span>{timeAgo(t.time)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
