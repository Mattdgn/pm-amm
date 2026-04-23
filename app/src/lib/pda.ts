import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function deriveYesMint(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("yes_mint"), market.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function deriveNoMint(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("no_mint"), market.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function deriveVault(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function deriveLpPosition(market: PublicKey, user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lp"), market.toBuffer(), user.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function deriveMarketPda(marketId: number): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(marketId));
  return PublicKey.findProgramAddressSync([Buffer.from("market"), buf], PROGRAM_ID)[0];
}
