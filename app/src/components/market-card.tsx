"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatTimeRemaining, formatUsdc, poolValue } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";

const MARKET_NAMES: Record<number, string> = {
  1: "BTC > 100k by June",
  2: "ETH flips SOL TVL",
};

export function MarketCard({ market }: { market: MarketData }) {
  const name = MARKET_NAMES[market.marketId] ?? `Market #${market.marketId}`;
  const pv = market.lEff > 0 ? poolValue(market.price, market.lEff) : 0;

  return (
    <Link href={`/market/${market.marketId}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{name}</CardTitle>
            {market.resolved ? (
              <Badge variant="secondary">Resolved</Badge>
            ) : (
              <Badge variant="default">Active</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">YES Price</p>
              <p className="text-lg font-mono font-bold">
                {formatPrice(market.price)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Pool Value</p>
              <p className="text-lg font-mono">${formatUsdc(pv * 1e6)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Expires</p>
              <p className="text-lg font-mono">
                {formatTimeRemaining(market.endTs)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
