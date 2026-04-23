"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Wordmark } from "@/components/ui/wordmark";
import { useMarkets } from "@/hooks/use-markets";
import { formatUsdc, poolValue } from "@/lib/pm-math";
import { CLUSTER } from "@/lib/constants";
import { toast } from "sonner";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

function Stat({ label, value, delta }: { label: string; value: string; delta?: string }) {
  const isUp = delta?.startsWith("+");
  return (
    <span className="inline-flex items-baseline gap-[8px]">
      <span className="text-muted">{label}</span>
      <span className="text-text-hi text-[12px]">{value}</span>
      {delta && (
        <span className={`text-[11px] ${isUp ? "text-yes" : "text-no"}`}>{delta}</span>
      )}
    </span>
  );
}

export function StatusBar() {
  const { publicKey } = useWallet();
  const { data: markets } = useMarkets();
  const [minting, setMinting] = useState(false);

  const handleFaucet = async () => {
    if (!publicKey || minting) return;
    setMinting(true);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`+${data.amount} mUSDC`, { description: "Faucet sent to your wallet" });
      } else {
        toast.error("Faucet failed", { description: data.error });
      }
    } catch {
      toast.error("Faucet unavailable");
    } finally {
      setMinting(false);
    }
  };

  const activeCount = markets?.filter((m) => !m.resolved).length ?? 0;
  const totalCount = markets?.length ?? 0;

  const totalTvl = markets?.reduce((sum, m) => {
    if (m.lEff <= 0) return sum;
    return sum + poolValue(m.price, m.lEff);
  }, 0) ?? 0;

  return (
    <div
      className={[
        "grid grid-cols-[auto_1fr_auto] gap-[32px] items-center",
        "px-[24px] py-[10px]",
        "border-b border-line bg-bg",
        "font-mono text-[11px] text-muted tracking-[0.03em]",
        "sticky top-0 z-10",
      ].join(" ")}
    >
      <Wordmark size={16} tone="light" />

      <div className="hidden md:flex gap-[24px] justify-center">
        <Stat label="NET" value={CLUSTER.toUpperCase()} />
        <Stat label="TVL" value={`$${formatUsdc(totalTvl)}`} />
        <Stat label="MKTS" value={String(totalCount)} />
        <Stat label="" value={`${activeCount} active`} />
      </div>

      <div className="flex items-center gap-[16px]">
        <a
          href="https://github.com/Mattdgn/pm-amm"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-[6px] text-muted hover:text-text-hi transition-all duration-[120ms] group"
        >
          <svg viewBox="0 0 16 16" className="w-[14px] h-[14px] fill-current"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          <span className="text-[10px] tracking-[0.05em]">Star us</span>
        </a>
        {publicKey && (
          <>
            <button
              onClick={handleFaucet}
              disabled={minting}
              className="text-yes hover:text-text-hi transition-all duration-[120ms] cursor-pointer disabled:opacity-50"
            >
              {minting ? "..." : "$FAUCET_mUSDC"}
            </button>
            <Link
              href="/admin"
              className="text-muted hover:text-text-hi transition-all duration-[120ms]"
            >
              ADMIN
            </Link>
          </>
        )}
        <WalletMultiButton />
      </div>
    </div>
  );
}
