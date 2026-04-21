# Sprint Status — PM-AMM

## Completed

- [x] Sprint 1 — Setup repo (2026-04-20)
- [x] Sprint 2 — Module math `pm_math.rs` (2026-04-20) ⚠️ CRITIQUE
- [x] Sprint 3 — Scaffold Anchor (2026-04-20)
- [x] Sprint 4 — Module `accrual.rs` (2026-04-20)
- [x] Sprint 5 — Core instructions deposit/swap/withdraw (2026-04-20)
- [x] Sprint 6 — LP residuals flow (2026-04-20)
- [x] Sprint 7 — Resolve + claim winnings (2026-04-20)
- [x] Sprint 8 — Instruction `suggest_l_zero` (2026-04-20)
- [x] Sprint 9 — Tests complets proprietes + robustesse (2026-04-20)
- [x] Sprint 10 — Devnet deploy + seed (2026-04-20)
- [x] Sprint 11 — Front Next.js scaffold (2026-04-20)
- [x] Sprint 12 — UI trade + LP + residuels (2026-04-20)
- [x] Sprint 13 — Polish + README + demo (2026-04-20)
- [x] Sprint 14 — Brand System & UI Refactor (2026-04-20)

- [x] Sprint 15 — V1 Shippable : Admin, Metadata, Charts, Polish (2026-04-22)

## In Progress

(aucun)

## Pending

(none)

**Total estime : 55h**
**Deadline : 26 avril 2026**

## Dependances

```
Sprint 1 ─┬─→ Sprint 2 ──┬─→ Sprint 4 ──→ Sprint 5 ──→ Sprint 6 ──→ Sprint 7
           │              │                                                │
           └─→ Sprint 3 ──┤                                                ▼
                          └─→ Sprint 8                              Sprint 9
                                                                       │
                                                                       ▼
                                                                  Sprint 10
                                                                       │
                                                                       ▼
                                                                  Sprint 11
                                                                       │
                                                                       ▼
                                                                  Sprint 12
                                                                       │
                                                                       ▼
                                                                  Sprint 13
```

## Metrics — Sprint 1
- Files changed: 27
- Lines: +9592 / -96
- Tests: 1 boilerplate
- Type errors: 0
- Lint warnings: 0 (Anchor macro warnings only)

## Retro — Sprint 1
### Smooth
- Anchor init + Next.js setup rapide
### Friction
- Platform-tools v1.51 (rustc 1.84) incompatible avec edition2024 — contourne avec v1.52
- blake3/fixed crates pinnes pour compatibilite
### Watch
- Toujours passer `--tools-version v1.52` ou utiliser `pnpm build` depuis la racine

## Metrics — Sprint 2
- Files changed: 2
- Lines: +727 / -4
- Tests: 16 unit tests (pm_math)
- Type errors: 0
- Lint warnings: 0 (framework-only)

## Retro — Sprint 2
### Smooth
- Python oracle first = caught swap model bugs before Rust
- Acklam + Newton refinement gives good Phi_inv accuracy
### Friction
- Acklam Horner order was reversed (c6 first instead of c1 first)
- Swap model needed rethinking: mint-pairs mechanism for USDC swaps
### Watch
- Phi_inv accuracy ~1e-3 at tails (p<0.02), sufficient for on-chain but monitor
- exp_fixed limited to [-20, 20] — OK for normal distribution use

## Metrics — Sprint 14
- Files changed: 22
- Lines: ~1800 new/modified
- New components: 9 primitives + 3 layout + 2 market (table, detail panel)
- Deleted: 5 old shadcn components (header, market-card, card, tabs, input)
- Type errors: 0
- Build warnings: 0
- Hardcoded colors: 0

## Retro — Sprint 14
### Smooth
- Tailwind v4 @theme inline maps cleanly to CSS custom properties
- next/font/google worked for Inter Tight + JetBrains Mono (zero CLS)
- Brand tokens mapped 1:1 — no interpretation needed
### Friction
- Old shadcn variants (outline, default) clashed with new brand variants — required full rewrite of button/badge
- Tailwind color-mix syntax needed bracket escaping (color-mix(in_oklch,...))
### Watch
- Wallet adapter button styling is inline — limited to style prop, no className
- Sparkline data is currently deterministic seed — needs real on-chain price history later
- Sidebar filters (My positions, Watchlist) are stubs — need user token data

## Metrics — Sprint 15
- Files changed: 31
- Lines: +1351 / -659
- New files: 11 (admin page, API routes, hooks, components, sprint doc)
- New routes: /admin, /api/price-snap, /api/price-history
- Tests: 49 Rust pass (0 new, all existing pass)
- Type errors: 0
- Console.log: 0

## Retro — Sprint 15
### Smooth
- Metaplex CPI via invoke_signed worked cleanly with Market PDA as signer
- IDL rebuild picked up name field + metadata accounts correctly
- Upstash Redis client is trivially simple to integrate
### Friction
- `anchor idl build` broke after `cargo clean` — had to extract IDL from test output manually
- Lifetime annotations on handler required `Context<'_, '_, 'info, 'info, ...>` pattern for CPI
### Watch
- Program must be redeployed to devnet (Market struct changed, existing markets invalidated)
- Metaplex metadata program ID hardcoded in create page — could be extracted to constants
- Redis is optional — sparklines fall back to deterministic seed without env vars

## Decisions
- Sprint 15: Market name stored as [u8; 64] directly in Market account (not separate PDA)
- Sprint 15: Metaplex Token Metadata v3 via mpl-token-metadata v5 crate
- Sprint 15: Upstash Redis for price history (graceful fallback if not configured)
- Sprint 15: IDL extracted via cargo test output (anchor idl build flaky)
- Sprint 14: Replaced Geist fonts with Inter Tight + JetBrains Mono per brand system
- Sprint 14: Removed shadcn card/tabs/input — replaced with brand-native components
- Sprint 14: Home page changed from card grid to trading terminal (table + sidebar + detail panel)
- Sprint 1: Monorepo split anchor/ + app/ pour lisibilite — CLAUDE.md mis a jour
- Sprint 1: Platform-tools v1.52 requis (v1.51 incompatible edition2024)
- Sprint 2: Python oracle (oracle/) created as ground truth before Rust transposition
- Sprint 2: Swap model uses mint-pairs for USDC swaps, key identity for reverse
