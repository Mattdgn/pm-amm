import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PmAmm } from "../target/types/pm_amm";
import {
  PublicKey,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
} from "@solana/spl-token";

const YES_MINT_SEED = Buffer.from("yes_mint");
const NO_MINT_SEED = Buffer.from("no_mint");
const VAULT_SEED = Buffer.from("vault");
const LP_SEED = Buffer.from("lp");

function deriveMarketPdas(marketId: anchor.BN, programId: PublicKey) {
  const [marketPda, marketBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
    programId
  );
  const [yesMint] = PublicKey.findProgramAddressSync([YES_MINT_SEED, marketPda.toBuffer()], programId);
  const [noMint] = PublicKey.findProgramAddressSync([NO_MINT_SEED, marketPda.toBuffer()], programId);
  const [vault] = PublicKey.findProgramAddressSync([VAULT_SEED, marketPda.toBuffer()], programId);
  return { marketPda, marketBump, yesMint, noMint, vault };
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.pmAmm as Program<PmAmm>;
  const payer = (provider.wallet as any).payer;
  const authority = provider.wallet.publicKey;

  console.log("=== pm-AMM Devnet Seed ===");
  console.log(`Authority: ${authority.toBase58()}`);
  console.log(`Program: ${program.programId.toBase58()}`);

  // Create mock USDC
  console.log("\nCreating mock USDC mint...");
  const collateralMint = await createMint(provider.connection, payer, authority, null, 6);
  console.log(`USDC mint: ${collateralMint.toBase58()}`);

  // Create user USDC account + fund
  const userUsdc = await createAccount(provider.connection, payer, collateralMint, authority);
  await mintTo(provider.connection, payer, collateralMint, userUsdc, payer, 100_000_000_000); // 100k USDC
  console.log(`User USDC: ${userUsdc.toBase58()} (100k USDC)`);

  // --- Market 1: "BTC > 100k by June" — 30 days ---
  const market1Id = new anchor.BN(1);
  const market1Pdas = deriveMarketPdas(market1Id, program.programId);
  const now = Math.floor(Date.now() / 1000);

  console.log("\n--- Market 1: BTC > 100k by June (30 days) ---");
  await program.methods
    .initializeMarket(market1Id, new anchor.BN(now + 86400 * 30))
    .accounts({
      authority,
      market: market1Pdas.marketPda,
      collateralMint,
      yesMint: market1Pdas.yesMint,
      noMint: market1Pdas.noMint,
      vault: market1Pdas.vault,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log(`Market PDA: ${market1Pdas.marketPda.toBase58()}`);

  // Create YES/NO token accounts
  const m1UserYes = await createAccount(provider.connection, payer, market1Pdas.yesMint, authority);
  const m1UserNo = await createAccount(provider.connection, payer, market1Pdas.noMint, authority);
  const m1Lp = PublicKey.findProgramAddressSync(
    [LP_SEED, market1Pdas.marketPda.toBuffer(), authority.toBuffer()],
    program.programId
  )[0];

  // Deposit 1000 USDC
  await program.methods
    .depositLiquidity(new anchor.BN(1_000_000_000))
    .accounts({
      signer: authority,
      market: market1Pdas.marketPda,
      collateralMint,
      vault: market1Pdas.vault,
      userCollateral: userUsdc,
      lpPosition: m1Lp,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .rpc();
  console.log("Deposited 1000 USDC");

  // Do a swap to generate some activity
  await program.methods
    .swap({ usdcToYes: {} } as any, new anchor.BN(50_000_000), new anchor.BN(0))
    .accounts({
      signer: authority,
      market: market1Pdas.marketPda,
      collateralMint,
      yesMint: market1Pdas.yesMint,
      noMint: market1Pdas.noMint,
      vault: market1Pdas.vault,
      userCollateral: userUsdc,
      userYes: m1UserYes,
      userNo: m1UserNo,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .rpc();
  console.log("Swapped 50 USDC → YES");

  // --- Market 2: "ETH flips SOL TVL" — 7 days ---
  const market2Id = new anchor.BN(2);
  const market2Pdas = deriveMarketPdas(market2Id, program.programId);

  console.log("\n--- Market 2: ETH flips SOL TVL (7 days) ---");
  await program.methods
    .initializeMarket(market2Id, new anchor.BN(now + 86400 * 7))
    .accounts({
      authority,
      market: market2Pdas.marketPda,
      collateralMint,
      yesMint: market2Pdas.yesMint,
      noMint: market2Pdas.noMint,
      vault: market2Pdas.vault,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log(`Market PDA: ${market2Pdas.marketPda.toBase58()}`);

  const m2UserYes = await createAccount(provider.connection, payer, market2Pdas.yesMint, authority);
  const m2UserNo = await createAccount(provider.connection, payer, market2Pdas.noMint, authority);
  const m2Lp = PublicKey.findProgramAddressSync(
    [LP_SEED, market2Pdas.marketPda.toBuffer(), authority.toBuffer()],
    program.programId
  )[0];

  await program.methods
    .depositLiquidity(new anchor.BN(500_000_000))
    .accounts({
      signer: authority,
      market: market2Pdas.marketPda,
      collateralMint,
      vault: market2Pdas.vault,
      userCollateral: userUsdc,
      lpPosition: m2Lp,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .rpc();
  console.log("Deposited 500 USDC");

  console.log("\n=== Seed Complete ===");
  console.log(`Program: ${program.programId.toBase58()}`);
  console.log(`USDC Mint: ${collateralMint.toBase58()}`);
  console.log(`Market 1: ${market1Pdas.marketPda.toBase58()}`);
  console.log(`Market 2: ${market2Pdas.marketPda.toBase58()}`);
  console.log(`\nExplorer: https://explorer.solana.com/address/${program.programId.toBase58()}?cluster=devnet`);
}

main().catch(console.error);
