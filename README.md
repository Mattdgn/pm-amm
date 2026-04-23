# pm-AMM — Paradigm Dynamic AMM for Prediction Markets on Solana

[![CI](https://github.com/mattdgn/pm-amm/actions/workflows/test.yml/badge.svg)](https://github.com/mattdgn/pm-amm/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF)](https://explorer.solana.com/address/8V872cTKfH1gC5zBvQhrQN2DXSmRNokPPjPsBE46MZNj?cluster=devnet)
[![Anchor](https://img.shields.io/badge/Anchor-1.0-blueviolet)](https://www.anchor-lang.com/)

**First production implementation of the Paradigm pm-AMM on Solana. 100% fidelity to the paper. Uniform LVR in price and time.**

> Based on [*pm-AMM: A Prediction Market AMM*](https://www.paradigm.xyz/2024/11/pm-amm) by Ciamac Moallemi & Dan Robinson (Paradigm, Nov 2024).

**Program ID**: `8V872cTKfH1gC5zBvQhrQN2DXSmRNokPPjPsBE46MZNj` ([Devnet Explorer](https://explorer.solana.com/address/8V872cTKfH1gC5zBvQhrQN2DXSmRNokPPjPsBE46MZNj?cluster=devnet))

---

## The Math

The **dynamic pm-AMM** invariant (paper section 8):

```
(y - x) * Phi((y - x) / L_eff) + L_eff * phi((y - x) / L_eff) - y = 0
```

Where `L_eff = L_0 * sqrt(T - t)` decreases over time, and `phi`/`Phi` are the standard normal PDF/CDF.

### Three properties proven by the paper, verified on-chain:

| Property | Formula | Our test result |
|---|---|---|
| **Uniform LVR** (price-independent) | `LVR_t = V_t / (2*(T-t))` | Std across 7 prices: **0.000%** |
| **Constant E[LVR]** (time-independent) | `E[LVR_t] = V_0 / (2T)` | Linearity ratio: **0.994** (500 MC runs) |
| **LP wealth at expiry** | `E[W_T] = W_0 / 2` | Measured: **0.518** (500 MC runs, 5% tolerance) |

---

## The dC_t Mechanism — Why This is Different

Traditional AMMs leave LPs fully exposed until they withdraw. The pm-AMM actively redistributes liquidity to LPs over time:

```
deposit 1000 USDC         claim YES+NO          redeem for USDC
       |                       |                       |
       v                       v                       v
  |---------|---------|---------|---------|---------| 
  t=0       t=1d      t=2d      t=3d      ...     T
            |         |         |
            v         v         v
       dC_t accrual: tokens released as L_eff decreases
```

As time passes, `L_eff = L_0 * sqrt(T-t)` shrinks. The reserves scale proportionally, releasing YES+NO tokens to LPs via per-share accumulators. LPs can:
1. **Claim** YES+NO tokens at any time
2. **Redeem** 1 YES + 1 NO = 1 USDC (pair redemption)
3. **Sell** on the pool via swap
4. **Hold** until resolution for the winning side

### Conservation verified:

At fixed price (no arbitrage), 100% of pool value returns to LPs. With random walks (Gaussian score dynamics), exactly 50% returns (the other 50% is LVR consumed by arbitrageurs). Both verified in our test suite.

---

## Architecture

```
pm-amm/
  anchor/                # Solana program (Anchor/Rust)
    programs/pm_amm/src/
      pm_math.rs         # Fixed-point math (phi, Phi, Phi_inv, reserves, swap)
      accrual.rs         # dC_t mechanism (compute, apply, accrue_first)
      lut.rs             # 2048-point lookup tables for on-chain perf
      state.rs           # Market, LpPosition structs
      errors.rs          # Error codes
      instructions/      # 10 instructions
    tests/               # 18 TS integration tests
    scripts/             # Deploy + seed scripts
  app/                   # Next.js frontend
  oracle/                # Python truth oracle (scipy reference)
  doc/                   # Paper reference, PRD, sprint definitions
```

### 10 Instructions

| Instruction | Who | Description |
|---|---|---|
| `initialize_market` | Anyone | Create market with YES/NO mints, USDC vault |
| `deposit_liquidity` | LP | Add USDC, get shares. Bootstraps L_0 on first deposit |
| `swap` | Trader | 6 directions: USDC/YES/NO combinations |
| `withdraw_liquidity` | LP | Burn shares, receive YES+NO proportional |
| `accrue` | Anyone | Permissionless dC_t accrual (keeper) |
| `claim_lp_residuals` | LP | Claim accrued YES+NO tokens |
| `redeem_pair` | Holder | Burn 1 YES + 1 NO = 1 USDC |
| `resolve_market` | Authority | Set winning side after expiration |
| `claim_winnings` | Holder | Burn winning tokens for 1 USDC each |
| `suggest_l_zero` | Anyone | View: compute optimal L_0 for a budget |

---

## Robustness Beyond the Gaussian Model

| Test | Setup | Result |
|---|---|---|
| **Jump** (deterministic) | P=0.5 -> P=0.87 in one swap | Invariant: **0.00e+00**, no overflow |
| **MC with jumps** | 200 runs, 20% jump probability | LVR -35.8% vs Gaussian (lower because jumps push prices to extremes where V is lower) |
| **100 random swaps** | Alternating directions, random sizes | Max invariant: **9e-13** |

---

## Composability

All accounts are deterministic PDAs:

```typescript
// Derive all addresses from market_id alone
const [market] = PublicKey.findProgramAddressSync(
  [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);
const [yesMint] = PublicKey.findProgramAddressSync(
  [Buffer.from("yes_mint"), market.toBuffer()], PROGRAM_ID
);
// ... same for no_mint, vault
```

`suggest_l_zero` is callable via CPI for auto-LP vaults:

```typescript
await program.methods
  .suggestLZero(budgetUsdc, sigmaBps)
  .accounts({ market })
  .rpc();
// Emits LZeroSuggestion event with suggested_l_zero, daily_lvr, warnings
```

---

## Test Suite

**197 tests total:**

| Category | Count | Coverage |
|---|---|---|
| Rust unit tests (pm_math, accrual, state) | 49 | All math functions, Q64.64 roundtrips, accrual properties |
| TS integration tests | 18 | Full lifecycle: init -> deposit -> swap -> claim -> resolve |
| Python property tests | 18 | Paradigm properties A/B/C, robustness D/E/F |
| Python oracle tests | 112 | Cross-validation against scipy |

---

## Known Limitations

- **Oracle**: admin-only resolution (no oracle integration)
- **Binary only**: YES/NO outcomes, no multi-outcome
- **0% fees**: no trading fees (pure LVR model)
- **Compute**: swap uses ~800k CU (LUT optimization, within 1.4M limit)

## Roadmap

- [ ] Oracle integration (Switchboard/Pyth for auto-resolution)
- [ ] Multi-outcome markets (categorical pm-AMM)
- [ ] Trading fees (LP incentive beyond dC_t)
- [ ] Delta hedging tools for sophisticated LPs

---

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Solana CLI](https://docs.solanalabs.com/cli/install) (v2+)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (v0.31+)
- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v9+)
- Python 3.10+ (for oracle tests only)

## Quick Start

```bash
# Install dependencies
pnpm install

# Build the program
pnpm run build

# Run Rust unit tests (49 tests)
cd anchor && cargo test --package pm_amm

# Run integration tests (18 tests, requires local validator)
pnpm run test

# Run Python oracle tests (130 tests)
cd oracle && python3 test_oracle.py && python3 test_properties.py

# Start the frontend
pnpm run dev

# Deploy to devnet
pnpm run deploy
```

## Environment Variables

Copy `.env.example` to `.env.local` in the `app/` directory:

```bash
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
KV_REST_API_URL=            # Upstash Redis (optional, for price history)
KV_REST_API_TOKEN=          # Upstash Redis (optional)
MINT_AUTHORITY_KEY=         # Base64-encoded keypair for mock USDC faucet
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create your feature branch (`git checkout -b feat/my-feature`)
3. Ensure `cargo test` and `pnpm tsc --noEmit` pass
4. Commit and push
5. Open a Pull Request

## License

[MIT](LICENSE)

---

Built for the [$PREDICT hackathon](https://justspark.fun/hackathons/$PREDICT) by [@matt](https://x.com/mattdgn).

Paper: [Paradigm pm-AMM](https://www.paradigm.xyz/2024/11/pm-amm) (Moallemi & Robinson, Nov 2024)
