# Sprint 11 — Front Next.js scaffold

**Duree estimee** : 4h
**Output** : App Next.js avec wallet, hooks, layout de base
**Dependances** : Sprint 10

## Contexte

Scaffolding du frontend Next.js (latest) App Router. Wallet connect, hooks Anchor, types IDL, layout.

## Taches

### Providers et config

- [ ] Creer `app/src/providers/` : WalletProvider (Phantom, Solflare), AnchorProvider, QueryProvider
- [ ] Configurer cluster switching (devnet/localnet) via env var `NEXT_PUBLIC_SOLANA_CLUSTER`
- [ ] Importer et typer l'IDL genere par Anchor

### Hooks Anchor

- [ ] `useProgram()` — retourne le programme Anchor type
- [ ] `useMarkets()` — fetch tous les markets (avec polling 10s)
- [ ] `useMarket(marketId)` — fetch un market specifique
- [ ] `usePosition(marketId)` — position de l'user connecte
- [ ] `useLpPosition(marketId)` — LP position de l'user
- [ ] `useLpResiduals(marketId)` — calcule pending YES+NO en JS (pas de call on-chain, calcul local depuis market state + lp checkpoint)

### Utils

- [ ] `formatters.ts` : format USDC (6 decimals), format prix (2 decimals), format tokens
- [ ] `pmMath.ts` : port JS de `priceFromReserves(x, y, lEff)` pour affichage temps reel (pas besoin de precision I80F48, float64 suffit)
- [ ] `constants.ts` : program ID, cluster URLs

### Layout et navigation

- [ ] Layout principal avec header (logo, wallet connect, cluster badge)
- [ ] Page `/` : liste des markets avec prix YES, temps restant, pool value
- [ ] Page `/market/[id]` : placeholder pour trade/LP panels (sprint 12)
- [ ] Composant `MarketCard` : nom, prix, temps restant, badge resolved/active

### Style

- [ ] Setup shadcn/ui : `pnpx shadcn-ui@latest init`
- [ ] Installer composants de base : Button, Card, Input, Badge, Tabs

## Definition of Done

- Wallet connect fonctionnel (Phantom, solflare, jup wallet)
- Liste des markets affichee avec prix en temps reel
- Navigation vers page market individuel
- Hooks retournent les donnees correctement
