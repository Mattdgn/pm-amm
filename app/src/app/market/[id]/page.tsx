"use client";

import { use } from "react";
import { Header } from "@/components/header";
import { useMarkets } from "@/hooks/use-markets";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatTimeRemaining, formatUsdc, poolValue } from "@/lib/pm-math";
import Link from "next/link";

export default function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: markets, isLoading } = useMarkets();
  const market = markets?.find((m) => m.marketId === Number(id));

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-4 block">
          &larr; Back to markets
        </Link>

        {isLoading && <p className="text-muted-foreground">Loading...</p>}

        {!isLoading && !market && (
          <p className="text-destructive">Market #{id} not found.</p>
        )}

        {market && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">Market #{market.marketId}</h2>
              {market.resolved ? (
                <Badge variant="secondary">Resolved</Badge>
              ) : (
                <Badge variant="default">Active</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm text-muted-foreground">YES Price</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono font-bold">{formatPrice(market.price)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm text-muted-foreground">NO Price</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono font-bold">{formatPrice(1 - market.price)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm text-muted-foreground">Pool Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono">
                    ${formatUsdc(poolValue(market.price, market.lEff) * 1e6)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm text-muted-foreground">Expires</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono">{formatTimeRemaining(market.endTs)}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Trade & LP</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Trade panel coming in Sprint 12.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </>
  );
}
