"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { MetaRow } from "@/components/ui/meta-row";
import { useProgram } from "@/hooks/use-program";
import { useLpPosition } from "@/hooks/use-lp-position";
import { formatUsdc } from "@/lib/pm-math";
import type { MarketData } from "@/hooks/use-markets";
import { PublicKey, ComputeBudgetProgram, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { USDC_MINT, solscanTxUrl } from "@/lib/constants";
import { deriveYesMint, deriveNoMint, deriveVault, deriveLpPosition } from "@/lib/pda";
import { BN } from "@anchor-lang/core";
import { toast } from "sonner";

export function LpPanel({ market }: { market: MarketData }) {
  const [depositAmt, setDepositAmt] = useState("");
  const [loading, setLoading] = useState(false);
  const program = useProgram();
  const { publicKey } = useWallet();
  const { data: lp } = useLpPosition(market.publicKey);

  const marketPda = new PublicKey(market.publicKey);
  const vaultPda = deriveVault(marketPda);

  const handleDeposit = async () => {
    if (!program || !publicKey || !depositAmt) return;
    setLoading(true);
    try {
      const lamports = Math.floor(parseFloat(depositAmt) * 1e6);
      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const lpPda = deriveLpPosition(marketPda, publicKey);
      const tx = await (program.methods as any)
        .depositLiquidity(new BN(lamports))
        .accounts({
          signer: publicKey, market: marketPda, collateralMint: USDC_MINT,
          vault: vaultPda, userCollateral: userUsdc, lpPosition: lpPda,
          systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .rpc();
      toast.success(`Deposited ${depositAmt} USDC`, {
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
      setDepositAmt("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) { toast.info("Transaction cancelled"); setLoading(false); return; }
      toast.error("Deposit failed", { description: msg.slice(0, 120) });
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!program || !publicKey || !lp) return;
    setLoading(true);
    try {
      const yesMint = deriveYesMint(marketPda);
      const noMint = deriveNoMint(marketPda);
      const userYes = await getAssociatedTokenAddress(yesMint, publicKey);
      const userNo = await getAssociatedTokenAddress(noMint, publicKey);
      const lpPda = deriveLpPosition(marketPda, publicKey);

      // Ensure YES/NO ATAs exist (may have been closed after a sell)
      const conn = program.provider.connection;
      const preIxs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })];
      for (const [ata, mint] of [[userYes, yesMint], [userNo, noMint]] as [PublicKey, PublicKey][]) {
        try { await getAccount(conn, ata); } catch {
          preIxs.push(createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint));
        }
      }

      const sharesBn = new BN((BigInt(Math.floor(lp.shares * 2 ** 48))).toString());
      const tx = await (program.methods as any)
        .withdrawLiquidity(sharesBn)
        .accounts({
          signer: publicKey, market: marketPda, collateralMint: USDC_MINT,
          yesMint: yesMint, noMint: noMint, lpPosition: lpPda, userYes: userYes, userNo: userNo,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(preIxs)
        .rpc();
      toast.success("Withdrew all liquidity", {
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx), "_blank") },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) { toast.info("Transaction cancelled"); setLoading(false); return; }
      toast.error("Withdraw failed", { description: msg.slice(0, 120) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-line p-[16px] space-y-[12px]">
      <div className="text-caption">LIQUIDITY</div>

      {lp && lp.shares > 0 && (
        <div className="border-b border-line pb-[8px]">
          <MetaRow label="Your shares" value={lp.shares.toFixed(2)} />
          <MetaRow label="Deposited" value={`$${formatUsdc(lp.collateralDeposited)}`} last />
        </div>
      )}

      {!market.resolved && <div className="flex gap-[8px]">
        <AmountInput
          placeholder="0.00"
          value={depositAmt}
          onChange={(e) => setDepositAmt(e.target.value)}
          type="number"
          min="0.001"
          step="0.01"
          className="flex-1"
        />
        <Button
          variant="secondary"
          onClick={handleDeposit}
          disabled={!publicKey || !depositAmt || loading}
          className="shrink-0"
        >
          {loading ? "..." : "Deposit"}
        </Button>
      </div>}

      {lp && lp.shares > 0 && (
        <Button variant="secondary" className="w-full" onClick={handleWithdraw} disabled={loading}>
          Withdraw All
        </Button>
      )}
    </div>
  );
}
