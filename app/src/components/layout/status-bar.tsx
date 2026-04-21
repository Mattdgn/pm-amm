"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Wordmark } from "@/components/ui/wordmark";
import { useMarkets } from "@/hooks/use-markets";
import { formatUsdc, poolValue } from "@/lib/pm-math";
import { CLUSTER } from "@/lib/constants";

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

      <div className="flex items-center gap-[20px]">
        <span className="hidden sm:inline-flex items-center gap-[6px] text-yes">
          <span className="w-[6px] h-[6px] rounded-full bg-yes animate-[blink_1.4s_infinite]" />
          LIVE
        </span>
        {publicKey && (
          <Link
            href="/admin"
            className="text-muted hover:text-text-hi transition-all duration-[120ms]"
          >
            ADMIN
          </Link>
        )}
        <WalletMultiButton />
      </div>
    </div>
  );
}
