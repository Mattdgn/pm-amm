"use client";

import { Header } from "@/components/header";
import { MarketCard } from "@/components/market-card";
import { useMarkets } from "@/hooks/use-markets";

export default function Home() {
  const { data: markets, isLoading, error } = useMarkets();

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
        <h2 className="text-2xl font-bold mb-6">Prediction Markets</h2>

        {isLoading && (
          <p className="text-muted-foreground">Loading markets...</p>
        )}

        {error && (
          <p className="text-destructive">
            Error: {(error as Error).message}
          </p>
        )}

        {markets && markets.length === 0 && (
          <p className="text-muted-foreground">No markets found.</p>
        )}

        <div className="grid gap-4">
          {markets?.map((m) => (
            <MarketCard key={m.publicKey} market={m} />
          ))}
        </div>
      </main>
    </>
  );
}
