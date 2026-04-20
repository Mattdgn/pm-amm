# PM-AMM — Paradigm Dynamic pm-AMM on Solana

## Projet

POC 100% fidele au paper Paradigm pm-AMM (Moallemi & Robinson, Nov 2024) pour hackathon $PREDICT.
Deadline : 26 avril 2026.

## Devnet
- **Program ID** : `GQGSTV9dig5fEwcfMpgqHjo9jAhxtnusMEbx8SrBBYnQ`
- **Explorer** : https://explorer.solana.com/address/GQGSTV9dig5fEwcfMpgqHjo9jAhxtnusMEbx8SrBBYnQ?cluster=devnet
- **USDC mock mint** : `8m8VRDdvuxE4MQZBX8RqKMpuwqBYTQiME7n85Mw73j6A`
- **Market 1** (BTC >100k, 30d) : `BmoJiajqA2QQxPSv36cJqUJEZrCx4xq9CE4vP6WVT6us`
- **Market 2** (ETH flips SOL, 7d) : `HQy7moaYjtP7WEb5t74nvRo6ArRVueMeNU6XsCq3Dj5t`

## Stack

- **On-chain** : Anchor (Rust, latest), `anchor-spl`, `fixed` (I80F48)
- **Frontend** : Next.js (App Router, latest) + TypeScript + Tailwind + shadcn/ui
- **Client Solana** : `@coral-xyz/anchor`, `@solana/web3.js`, `@solana/wallet-adapter-*`
- **Package manager** : pnpm uniquement
- **Versions** : toujours utiliser les dernieres versions stables, ne pas forcer de version specifique

## Commands

```bash
# Depuis la racine (aliases)
pnpm run build      # Build programme + IDL
pnpm run test       # Tests integration (localnet)

  # Tests unitaires Rust
pnpm run dev        # Frontend dev server
pnpm run deploy     # Deploy devnet

# Depuis anchor/ (direct)
cd anchor && anchor build --no-idl -- --tools-version v1.52
cd anchor && cargo test --package pm_amm
cd anchor && cargo test --package pm_amm pm_math
```

## Architecture

Voir `doc/prd.md` section 2 pour architecture complete.

```
pm-amm/
  anchor/                # Workspace Anchor
    programs/pm_amm/src/
      instructions/      # 10 instructions Anchor
      pm_math.rs         # Fixed-point math (Phi, Phi_inv, reserves, swap)
      accrual.rs         # Mecanisme dC_t redistribution YES+NO
      state.rs           # Market, Position, LpPosition
      errors.rs
      lib.rs
    tests/               # Tests TS integration
    scripts/             # Deploy, seed, simulate
  app/                   # Next.js frontend
  doc/                   # PRD, sprints, paper
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
