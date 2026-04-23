"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { MetaRow } from "@/components/ui/meta-row";
import { Figure } from "@/components/ui/figure";
import { useMarkets } from "@/hooks/use-markets";
import { useUserTokens } from "@/hooks/use-user-tokens";
import { formatUsdc } from "@/lib/pm-math";
import { USDC_MINT } from "@/lib/constants";
import { deriveYesMint, deriveNoMint } from "@/lib/pda";

/** Fetch just the USDC balance — no YES/NO mints needed. */
function useUsdcBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery<number>({
    queryKey: ["usdc-balance", publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) return 0;
      try {
        const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const acc = await getAccount(connection, ata);
        return Number(acc.amount);
      } catch {
        return 0;
      }
    },
    enabled: !!publicKey,
    refetchInterval: 10_000,
  });
}

function MarketPosition({ market }: { market: { publicKey: string; marketId: number; name: string; price: number; resolved: boolean; winningSide: number } }) {
  const marketPda = new PublicKey(market.publicKey);
  const yesMint = deriveYesMint(marketPda).toBase58();
  const noMint = deriveNoMint(marketPda).toBase58();

  const { data: tokens } = useUserTokens(yesMint, noMint, USDC_MINT.toBase58());

  const yesAmt = tokens?.yes ?? 0;
  const noAmt = tokens?.no ?? 0;
  if (yesAmt === 0 && noAmt === 0) return null;

  const estValue = market.resolved
    ? (market.winningSide === 1 ? yesAmt : market.winningSide === 2 ? noAmt : 0)
    : yesAmt * market.price + noAmt * (1 - market.price);

  return (
    <div className="border-b border-line py-[12px]">
      <div className="flex justify-between items-baseline mb-[6px]">
        <span className="font-sans text-[13px] text-text-hi truncate mr-[8px]">{market.name}</span>
        <span className="text-[11px] tnum text-text-dim">~{formatUsdc(estValue)} USDC</span>
      </div>
      <div className="flex gap-[16px] text-[11px]">
        {yesAmt > 0 && (
          <span className="text-yes tnum">{formatUsdc(yesAmt)} YES</span>
        )}
        {noAmt > 0 && (
          <span className="text-no tnum">{formatUsdc(noAmt)} NO</span>
        )}
      </div>
    </div>
  );
}

export function PortfolioPanel() {
  const { publicKey } = useWallet();
  const { data: markets } = useMarkets();
  const { data: usdcBalance } = useUsdcBalance();

  if (!publicKey) {
    return (
      <aside className="border-l border-line p-[20px] hidden xl:flex items-center justify-center">
        <span className="text-muted font-mono text-[11px] tracking-[0.03em]">
          CONNECT WALLET
        </span>
      </aside>
    );
  }

  return (
    <aside className="border-l border-line p-[20px] font-mono text-[12px] hidden xl:block overflow-y-auto">
      <div className="text-[10px] text-muted uppercase tracking-[0.08em] pb-[10px] border-b border-line mb-[12px]">
        PORTFOLIO
      </div>

      <Figure
        label="USDC BALANCE"
        value={formatUsdc(usdcBalance ?? 0)}
        size="price"
        color="default"
      />

      <div className="text-[10px] text-muted uppercase tracking-[0.08em] mt-[20px] mb-[8px]">
        POSITIONS
      </div>

      {markets && markets.length > 0 ? (
        markets.map((m) => (
          <MarketPosition key={m.publicKey} market={m} />
        ))
      ) : (
        <p className="text-[11px] text-muted">No markets.</p>
      )}
    </aside>
  );
}
