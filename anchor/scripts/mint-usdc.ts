/**
 * Mint mock USDC to a wallet on devnet.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-node --transpile-only -P ./tsconfig.json scripts/mint-usdc.ts [wallet] [amount]
 *
 * Args:
 *   wallet  - recipient pubkey (default: your wallet)
 *   amount  - USDC amount (default: 1000)
 *
 * Note: only works if your wallet is the mint authority for the mock USDC.
 */

import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  mintTo,
  getAccount,
} from "@solana/spl-token";

const USDC_MINT = new PublicKey("8m8VRDdvuxE4MQZBX8RqKMpuwqBYTQiME7n85Mw73j6A");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = (provider.wallet as any).payer;

  const recipient = process.argv[2]
    ? new PublicKey(process.argv[2])
    : provider.wallet.publicKey;
  const amount = process.argv[3] ? parseFloat(process.argv[3]) : 1000;
  const lamports = Math.floor(amount * 1e6);

  console.log(`Minting ${amount} USDC to ${recipient.toBase58()}`);

  // Get or create ATA
  const ata = await getAssociatedTokenAddress(USDC_MINT, recipient);
  try {
    await getAccount(provider.connection, ata);
  } catch {
    console.log("Creating ATA...");
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      recipient,
      USDC_MINT
    );
    const tx = new anchor.web3.Transaction().add(ix);
    await provider.sendAndConfirm(tx);
  }

  // Mint
  await mintTo(
    provider.connection,
    payer,
    USDC_MINT,
    ata,
    payer, // mint authority
    lamports
  );

  const acc = await getAccount(provider.connection, ata);
  console.log(`Done. Balance: ${Number(acc.amount) / 1e6} USDC`);
  console.log(`ATA: ${ata.toBase58()}`);
}

main().catch(console.error);
