import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "8V872cTKfH1gC5zBvQhrQN2DXSmRNokPPjPsBE46MZNj"
);

export const USDC_MINT = new PublicKey(
  "8m8VRDdvuxE4MQZBX8RqKMpuwqBYTQiME7n85Mw73j6A"
);

export const METAPLEX_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

export const CLUSTER =
  (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as "devnet" | "localnet") || "devnet";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (CLUSTER === "devnet"
    ? "https://api.devnet.solana.com"
    : "http://localhost:8899");

export function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=${CLUSTER}`;
}

export function solscanAccountUrl(address: string): string {
  return `https://solscan.io/account/${address}?cluster=${CLUSTER}`;
}
