# Sprint Status — PM-AMM

## Completed

- [x] Sprint 1 — Setup repo (2026-04-20)
- [x] Sprint 2 — Module math `pm_math.rs` (2026-04-20)
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
- [x] Sprint 16 — Open Source Readiness (2026-04-23)

## In Progress

(aucun)

## Pending

(aucun)

## Metrics — Sprint 16
- Files changed: 52
- Lines: +1914 / -1094
- Tests: 0 added (197 total — all passing)
- Type errors: 0
- Lint errors: 0 (32 warnings — Anchor IDL typing, expected)
- Clippy: 0 warnings

## Retro — Sprint 16
### Smooth
- PDA centralization reduced 21+ inline derivations to 0 in components
- Named constants in pm_math.rs made the code significantly more readable
- i80f48ToNumber deduplication was clean
### Friction
- Anchor 1.0 `#[program]` macro triggers many clippy lints — needed crate-level allows
- `macro_rules!` inside `impl` blocks doesn't work for method generation in Rust — reverted to compact one-liners
- ESLint `no-explicit-any` can't be error-level because Anchor IDL typing requires `as any` at 23 call sites
### Watch for next sprint
- The 23 `as any` casts are all Anchor IDL limitations — revisit when Anchor improves TS type generation
- CI workflow for `anchor test` (integration tests) not included — needs local validator setup

**Total estime : 65h**
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
                                                                       │
                                                                       ▼
                                                                  Sprint 14
                                                                       │
                                                                       ▼
                                                                  Sprint 15
                                                                       │
                                                                       ▼
                                                                  Sprint 16
```
