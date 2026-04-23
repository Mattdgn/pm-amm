"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { useProgram } from "@/hooks/use-program";
import { useLpPosition } from "@/hooks/use-lp-position";
import type { MarketData } from "@/hooks/use-markets";
import { PublicKey, ComputeBudgetProgram, type TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { solscanTxUrl } from "@/lib/constants";
import { deriveYesMint, deriveNoMint, deriveLpPosition } from "@/lib/pda";
import { toast } from "sonner";

export function ResidualsWidget({ market }: { market: MarketData }) {
  const [loading, setLoading] = useState(false);
  const program = useProgram();
  const { publicKey } = useWallet();
  const { data: lp } = useLpPosition(market.publicKey);

  if (!lp || lp.shares <= 0) return null;

  const handleClaim = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const yesMint = deriveYesMint(marketPda);
      const noMint = deriveNoMint(marketPda);
      const userYes = await getAssociatedTokenAddress(yesMint, publicKey);
      const userNo = await getAssociatedTokenAddress(noMint, publicKey);
      const lpPda = deriveLpPosition(marketPda, publicKey);
      // Ensure YES+NO ATAs exist (may have been closed after a sell)
      const conn = program.provider.connection;
      const preIxs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })];
      for (const [ata, mint] of [[userYes, yesMint], [userNo, noMint]] as [PublicKey, PublicKey][]) {
        try { await getAccount(conn, ata); } catch {
          preIxs.push(createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint));
        }
      }

      const tx = await (program.methods as any)
        .claimLpResiduals()
        .accounts({
          signer: publicKey, market: marketPda, yesMint: yesMint, noMint: noMint,
          lpPosition: lpPda, userYes: userYes, userNo: userNo, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(preIxs)
        .rpc();
      toast.success("Claimed YES+NO residuals", {
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) { toast.info("Transaction cancelled"); setLoading(false); return; }
      if (msg.includes("NoResidualsToClaim")) {
        toast.info("No residuals to claim yet.");
      } else {
        toast.error("Claim failed", { description: msg.slice(0, 120) });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-line border-l-accent border-l-2 p-[16px] space-y-[12px]">
      <div className="text-caption">LP RESIDUALS · dC_t</div>
      <p className="text-[12px] text-text-dim leading-[1.5]">
        As the market approaches expiry, YES+NO tokens are released to LPs.
      </p>
      <Button variant="secondary" className="w-full" onClick={handleClaim} disabled={loading || !publicKey}>
        {loading ? "Claiming..." : "Claim Residuals"}
      </Button>
    </div>
  );
}
