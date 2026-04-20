"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProgram } from "@/hooks/use-program";
import { useLpPosition } from "@/hooks/use-lp-position";
import { formatUsdc } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

export function ResidualsWidget({ market }: { market: MarketData }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const program = useProgram();
  const { publicKey } = useWallet();
  const { data: lp } = useLpPosition(market.publicKey);

  if (!lp || lp.shares <= 0) return null;

  // Compute pending residuals client-side
  // pending = (cum - checkpoint) * shares
  // We'd need the market's cum values. For now, show a claim button.
  // The actual pending is computed on-chain by the instruction.

  const handleClaim = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    setMsg(null);
    try {
      const marketPda = new PublicKey(market.publicKey);
      const yesMint = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()], program.programId
      )[0];
      const noMint = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()], program.programId
      )[0];
      const userYes = await getAssociatedTokenAddress(yesMint, publicKey);
      const userNo = await getAssociatedTokenAddress(noMint, publicKey);
      const [lpPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), marketPda.toBuffer(), publicKey.toBuffer()],
        program.programId
      );

      await (program.methods as any)
        .claimLpResiduals()
        .accounts({
          signer: publicKey,
          market: marketPda,
          yesMint,
          noMint,
          lpPosition: lpPda,
          userYes,
          userNo,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .rpc();

      setMsg("Claimed YES+NO residuals!");
    } catch (err: any) {
      if (err.message?.includes("NoResidualsToClaim")) {
        setMsg("No residuals to claim yet.");
      } else {
        setMsg(`Error: ${err.message?.slice(0, 80)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          LP Residuals (dC_t)
          <span className="text-xs font-normal text-muted-foreground">
            — tokens released as time passes
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          As the market approaches expiration, L_eff decreases and YES+NO tokens
          are released to LPs proportionally to their shares.
        </p>

        <Button
          onClick={handleClaim}
          disabled={loading || !publicKey}
          className="w-full"
        >
          {loading ? "Claiming..." : "Claim YES+NO Residuals"}
        </Button>

        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </CardContent>
    </Card>
  );
}
