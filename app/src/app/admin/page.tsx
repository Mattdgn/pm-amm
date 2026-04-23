"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { StatusBar } from "@/components/layout/status-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetaRow } from "@/components/ui/meta-row";
import { useMarkets, type MarketData } from "@/hooks/use-markets";
import { useProgram } from "@/hooks/use-program";
import { formatTimeRemaining } from "@/lib/pm-math";
import { solscanTxUrl } from "@/lib/constants";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import Link from "next/link";

type MarketStatus = "active" | "expired" | "resolved";

function getAdminStatus(m: MarketData): MarketStatus {
  if (m.resolved) return "resolved";
  const now = Math.floor(Date.now() / 1000);
  return now >= m.endTs ? "expired" : "active";
}

function AdminMarketRow({ market }: { market: MarketData }) {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState<"yes" | "no" | null>(null);
  const status = getAdminStatus(market);

  const resolve = async (side: "yes" | "no") => {
    if (!program || !publicKey) return;
    setLoading(side);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const sideArg = side === "yes" ? { yes: {} } : { no: {} };
      const sig = await (program.methods as any)
        .resolveMarket(sideArg)
        .accounts({ signer: publicKey, market: marketPda })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        ])
        .rpc();
      toast.success(`Resolved → ${side.toUpperCase()}`, {
        action: {
          label: "Solscan",
          onClick: () => window.open(solscanTxUrl(sig), "_blank"),
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) { toast.info("Transaction cancelled"); setLoading(null); return; }
      toast.error("Resolve failed", {
        description: msg.slice(0, 150),
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="border border-line p-[16px] space-y-[8px]">
      <div className="flex items-center justify-between">
        <div className="font-sans text-[14px] text-text-hi">
          {market.name}
        </div>
        <Badge
          variant={
            status === "resolved"
              ? market.winningSide === 1
                ? "yes"
                : "no"
              : "default"
          }
        >
          {status === "resolved"
            ? `${market.winningSide === 1 ? "YES" : "NO"} WON`
            : status.toUpperCase()}
        </Badge>
      </div>

      <MetaRow label="ID" value={`#${market.marketId}`} />
      <MetaRow label="YES" value={market.price.toFixed(4)} />
      <MetaRow
        label="Expires"
        value={formatTimeRemaining(market.endTs)}
        last={status !== "expired"}
      />

      {status === "expired" && (
        <div className="grid grid-cols-2 gap-[8px] pt-[8px]">
          <Button
            variant="yes"
            className="w-full"
            onClick={() => resolve("yes")}
            disabled={loading !== null}
          >
            {loading === "yes" ? "..." : "RESOLVE YES"}
          </Button>
          <Button
            variant="no"
            className="w-full"
            onClick={() => resolve("no")}
            disabled={loading !== null}
          >
            {loading === "no" ? "..." : "RESOLVE NO"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { publicKey } = useWallet();
  const { data: markets, isLoading } = useMarkets();

  const ownedMarkets = markets?.filter(
    (m) => m.authority === publicKey?.toBase58()
  );

  // Sort: expired first, then active, then resolved
  const sorted = ownedMarkets?.sort((a, b) => {
    const order: Record<MarketStatus, number> = {
      expired: 0,
      active: 1,
      resolved: 2,
    };
    return order[getAdminStatus(a)] - order[getAdminStatus(b)];
  });

  return (
    <>
      <StatusBar />
      <main className="flex-1 max-w-lg mx-auto w-full px-[48px] py-[32px]">
        <Link
          href="/"
          className="text-[12px] text-muted hover:text-text-hi transition-all duration-[120ms] mb-[16px] block font-mono tracking-[0.03em]"
        >
          ← BACK
        </Link>

        <div className="text-caption mb-[16px]">ADMIN — RESOLVE MARKETS</div>

        {!publicKey && (
          <p className="text-[12px] text-muted font-mono">
            Connect wallet to view your markets.
          </p>
        )}

        {isLoading && (
          <p className="text-[12px] text-muted font-mono">Loading...</p>
        )}

        {publicKey && !isLoading && (!sorted || sorted.length === 0) && (
          <p className="text-[12px] text-muted font-mono">
            No markets owned by this wallet.
          </p>
        )}

        <div className="space-y-[12px]">
          {sorted?.map((m) => (
            <AdminMarketRow key={m.publicKey} market={m} />
          ))}
        </div>
      </main>
    </>
  );
}
