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

// ============================================================================
// LP Simulation — Paper section 7 & 8
// ============================================================================

/** Expected daily LVR = V(P) / (2 * T_remaining_days). Paper section 8. */
export function expectedDailyLvr(price: number, lEff: number, remainingSecs: number): number {
  if (remainingSecs <= 0) return 0;
  const v = poolValue(price, lEff);
  return v / (2 * remainingSecs / 86400);
}

/** Terminal wealth expectation: E[W_T] = W_0 / 2. Paper section 8. */
export function expectedTerminalWealth(deposited: number): number {
  return deposited / 2;
}

/**
 * Simulate LP deposit: compute shares received and resulting pool share.
 * Returns { newShares, poolSharePct, newLEff, newPoolValue }.
 */
export function simulateLpDeposit(
  amount: number,
  price: number,
  lEff: number,
  totalShares: number,
  remainingSecs: number,
  lZero: number,
): { newShares: number; poolSharePct: number; newPoolValue: number; estDailyYield: number } {
  if (totalShares <= 0 || lEff <= 0) {
    // First deposit: shares = amount, pool value = amount at P=0.5
    return {
      newShares: amount,
      poolSharePct: 100,
      newPoolValue: amount,
      estDailyYield: remainingSecs > 0 ? amount / (2 * remainingSecs / 86400) : 0,
    };
  }

  const currentValue = poolValue(price, lEff);
  if (currentValue <= 0) return { newShares: 0, poolSharePct: 0, newPoolValue: 0, estDailyYield: 0 };

  const newShares = amount * totalShares / currentValue;
  const newTotal = totalShares + newShares;
  const poolSharePct = (newShares / newTotal) * 100;

  // New L_eff after deposit
  const scale = newTotal / totalShares;
  const newLZero = lZero * scale;
  const newLEff = newLZero * Math.sqrt(Math.max(remainingSecs, 1));
  const newPoolValue = poolValue(price, newLEff);

  const estDailyYield = remainingSecs > 0
    ? (newPoolValue * poolSharePct / 100) / (2 * remainingSecs / 86400)
    : 0;

  return { newShares, poolSharePct, newPoolValue, estDailyYield };
}

/**
 * Compute current LP position P&L.
 * Includes pool share value + pending residuals (unclaimed dC_t) + claimed tokens in wallet.
 *
 * Pending residuals = (cumPerShare - checkpoint) * shares (still in the contract)
 * Claimed tokens = YES/NO already in the user's wallet
 */
export function lpPositionPnl(
  shares: number,
  totalShares: number,
  deposited: number,
  price: number,
  lEff: number,
  // Pending residuals from on-chain state
  cumYesPerShare: number = 0,
  cumNoPerShare: number = 0,
  yesCheckpoint: number = 0,
  noCheckpoint: number = 0,
  // Already claimed tokens in wallet
  walletYes: number = 0,
  walletNo: number = 0,
  // Current pool reserves (needed to project resolution payout)
  reserveYes: number = 0,
  reserveNo: number = 0,
): LpPnlResult {
  const empty: LpPnlResult = { currentValue: 0, pnl: 0, pnlPct: 0, poolSharePct: 0, poolValue: 0, residualsValue: 0, totalYes: 0, totalNo: 0, ifYesWins: 0, ifNoWins: 0 };
  if (totalShares <= 0 || shares <= 0) return empty;

  const frac = shares / totalShares;
  const poolSharePct = frac * 100;
  const totalPV = poolValue(price, lEff);
  const myPoolValue = totalPV * frac;

  // Pending (unclaimed) residuals from dC_t
  const pendingYes = Math.max(0, (cumYesPerShare - yesCheckpoint) * shares);
  const pendingNo = Math.max(0, (cumNoPerShare - noCheckpoint) * shares);

  // Total tokens the LP has now (pending + wallet)
  const tokensYes = pendingYes + walletYes;
  const tokensNo = pendingNo + walletNo;

  // At resolution: pool reserves also drain to LPs as residuals
  // LP's share of the current reserves will ALSO be distributed
  const futureYes = reserveYes * frac;
  const futureNo = reserveNo * frac;

  // Total YES/NO the LP will have at expiry (current + future from pool)
  const totalYes = tokensYes + futureYes;
  const totalNo = tokensNo + futureNo;

  // Current value using market price (includes pool value which will become residuals)
  const currentValue = myPoolValue + (tokensYes * price + tokensNo * (1 - price));
  const pnl = currentValue - deposited;
  const pnlPct = deposited > 0 ? (pnl / deposited) * 100 : 0;
  const residualsValue = tokensYes * price + tokensNo * (1 - price);

  // Resolution scenarios: all reserves distributed, each winning token = 1 USDC
  const ifYesWins = totalYes;  // all YES tokens worth 1 USDC each
  const ifNoWins = totalNo;    // all NO tokens worth 1 USDC each

  return { currentValue, pnl, pnlPct, poolSharePct, poolValue: myPoolValue, residualsValue, totalYes, totalNo, ifYesWins, ifNoWins };
}

export interface LpPnlResult {
  currentValue: number;
  pnl: number;
  pnlPct: number;
  poolSharePct: number;
  poolValue: number;
  residualsValue: number;
  totalYes: number;
  totalNo: number;
  ifYesWins: number;
  ifNoWins: number;
}

/** Phi_inv exported for LP simulations */
export { phiInv };

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
