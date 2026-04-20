# PM-AMM — Paradigm Dynamic pm-AMM on Solana

## Projet
POC 100% fidele au paper Paradigm pm-AMM (Moallemi & Robinson, Nov 2024) pour hackathon $PREDICT.
Deadline : 26 avril 2026.

## Stack
- **On-chain** : Anchor (Rust, latest), `anchor-spl`, `fixed` (I80F48)
- **Frontend** : Next.js (App Router, latest) + TypeScript + Tailwind + shadcn/ui
- **Client Solana** : `@coral-xyz/anchor`, `@solana/web3.js`, `@solana/wallet-adapter-*`
- **Package manager** : pnpm uniquement
- **Versions** : toujours utiliser les dernieres versions stables, ne pas forcer de version specifique

## Commands
```bash
# Rust / Anchor
anchor build                          # Build programme
anchor test                           # Tests integration (localnet)
cargo test --package pm_amm           # Tests unitaires Rust
cargo test --package pm_amm pm_math   # Tests math uniquement

# Frontend
cd app && pnpm install                # Install deps
cd app && pnpm dev                    # Dev server
cd app && pnpm build                  # Build prod

# Deploy
anchor deploy --provider.cluster devnet
```

## Architecture
Voir `doc/prd.md` section 2 pour architecture complete.

Structure cible :
```
pm-amm/
  programs/pm_amm/src/
    instructions/    # 10 instructions Anchor
    pm_math.rs       # Fixed-point math (Phi, Phi_inv, reserves, swap)
    accrual.rs       # Mecanisme dC_t redistribution YES+NO
    state.rs         # Market, Position, LpPosition
    errors.rs
    lib.rs
  app/               # Next.js (latest)
  tests/             # Tests TS integration
  scripts/           # Deploy, seed, simulate
```

## Paper de reference
`doc/wp-para.md` — Paradigm pm-AMM (Moallemi & Robinson, Nov 2024)
Source de verite pour TOUTE la math. Toujours cross-check avant d'implementer.

## Invariants math critiques
- `(y-x)*Phi((y-x)/L_eff) + L_eff*phi((y-x)/L_eff) - y = 0` — invariant dynamic (paper eq. section 8)
- `L_eff = L_0 * sqrt(T-t)` — liquidite effective (paper section 8)
- `x*(P) = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) - Phi_inv(P) }` — eq. (5)
- `y*(P) = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) }` — eq. (6)
- `V(P) = L_eff * phi(Phi_inv(P))` — pool value (section 7)
- `E[LVR_t] = V_0 / (2T)` — constant (section 8)
- `E[W_T] = W_0 / 2` — wealth finale (section 8)
- Conservation : tout va aux LPs (tokens YES+NO) ou aux arbitrageurs (LVR)
- JAMAIS devier de la spec math du paper sans demander

## Sprints
13 sprints dans `doc/sprints/sprint-XX.md`. Suivi dans `SPRINT_STATUS.md`.

## Regles
- Formules EXACTES du paper Paradigm
- Si simplification : flag `// SIMPLIFIED: <raison>`
- Si ambiguite : choix simple + commentaire
- Compute budget 400k CU sur toutes les ix mutatives
- Oracle hors scope (resolve admin-only pour POC)
- Pas de `rm` — utiliser `trash`
- Strict TypeScript, max 70 lignes par fonction
