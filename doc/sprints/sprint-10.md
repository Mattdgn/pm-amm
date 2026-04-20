# Sprint 10 — Devnet deploy + seed

**Duree estimee** : 2h
**Output** : Programme deploye sur devnet avec markets de demo
**Dependances** : Sprint 9

## Taches

### Deploy
- [ ] Creer `scripts/deploy-devnet.ts` : build + deploy sur devnet avec keypair
- [ ] Verifier programme deploye et accessible

### Seed data
- [ ] Creer `scripts/seed-devnet.ts` :
  - Market 1 : "BTC > 100k by June" — 30 jours, L_0 calibre pour 1000 USDC
  - Market 2 : "ETH flips SOL TVL" — 7 jours, L_0 calibre pour 500 USDC
  - Deposit liquidity initiale sur chaque market
- [ ] Creer `scripts/simulate-life.ts` :
  - Simule 7 jours compresses : warps + trades aleatoires + accruals
  - Genere de l'historique pour le front
- [ ] Creer `scripts/airdrop.ts` : airdrop SOL devnet aux wallets de test

### Verification
- [ ] Markets seed visibles on-chain
- [ ] Accrual fonctionne sur les markets seed
- [ ] Programme ID documente dans `Anchor.toml` et README

## Definition of Done
- Programme deploye sur devnet
- 2 markets seed crees et fonctionnels
- Scripts reproductibles
