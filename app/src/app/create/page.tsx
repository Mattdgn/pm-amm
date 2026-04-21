"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { StatusBar } from "@/components/layout/status-bar";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { useProgram } from "@/hooks/use-program";
import { PublicKey, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { USDC_MINT, solscanTxUrl } from "@/lib/constants";
import { BN } from "@coral-xyz/anchor";
import { toast } from "sonner";
import Link from "next/link";

export default function CreateMarketPage() {
  const [name, setName] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [initialLiquidity, setInitialLiquidity] = useState("100");
  const [loading, setLoading] = useState(false);
  const program = useProgram();
  const { publicKey } = useWallet();
  const router = useRouter();

  const handleCreate = async () => {
    if (!program || !publicKey || !name) return;
    setLoading(true);
    try {
      const days = parseFloat(durationDays) || 30;
      const liquidity = parseFloat(initialLiquidity) || 0;
      const endTs = Math.floor(Date.now() / 1000) + Math.floor(days * 86400);
      const marketId = Math.floor(Date.now() / 1000) % 1_000_000;

      const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), new BN(marketId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      const [yesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()], program.programId);
      const [noMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()], program.programId);
      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPda.toBuffer()], program.programId);

      // Metaplex Token Metadata program
      const TOKEN_METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
      const [yesMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM.toBuffer(), yesMint.toBuffer()],
        TOKEN_METADATA_PROGRAM
      );
      const [noMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM.toBuffer(), noMint.toBuffer()],
        TOKEN_METADATA_PROGRAM
      );

      const tx1 = await (program.methods as any)
        .initializeMarket(new BN(marketId), new BN(endTs), name)
        .accounts({
          authority: publicKey, market: marketPda, collateralMint: USDC_MINT,
          yesMint, noMint, vault,
          yesMetadata, noMetadata,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM,
          systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
          rent: new PublicKey("SysvarRent111111111111111111111111111111111"),
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .rpc();

      toast.success("Market created", {
        description: `ID: ${marketId}`,
        action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx1), "_blank") },
      });

      if (liquidity > 0) {
        const lamports = Math.floor(liquidity * 1e6);
        const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const [lpPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("lp"), marketPda.toBuffer(), publicKey.toBuffer()],
          program.programId
        );
        const tx2 = await (program.methods as any)
          .depositLiquidity(new BN(lamports))
          .accounts({
            signer: publicKey, market: marketPda, collateralMint: USDC_MINT,
            vault, userCollateral: userUsdc, lpPosition: lpPda,
            systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
          })
          .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
          .rpc();
        toast.success(`Deposited ${liquidity} USDC`, {
          action: { label: "Solscan ↗", onClick: () => window.open(solscanTxUrl(tx2), "_blank") },
        });
      }

      router.push(`/market/${marketId}`);
    } catch (err: any) {
      toast.error("Creation failed", { description: err.message?.slice(0, 150) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar />
      <main className="flex-1 max-w-lg mx-auto w-full px-[48px] py-[32px]">
        <Link
          href="/"
          className="text-[12px] text-muted hover:text-text-hi transition-all duration-[120ms] mb-[16px] block font-mono tracking-[0.03em]"
        >
          ← BACK
        </Link>

        <div className="border border-line p-[24px] space-y-[16px]">
          <div className="text-caption">CREATE MARKET</div>

          <div>
            <div className="text-caption mb-[8px]">QUESTION</div>
            <div className="border border-line-2 rounded-lg px-[12px] focus-within:border-muted transition-all duration-[120ms]">
              <input
                className="bg-transparent border-none outline-none text-text-hi text-[14px] py-[10px] w-full"
                placeholder="Will BTC hit $200k by December?"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <AmountInput
            label="DURATION"
            unit="DAYS"
            type="number"
            placeholder="30"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            min="1"
            step="1"
          />

          <AmountInput
            label="INITIAL LIQUIDITY"
            unit="USDC"
            type="number"
            placeholder="100"
            value={initialLiquidity}
            onChange={(e) => setInitialLiquidity(e.target.value)}
            min="0"
            step="1"
          />

          <p className="text-[11px] text-muted font-mono">
            First deposit sets L₀ and initializes at 50/50.
          </p>

          <Button
            variant="secondary"
            className="w-full"
            onClick={handleCreate}
            disabled={!publicKey || !name || loading}
          >
            {loading ? "Creating..." : "Create Market"}
          </Button>

          {!publicKey && (
            <p className="text-[11px] text-muted font-mono text-center">
              Connect wallet to create.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
