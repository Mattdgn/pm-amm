# Sprint Status — PM-AMM

## Completed

- [x] Sprint 1 — Setup repo (2026-04-20)

## In Progress

(aucun)

## Pending
- [ ] Sprint 2 — Module math `pm_math.rs` (6h) ⚠️ CRITIQUE
- [ ] Sprint 3 — Scaffold Anchor (3h)
- [ ] Sprint 4 — Module `accrual.rs` (5h)
- [ ] Sprint 5 — Core instructions deposit/swap/withdraw (7h)
- [ ] Sprint 6 — LP residuals flow (3h)
- [ ] Sprint 7 — Resolve + claim winnings (2h)
- [ ] Sprint 8 — Instruction `suggest_l_zero` (2h)
- [ ] Sprint 9 — Tests complets proprietes + robustesse (7h)
- [ ] Sprint 10 — Devnet deploy + seed (2h)
- [ ] Sprint 11 — Front Next.js scaffold (4h)
- [ ] Sprint 12 — UI trade + LP + residuels (7h)
- [ ] Sprint 13 — Polish + README + demo (6h)

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

## Decisions
- Sprint 1: Monorepo split anchor/ + app/ pour lisibilite — CLAUDE.md mis a jour
- Sprint 1: Platform-tools v1.52 requis (v1.51 incompatible edition2024)
