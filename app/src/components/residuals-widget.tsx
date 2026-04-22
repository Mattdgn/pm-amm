"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { useProgram } from "@/hooks/use-program";
import { useLpPosition } from "@/hooks/use-lp-position";
import type { MarketData } from "@/hooks/use-markets";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { solscanTxUrl } from "@/lib/constants";
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
      const yesMint = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()], program.programId)[0];
      const noMint = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()], program.programId)[0];
      const userYes = await getAssociatedTokenAddress(yesMint, publicKey);
      const userNo = await getAssociatedTokenAddress(noMint, publicKey);
      const [lpPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), marketPda.toBuffer(), publicKey.toBuffer()],
        program.programId
      );
      // Ensure YES+NO ATAs exist (may have been closed after a sell)
      const conn = program.provider.connection;
      const preIxs: any[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })];
      for (const [ata, mint] of [[userYes, yesMint], [userNo, noMint]] as [PublicKey, PublicKey][]) {
        try { await getAccount(conn, ata); } catch {
          preIxs.push(createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint));
        }
      }

      const tx = await (program.methods as any)
        .claimLpResiduals()
        .accounts({
          signer: publicKey, market: marketPda, yesMint, noMint,
          lpPosition: lpPda, userYes, userNo, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(preIxs)
        .rpc();
      toast.success("Claimed YES+NO residuals", {
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
    } catch (err: any) {
      if (err.message?.includes("NoResidualsToClaim")) {
        toast.info("No residuals to claim yet.");
      } else {
        toast.error("Claim failed", { description: err.message?.slice(0, 120) });
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
