"use client";

import { use } from "react";
import { Header } from "@/components/header";
import { TradePanel } from "@/components/trade-panel";
import { LpPanel } from "@/components/lp-panel";
import { ResidualsWidget } from "@/components/residuals-widget";
import { PositionCard } from "@/components/position-card";
import { useMarkets } from "@/hooks/use-markets";
import { useUserTokens } from "@/hooks/use-user-tokens";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatPrice,
  formatTimeRemaining,
  formatUsdc,
  poolValue,
} from "@/lib/pm-math";
import { USDC_MINT } from "@/lib/constants";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";

const MARKET_NAMES: Record<number, string> = {
  1: "BTC > 100k by June",
  2: "ETH flips SOL TVL",
};

export default function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: markets, isLoading } = useMarkets();
  const market = markets?.find((m) => m.marketId === Number(id));

  // Derive mints for user token lookup
  const programId = "GQGSTV9dig5fEwcfMpgqHjo9jAhxtnusMEbx8SrBBYnQ";
  const marketPda = market ? new PublicKey(market.publicKey) : undefined;
  const yesMint = marketPda
    ? PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()],
        new PublicKey(programId)
      )[0].toBase58()
    : undefined;
  const noMint = marketPda
    ? PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()],
        new PublicKey(programId)
      )[0].toBase58()
    : undefined;

  const { data: tokens } = useUserTokens(yesMint, noMint, USDC_MINT.toBase58());

  const name = MARKET_NAMES[Number(id)] ?? `Market #${id}`;

  return (
    <>
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground mb-4 block"
        >
          &larr; Back
        </Link>

        {isLoading && <p className="text-muted-foreground">Loading...</p>}
        {!isLoading && !market && (
          <p className="text-destructive">Market #{id} not found.</p>
        )}

        {market && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{name}</h2>
              {market.resolved ? (
                <Badge variant="secondary">
                  Resolved: {market.winningSide === 1 ? "YES" : "NO"} won
                </Badge>
              ) : (
                <Badge variant="default">Active</Badge>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm text-muted-foreground">
                    YES
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono font-bold text-green-500">
                    {formatPrice(market.price)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm text-muted-foreground">
                    NO
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono font-bold text-red-500">
                    {formatPrice(1 - market.price)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm text-muted-foreground">
                    Pool Value
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono">
                    ${formatUsdc(poolValue(market.price, market.lEff) * 1e6)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm text-muted-foreground">
                    Expires
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono">
                    {formatTimeRemaining(market.endTs)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Position */}
            <PositionCard market={market} tokens={tokens ?? null} />

            {/* Trade / LP tabs */}
            {!market.resolved && (
              <Tabs defaultValue="trade">
                <TabsList>
                  <TabsTrigger value="trade">Trade</TabsTrigger>
                  <TabsTrigger value="lp">LP</TabsTrigger>
                </TabsList>
                <TabsContent value="trade" className="mt-4">
                  <TradePanel market={market} />
                </TabsContent>
                <TabsContent value="lp" className="mt-4 space-y-4">
                  <LpPanel market={market} />
                  <ResidualsWidget market={market} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </main>
    </>
  );
}
