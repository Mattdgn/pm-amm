/**
 * Seed devnet with fresh markets using existing USDC mock mint.
 * Uses RPC from app/.env (NEXT_PUBLIC_RPC_URL).
 *
 * Usage:
 *   pnpm run seed
 */

import * as anchor from "@anchor-lang/core";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

const USDC_MINT = new PublicKey("8m8VRDdvuxE4MQZBX8RqKMpuwqBYTQiME7n85Mw73j6A");
const TOKEN_METADATA_PROGRAM = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const MARKETS = [
  { name: "Will BTC hit $200k by Dec 2026?", durationDays: 30, liquidity: 100 },
  { name: "ETH flips SOL in TVL?", durationDays: 14, liquidity: 100 },
  { name: "Will SOL hit $500?", durationDays: 30, liquidity: 100 },
];

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = require("../../app/src/lib/pm_amm_idl.json");
  const program = new anchor.Program(idl, provider);
  const payer = (provider.wallet as any).payer;
  const wallet = provider.wallet.publicKey;

  console.log("=== pm-AMM Seed Markets ===");
  console.log(`Wallet: ${wallet.toBase58()}`);
  console.log(`Program: ${program.programId.toBase58()}`);
  console.log(`USDC: ${USDC_MINT.toBase58()}\n`);

  for (const m of MARKETS) {
    const marketId = Date.now() % 1_000_000_000;
    const now = Math.floor(Date.now() / 1000);
    const endTs = now + m.durationDays * 86400;

    const [marketPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("market"),
        new anchor.BN(marketId).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [yesMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("yes_mint"), marketPda.toBuffer()],
      program.programId
    );
    const [noMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("no_mint"), marketPda.toBuffer()],
      program.programId
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), marketPda.toBuffer()],
      program.programId
    );
    const [yesMetadata] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM.toBuffer(),
        yesMint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM
    );
    const [noMetadata] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM.toBuffer(),
        noMint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM
    );

    console.log(`--- ${m.name} (${m.durationDays}d, ${m.liquidity} USDC) ---`);

    // Create market
    await (program.methods as any)
      .initializeMarket(new anchor.BN(marketId), new anchor.BN(endTs), m.name)
      .accounts({
        authority: wallet,
        market: marketPda,
        collateralMint: USDC_MINT,
        yesMint,
        noMint,
        vault,
        yesMetadata,
        noMetadata,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ])
      .rpc();
    console.log(`  Created: ${marketPda.toBase58()} (ID: ${marketId})`);

    // Deposit liquidity
    if (m.liquidity > 0) {
      const lamports = m.liquidity * 1e6;
      const userUsdc = await getAssociatedTokenAddress(USDC_MINT, wallet);
      const [lpPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), marketPda.toBuffer(), wallet.toBuffer()],
        program.programId
      );

      await (program.methods as any)
        .depositLiquidity(new anchor.BN(lamports))
        .accounts({
          signer: wallet,
          market: marketPda,
          collateralMint: USDC_MINT,
          vault,
          userCollateral: userUsdc,
          lpPosition: lpPda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
        ])
        .rpc();
      console.log(`  LP: ${m.liquidity} USDC deposited`);
    }

    // Small delay to avoid same-ms market ID collision
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\n=== Seed Complete ===");
}

main().catch(console.error);
