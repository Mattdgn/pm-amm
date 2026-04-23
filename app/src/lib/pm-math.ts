/**
 * Client-side pm-AMM math (float64, for display only).
 * Port of oracle/pm_amm_math.py — NOT for on-chain use.
 */

/** Convert an Anchor-deserialized Q64.64 value (BN or bigint) to a JS number. */
export function i80f48ToNumber(raw: { toString(): string } | bigint): number {
  const bn = typeof raw === "bigint" ? raw : BigInt(raw.toString());
  return Number(bn) / 2 ** 48;
}

/** Standard normal PDF */
export function phi(z: number): number {
  return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
}

/** Standard normal CDF (Abramowitz & Stegun approximation) */
export function capitalPhi(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

/** Price from reserves: P = Phi((y - x) / L_eff) */
export function priceFromReserves(x: number, y: number, lEff: number): number {
  return capitalPhi((y - x) / lEff);
}

/** Pool value: V(P) = L_eff * phi(Phi_inv(P)) */
export function poolValue(price: number, lEff: number): number {
  // Approximate Phi_inv for display
  const u = phiInv(price);
  return lEff * phi(u);
}

/** Approximate Phi_inv (Beasley-Springer-Moro) */
function phiInv(p: number): number {
  if (p <= 0.0001) return -3.7;
  if (p >= 0.9999) return 3.7;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];

  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    ((((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1));
}

/** Format USDC amount (6 decimals) */
export function formatUsdc(lamports: number | bigint): string {
  const val = Number(lamports) / 1e6;
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format price as percentage */
export function formatPrice(price: number): string {
  return `${(price * 100).toFixed(1)}%`;
}

/** Estimate swap output (client-side, for preview) */
export function estimateSwapOutput(
  reserveYes: number,
  reserveNo: number,
  lEff: number,
  amountIn: number,
  side: "yes" | "no"
): { output: number; priceAfter: number; priceImpact: number } {
  if (lEff <= 0 || amountIn <= 0) {
    return { output: 0, priceAfter: 0.5, priceImpact: 0 };
  }

  const priceBefore = priceFromReserves(reserveYes, reserveNo, lEff);

  // USDC->YES: y_new = y + amountIn, find x_new via binary search on u
  // USDC->NO:  x_new = x + amountIn, find y_new via binary search on u
  if (side === "yes") {
    const yNew = reserveNo + amountIn;
    const xNew = findXFromY(yNew, lEff);
    const output = amountIn + (reserveYes - xNew);
    const priceAfter = priceFromReserves(xNew, yNew, lEff);
    return {
      output: Math.max(0, output),
      priceAfter,
      priceImpact: Math.abs(priceAfter - priceBefore) / priceBefore,
    };
  } else {
    const xNew = reserveYes + amountIn;
    const yNew = findYFromX(xNew, lEff);
    const output = amountIn + (reserveNo - yNew);
    const priceAfter = priceFromReserves(xNew, yNew, lEff);
    return {
      output: Math.max(0, output),
      priceAfter,
      priceImpact: Math.abs(priceAfter - priceBefore) / priceBefore,
    };
  }
}

function findXFromY(yTarget: number, lEff: number): number {
  let lo = -6, hi = 6;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const yMid = lEff * (mid * capitalPhi(mid) + phi(mid));
    if (yMid < yTarget) lo = mid; else hi = mid;
  }
  const u = (lo + hi) / 2;
  return lEff * (u * capitalPhi(u) + phi(u) - u);
}

function findYFromX(xTarget: number, lEff: number): number {
  let lo = -6, hi = 6;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const xMid = lEff * (mid * capitalPhi(mid) + phi(mid) - mid);
    if (xMid > xTarget) lo = mid; else hi = mid;
  }
  const u = (lo + hi) / 2;
  return lEff * (u * capitalPhi(u) + phi(u));
}

/** Format time remaining */
export function formatTimeRemaining(endTs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTs - now;
  if (remaining <= 0) return "Expired";
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((remaining % 3600) / 60);
  return `${hours}h ${mins}m`;
}
