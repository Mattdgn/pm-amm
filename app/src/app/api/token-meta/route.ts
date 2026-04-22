import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC = "https://api.devnet.solana.com";
const TOKEN_METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const IMAGES: Record<string, string> = {
  YES: "https://raw.githubusercontent.com/Mattdgn/pm-amm/main/app/public/tokens/yes.png",
  NO: "https://raw.githubusercontent.com/Mattdgn/pm-amm/main/app/public/tokens/no.png",
};

/**
 * GET /api/token-meta?mint=<pubkey>
 * Returns Metaplex-compatible JSON with on-chain name + shared image.
 */
export async function GET(req: NextRequest) {
  const mintStr = req.nextUrl.searchParams.get("mint");
  if (!mintStr) return NextResponse.json({ error: "missing mint" }, { status: 400 });

  try {
    const mint = new PublicKey(mintStr);
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM.toBuffer(), mint.toBuffer()],
      TOKEN_METADATA_PROGRAM
    );

    const conn = new Connection(RPC);
    const info = await conn.getAccountInfo(metadataPda);
    if (!info) return NextResponse.json({ error: "no metadata" }, { status: 404 });

    // Parse Metaplex metadata account (simplified)
    const data = info.data;
    // Skip: 1 key + 32 update_authority + 32 mint + 4 name_len
    const nameLen = data.readUInt32LE(65);
    const name = data.subarray(69, 69 + nameLen).toString("utf8").replace(/\0/g, "").trim();

    const symbolOffset = 69 + nameLen;
    const symbolLen = data.readUInt32LE(symbolOffset);
    const symbol = data.subarray(symbolOffset + 4, symbolOffset + 4 + symbolLen).toString("utf8").replace(/\0/g, "").trim();

    const image = IMAGES[symbol] ?? IMAGES["YES"];

    return NextResponse.json(
      { name, symbol, image, description: `${symbol} outcome token — pm-AMM prediction market` },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch {
    return NextResponse.json({ error: "invalid mint" }, { status: 400 });
  }
}
