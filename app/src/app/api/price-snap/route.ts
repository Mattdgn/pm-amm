import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function POST(req: Request) {
  if (!redis) {
    return NextResponse.json({ ok: false, error: "Redis not configured" }, { status: 503 });
  }

  const body = await req.json();
  const { marketId, price, timestamp } = body as {
    marketId: string;
    price: number;
    timestamp: number;
  };

  if (!marketId || typeof price !== "number" || typeof timestamp !== "number") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const key = `market:${marketId}:prices`;

  // Rate limit: skip if last snap < 10s ago
  const latest = await redis.zrange(key, -1, -1, { withScores: true });
  if (latest.length >= 2) {
    const lastTs = Number(latest[1]);
    if (timestamp - lastTs < 10) {
      return NextResponse.json({ ok: true, skipped: true });
    }
  }

  await redis.zadd(key, { score: timestamp, member: JSON.stringify({ t: timestamp, p: price }) });

  // Keep max 500 entries per market
  const count = await redis.zcard(key);
  if (count > 500) {
    await redis.zremrangebyrank(key, 0, count - 501);
  }

  return NextResponse.json({ ok: true });
}
