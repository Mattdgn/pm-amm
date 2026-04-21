import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  if (!redis) {
    return NextResponse.json({ points: [] });
  }

  const marketId = req.nextUrl.searchParams.get("market");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);

  if (!marketId) {
    return NextResponse.json({ points: [] }, { status: 400 });
  }

  const key = `market:${marketId}:prices`;
  const raw = await redis.zrange(key, -limit, -1);

  const points = raw.map((entry) => {
    if (typeof entry === "string") return JSON.parse(entry);
    return entry;
  });

  return NextResponse.json({ points });
}
