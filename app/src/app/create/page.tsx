"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { StatusBar } from "@/components/layout/status-bar";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { MetaRow } from "@/components/ui/meta-row";
import { useProgram } from "@/hooks/use-program";
import { PublicKey, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { USDC_MINT, METAPLEX_PROGRAM_ID, solscanTxUrl } from "@/lib/constants";
import { formatUsdc, expectedDailyLvr, poolValue } from "@/lib/pm-math";
import { BN } from "@anchor-lang/core";
import { toast } from "sonner";
import Link from "next/link";

export default function CreateMarketPage() {
  const [name, setName] = useState("");
  const [durationValue, setDurationValue] = useState("30");
  const [durationUnit, setDurationUnit] = useState<"min" | "hours" | "days">("days");
  const [initialLiquidity, setInitialLiquidity] = useState("100");
  const [loading, setLoading] = useState(false);
  const program = useProgram();
  const { publicKey } = useWallet();
  const router = useRouter();

  // --- Computed values for simulation ---
  const durNum = parseFloat(durationValue) || 0;
  const durSeconds = durationUnit === "min" ? durNum * 60 : durationUnit === "hours" ? durNum * 3600 : durNum * 86400;
  const liquidity = parseFloat(initialLiquidity) || 0;
  const liqLamports = liquidity * 1e6;

  // PM-AMM math: L_0 = budget / (phi(0) * sqrt(T)), L_eff = L_0 * sqrt(T) = budget / phi(0)
  const PHI_0 = 0.3989422804014327;
  const lEff = liqLamports > 0 ? liqLamports / PHI_0 : 0;
  const pv = lEff > 0 ? poolValue(0.5, lEff) : 0;
  const dailyLvr = durSeconds > 0 && lEff > 0 ? expectedDailyLvr(0.5, lEff, durSeconds) : 0;
  const expectedReturn = liqLamports / 2; // E[W_T] = W_0/2
  const expectedLoss = liqLamports - expectedReturn;

  const handleCreate = async () => {
    if (!program || !publicKey || !name) return;
    setLoading(true);
    try {
      if (durSeconds < 360) {
        toast.error("Duration too short", { description: "Minimum 6 minutes." });
        setLoading(false);
        return;
      }
      const endTs = Math.floor(Date.now() / 1000) + Math.floor(durSeconds);
      const marketId = Date.now() % 1_000_000_000;

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

      const TOKEN_METADATA_PROGRAM = METAPLEX_PROGRAM_ID;
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
        const userUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const [lpPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("lp"), marketPda.toBuffer(), publicKey.toBuffer()],
          program.programId
        );
        const tx2 = await (program.methods as any)
          .depositLiquidity(new BN(Math.floor(liqLamports)))
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WalletSign") || msg.includes("User rejected")) { toast.info("Transaction cancelled"); setLoading(false); return; }
      toast.error("Creation failed", { description: msg.slice(0, 150) });
    } finally {
      setLoading(false);
    }
  };

  const expires = durSeconds > 0 ? new Date(Date.now() + durSeconds * 1000) : null;

  return (
    <>
      <StatusBar />
      <main className="flex-1 max-w-2xl mx-auto w-full px-[48px] py-[32px]">
        <Link
          href="/"
          className="text-[12px] text-muted hover:text-text-hi transition-all duration-[120ms] mb-[16px] block font-mono tracking-[0.03em]"
        >
          ← BACK
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-[16px]">
          {/* Left: form */}
          <div className="border border-line p-[24px] space-y-[16px]">
            <div className="text-caption">CREATE MARKET</div>

            {/* Question */}
            <div>
              <div className="text-caption mb-[8px]">QUESTION</div>
              <div className={`border rounded-lg px-[12px] transition-all duration-[120ms] ${name.length > 64 ? "border-no" : "border-line-2 focus-within:border-muted"}`}>
                <input
                  className="bg-transparent border-none outline-none text-text-hi text-[14px] py-[10px] w-full"
                  placeholder="Will BTC hit $200k by December?"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={64}
                />
              </div>
              <div className="flex justify-end mt-[4px]">
                <span className={`text-[10px] font-mono ${name.length > 64 ? "text-no" : "text-muted"}`}>{name.length}/64</span>
              </div>
            </div>

            {/* Duration */}
            <div>
              <div className="flex items-center justify-between mb-[8px]">
                <div className="text-caption">DURATION</div>
                <div className="flex gap-[4px]">
                  {(["min", "hours", "days"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => {
                        const v = parseFloat(durationValue) || 1;
                        const toSec: Record<string, number> = { min: 60, hours: 3600, days: 86400 };
                        const seconds = v * toSec[durationUnit];
                        setDurationValue(String(Math.round(seconds / toSec[u])));
                        setDurationUnit(u);
                      }}
                      className={`px-[8px] py-[3px] rounded-sm text-[10px] font-mono uppercase tracking-[0.05em] border cursor-pointer transition-all duration-[120ms] ${durationUnit === u ? "text-text-hi border-line-2 bg-surface" : "text-muted border-transparent"}`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-[6px] mb-[8px]">
                {(durationUnit === "min"
                  ? [{ label: "10m", val: "10" }, { label: "30m", val: "30" }, { label: "45m", val: "45" }, { label: "60m", val: "60" }]
                  : durationUnit === "hours"
                    ? [{ label: "2h", val: "2" }, { label: "6h", val: "6" }, { label: "12h", val: "12" }, { label: "24h", val: "24" }]
                    : [{ label: "1d", val: "1" }, { label: "7d", val: "7" }, { label: "14d", val: "14" }, { label: "30d", val: "30" }]
                ).map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setDurationValue(p.val)}
                    className={`flex-1 py-[6px] rounded-sm text-[11px] font-mono border cursor-pointer transition-all duration-[120ms] ${durationValue === p.val ? "text-text-hi border-line-2 bg-surface" : "text-muted border-line hover:text-text-hi"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <AmountInput
                label=""
                unit={durationUnit.toUpperCase()}
                type="number"
                placeholder="30"
                value={durationValue}
                onChange={(e) => setDurationValue(e.target.value)}
                min="1"
                step="1"
              />
            </div>

            {/* Initial Liquidity */}
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

            {expires && (
              <p className="text-[11px] text-muted font-mono">
                Expires {expires.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{" "}
                {expires.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}

            <Button
              variant="secondary"
              className="w-full"
              onClick={handleCreate}
              disabled={!publicKey || !name || name.length > 64 || loading || durNum <= 0}
            >
              {loading ? "Creating..." : "Create Market"}
            </Button>

            {!publicKey && (
              <p className="text-[11px] text-muted font-mono text-center">Connect wallet to create.</p>
            )}
          </div>

          {/* Right: LP simulation */}
          <div className="border border-line p-[16px] space-y-[10px] h-fit">
            <div className="text-caption">LP SIMULATION</div>

            {liquidity > 0 && durSeconds > 0 ? (
              <>
                <MetaRow label="Pool Value" value={`$${formatUsdc(pv)}`} />
                <MetaRow label="Daily LVR cost" value={`$${formatUsdc(dailyLvr)}`} />
                <MetaRow
                  label="Expected return"
                  value={`~$${formatUsdc(expectedReturn)}`}
                />
                <MetaRow
                  label="Expected loss (LVR)"
                  value={`~$${formatUsdc(expectedLoss)}`}
                />
                <MetaRow
                  label="Return %"
                  value="-50.0%"
                  last
                />

                {/* Visual bar */}
                <div className="pt-[8px]">
                  <div className="flex justify-between text-[10px] font-mono mb-[4px]">
                    <span className="text-yes">You keep ~50%</span>
                    <span className="text-no">LVR ~50%</span>
                  </div>
                  <div className="h-[8px] bg-no/20 rounded-full overflow-hidden">
                    <div className="h-full bg-yes rounded-full" style={{ width: "50%" }} />
                  </div>
                </div>

                <p className="text-[10px] text-muted/60 font-mono pt-[4px]">
                  Based on E[W_T] = W_0/2 (random walk). Actual returns depend on trading activity and price path.
                </p>
              </>
            ) : (
              <p className="text-[11px] text-muted font-mono">
                Set duration and liquidity to see LP projections.
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
