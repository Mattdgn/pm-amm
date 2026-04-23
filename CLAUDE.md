# PM-AMM — Paradigm Dynamic pm-AMM on Solana

## Project

Production implementation of the Paradigm pm-AMM paper (Moallemi & Robinson, Nov 2024).
Built for the $PREDICT hackathon. Deadline: April 26, 2026.

## Devnet

- **Program ID**: `8V872cTKfH1gC5zBvQhrQN2DXSmRNokPPjPsBE46MZNj`
- **Explorer**: https://explorer.solana.com/address/8V872cTKfH1gC5zBvQhrQN2DXSmRNokPPjPsBE46MZNj?cluster=devnet
- **USDC mock mint**: `8m8VRDdvuxE4MQZBX8RqKMpuwqBYTQiME7n85Mw73j6A`

## Stack

- **On-chain**: Anchor (Rust), `anchor-spl`, `fixed` (I80F48)
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- **Solana client**: `@anchor-lang/core`, `@solana/web3.js`, `@solana/wallet-adapter-*`
- **Package manager**: pnpm only
- **Versions**: always use latest stable — do not pin specific versions

## Commands

```bash
# From root (aliases)
pnpm run build      # Build program + IDL
pnpm run test       # Integration tests (localnet)
pnpm run dev        # Frontend dev server
pnpm run deploy     # Deploy to devnet

# From anchor/ (direct)
cd anchor && anchor build --no-idl -- --tools-version v1.52
cd anchor && cargo test --package pm_amm
cd anchor && cargo test --package pm_amm pm_math
```

## Architecture

```
pm-amm/
  anchor/                # Anchor workspace
    programs/pm_amm/src/
      instructions/      # 10 Anchor instructions
      pm_math.rs         # Fixed-point math (phi, Phi, Phi_inv, reserves, swap)
      accrual.rs         # dC_t mechanism — LP residual redistribution
      state.rs           # Market, LpPosition accounts
      errors.rs          # Error codes
      lib.rs             # Program entrypoint
    tests/               # TypeScript integration tests
    scripts/             # Deploy + seed scripts
  app/                   # Next.js frontend
  oracle/                # Python reference oracle (scipy)
  doc/                   # Paper reference
```

## Reference Paper

`doc/wp-para.md` — Paradigm pm-AMM (Moallemi & Robinson, Nov 2024)
Source of truth for ALL math. Always cross-check before implementing.

## Critical Math Invariants

- `(y-x)*Phi((y-x)/L_eff) + L_eff*phi((y-x)/L_eff) - y = 0` — dynamic invariant (paper section 8)
- `L_eff = L_0 * sqrt(T-t)` — effective liquidity (paper section 8)
- `x*(P) = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) - Phi_inv(P) }` — eq. (5)
- `y*(P) = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) }` — eq. (6)
- `V(P) = L_eff * phi(Phi_inv(P))` — pool value (section 7)
- `E[LVR_t] = V_0 / (2T)` — constant expected LVR (section 8)
- `E[W_T] = W_0 / 2` — terminal wealth (section 8)
- Conservation: everything goes to LPs (YES+NO tokens) or arbitrageurs (LVR)
- NEVER deviate from the paper's math spec without explicit approval

## Current Sprint

Sprint 17 — Swap CU Optimization (`doc/sprints/sprint-17-cu-optimization.md`)

## Rules

- EXACT formulas from the Paradigm paper
- If simplified: flag with `// SIMPLIFIED: <reason>`
- If ambiguous: choose simple + add comment
- Compute budget 400k CU on all mutative instructions
- Oracle out of scope (admin-only resolution for POC)
- Never use `rm` — use `trash` instead
- Strict TypeScript, max 70 lines per function
