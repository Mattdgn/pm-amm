/**
 * Update Metaplex metadata for the USDC mock mint.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   pnpm exec ts-node --transpile-only -P ./tsconfig.json scripts/update-usdc-metadata.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction, Transaction } from "@solana/web3.js";

const USDC_MINT = new PublicKey("8m8VRDdvuxE4MQZBX8RqKMpuwqBYTQiME7n85Mw73j6A");
const TOKEN_METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const URI = "https://raw.githubusercontent.com/Mattdgn/pm-amm/main/app/public/tokens/usdc-mock.json";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = (provider.wallet as any).payer;

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM.toBuffer(), USDC_MINT.toBuffer()],
    TOKEN_METADATA_PROGRAM
  );

  // UpdateMetadataAccountV2 discriminator = 15
  const nameBytes = Buffer.from("mUSDC pmAMM");
  const symbolBytes = Buffer.from("mUSDC");
  const uriBytes = Buffer.from(URI);

  const data = Buffer.alloc(
    1 + // discriminator
    1 + // data option (Some)
    4 + nameBytes.length +
    4 + symbolBytes.length +
    4 + uriBytes.length +
    2 + // seller_fee_basis_points
    1 + // creators option (None)
    1 + // collection option (None)
    1 + // uses option (None)
    1 + // new_update_authority option (None)
    1 + // primary_sale_happened option (None)
    1   // is_mutable option (None)
  );

  let offset = 0;
  data.writeUInt8(15, offset); offset += 1; // UpdateMetadataAccountV2
  data.writeUInt8(1, offset); offset += 1; // data: Some
  // DataV2
  data.writeUInt32LE(nameBytes.length, offset); offset += 4;
  nameBytes.copy(data, offset); offset += nameBytes.length;
  data.writeUInt32LE(symbolBytes.length, offset); offset += 4;
  symbolBytes.copy(data, offset); offset += symbolBytes.length;
  data.writeUInt32LE(uriBytes.length, offset); offset += 4;
  uriBytes.copy(data, offset); offset += uriBytes.length;
  data.writeUInt16LE(0, offset); offset += 2; // seller_fee_basis_points
  data.writeUInt8(0, offset); offset += 1; // creators: None
  data.writeUInt8(0, offset); offset += 1; // collection: None
  data.writeUInt8(0, offset); offset += 1; // uses: None
  data.writeUInt8(0, offset); offset += 1; // new_update_authority: None
  data.writeUInt8(0, offset); offset += 1; // primary_sale_happened: None
  data.writeUInt8(0, offset); offset += 1; // is_mutable: None

  const ix = new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM,
    keys: [
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // update authority
    ],
    data: data.subarray(0, offset),
  });

  const tx = new Transaction().add(ix);
  const sig = await provider.sendAndConfirm(tx);
  console.log("Done! Signature:", sig);
  console.log("Updated name: mUSDC pmAMM");
}

main().catch(console.error);
