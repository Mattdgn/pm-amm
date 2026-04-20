# Sprint 1 — Setup repo

**Duree estimee** : 1h
**Output** : Monorepo init, build et dev fonctionnels

## Contexte

POC Anchor + Next.js pour pm-AMM Solana. Monorepo classique. On pose les fondations.

## Taches

- [ ] Initialiser le projet Anchor dans `anchor/` : `anchor init pm_amm --no-git`
- [ ] Creer la structure de fichiers dans `anchor/programs/pm_amm/src/` :
  - `instructions/` (dossier vide avec mod.rs)
  - `pm_math.rs` (module vide avec doc header)
  - `accrual.rs` (module vide avec doc header)
  - `state.rs` (module vide)
  - `errors.rs` (module vide)
  - `lib.rs` (declare modules)
- [ ] Configurer les deps Rust dans `anchor/Cargo.toml` :
  - `anchor-lang` (latest stable)
  - `anchor-spl` (latest stable)
  - `fixed` (latest stable, pour I80F48)
- [ ] Initialiser Next.js dans `app/` : `pnpx create-next-app@latest app --typescript --tailwind --app --src-dir --no-eslint`
- [ ] Installer deps TS dans `app/` :
  - `@coral-xyz/anchor`
  - `@solana/web3.js`
  - `@solana/wallet-adapter-base`
  - `@solana/wallet-adapter-react`
  - `@solana/wallet-adapter-react-ui`
  - `@solana/wallet-adapter-wallets`
- [ ] Creer `.env.example` a la racine avec `ANCHOR_PROVIDER_URL`, `ANCHOR_WALLET`
- [ ] Configurer `anchor/Anchor.toml` pour devnet + localnet (cluster, wallet, program ID placeholder)
- [ ] Creer `anchor/tests/` avec un fichier `pm_amm.ts` vide (boilerplate Anchor test)
- [ ] Creer `anchor/scripts/` (dossier vide)
- [ ] Verifier : `cd anchor && anchor build` passe sans erreur (ou `pnpm build` from root)
- [ ] Verifier : `cd app && pnpm dev` demarre sans erreur

## Definition of Done

- `cd anchor && anchor build` passe (ou `pnpm build` from root)
- `pnpm dev` demarre dans `app/`
- Structure de fichiers conforme au PRD section 2.1
