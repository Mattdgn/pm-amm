"use client";

import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { CLUSTER } from "@/lib/constants";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export function Header() {
  return (
    <header className="border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">pm-AMM</h1>
        <Badge variant="outline" className="text-xs">
          {CLUSTER}
        </Badge>
      </div>
      <WalletMultiButton />
    </header>
  );
}
