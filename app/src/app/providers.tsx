"use client";

import { ReactNode } from "react";
import { SolanaProvider } from "@/providers/solana-provider";
import { QueryProvider } from "@/providers/query-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <SolanaProvider>{children}</SolanaProvider>
    </QueryProvider>
  );
}
