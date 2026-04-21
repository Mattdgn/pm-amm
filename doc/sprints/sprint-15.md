# Sprint 15 — V1 Shippable : Admin, Metadata, Charts, Polish

**Duree estimee** : 14h
**Output** : Prediction market fonctionnel et presentable — noms on-chain, tokens identifies, admin resolution, historique prix, polish v1
**Dependances** : Sprint 14
**Deadline** : 26 avril 2026

## Contexte

On a un protocole 100% fidele au paper et un front brand-clean, mais il manque les briques essentielles pour qu'un utilisateur externe comprenne et utilise le produit :
- Les markets n'ont pas de nom on-chain (affichage "Market #N")
- Les tokens YES/NO sont des mints anonymes (pas de nom, pas d'image dans les wallets)
- Pas de page admin pour resoudre les markets
- Les sparklines sont fake (seed deterministe)
- Pas de polish v1 (favicon, OG, mobile, skeletons)

Ce sprint transforme le POC en v1 shippable.

---

## Part A — On-chain : Market name + Token metadata

### A1. Ajouter `name` au Market account

**Fichiers** : `anchor/programs/pm_amm/src/state.rs`

- Ajouter `pub name: [u8; 64]` au struct Market (apres `bump`)
- Mettre a jour `Market::LEN` : ajouter `+ 64`
- Helper `pub fn name_str(&self) -> &str` qui trim les trailing zeros

> Note : casse les markets existants sur devnet — on redeploy from scratch (POC).

### A2. Passer le nom dans `initialize_market`

**Fichiers** : `anchor/programs/pm_amm/src/instructions/initialize_market.rs`

- Ajouter param `name: String` au handler
- Validation : `name.len() <= 64`, non-vide
- Copier dans `market.name` avec zero-padding

### A3. Metaplex Token Metadata pour YES/NO mints

**Fichiers** :
- `anchor/programs/pm_amm/Cargo.toml` — ajouter `mpl-token-metadata`
- `anchor/programs/pm_amm/src/instructions/initialize_market.rs` — CPI create_metadata_accounts_v3

Pour chaque mint (YES et NO) :
- **Name** : `"YES — {market_name}"` / `"NO — {market_name}"` (tronque a 32 chars)
- **Symbol** : `"YES"` / `"NO"`
- **URI** : pointer vers JSON metadata heberge (voir A4)
- Le Market PDA est mint_authority, donc il signe le CPI via seeds

Accounts supplementaires dans `InitializeMarket` :
- `yes_metadata: UncheckedAccount` (PDA Metaplex)
- `no_metadata: UncheckedAccount` (PDA Metaplex)
- `token_metadata_program: Program`

### A4. Images token generiques

Creer 2 fichiers JSON Metaplex standard :

```json
// yes-token.json
{
  "name": "pm-AMM YES Token",
  "symbol": "YES",
  "description": "YES outcome token — pm-AMM prediction market",
  "image": "<url>/yes.png"
}
```

```json
// no-token.json
{
  "name": "pm-AMM NO Token",
  "symbol": "NO",
  "description": "NO outcome token — pm-AMM prediction market",
  "image": "<url>/no.png"
}
```

- Images : 2 PNG 512x512 minimalistes, brand-aligned (fond `--bg`, texte `--yes`/`--no`)
- Heberger sur Arweave (permanent) ou IPFS via nft.storage (gratuit)
- Alternative POC rapide : raw GitHub URL dans le repo (`app/public/meta/`)

### A5. Build + test + redeploy

```bash
cd anchor && anchor build --no-idl -- --tools-version v1.52
cd anchor && cargo test --package pm_amm
cd anchor && anchor deploy --provider.wallet ~/.config/solana/phantom.json
```

- Mettre a jour l'IDL dans `app/`
- Re-seed les 2 markets de test avec des noms

---

## Part B — Price History (Upstash Redis)

### B1. Setup Upstash Redis

- Creer un projet Upstash (free tier : 10k commands/jour — largement suffisant)
- Installer `@upstash/redis` dans `app/`
- Creer `app/src/lib/redis.ts` : client singleton

```ts
import { Redis } from "@upstash/redis";
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

- `.env.local` : `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### B2. API Route — enregistrer un snapshot prix

**Fichier** : `app/src/app/api/price-snap/route.ts`

- `POST /api/price-snap` : `{ marketId: string, price: number, timestamp: number }`
- Stockage : `ZADD market:{marketId}:prices {timestamp} {JSON.stringify({t, p})}`
- Rate limit basique : ignorer si dernier snap < 10s (ZSCORE check)
- Reponse : `{ ok: true }`

### B3. API Route — lire l'historique

**Fichier** : `app/src/app/api/price-history/[market]/route.ts`

- `GET /api/price-history/{marketId}?from=&to=&limit=100`
- Lecture : `ZRANGEBYSCORE market:{marketId}:prices from to LIMIT 0 100`
- Reponse : `{ points: [{t: number, p: number}] }`

### B4. Hook frontend — enregistrer les prix

**Fichier** : `app/src/hooks/use-price-recorder.ts`

- Hook passif qui tourne sur la home page
- A chaque poll `useMarkets()`, pour chaque market dont le prix a change :
  - `fetch("/api/price-snap", { method: "POST", body: ... })`
- Debounce 30s par market (ref Map)

### B5. Sparklines reelles

**Fichier** : `app/src/components/market-table.tsx`, `app/src/components/ui/sparkline.tsx`

- Hook `usePriceHistory(marketId)` : `GET /api/price-history/{marketId}?limit=50`
- Remplacer `marketSparkline()` (seed deterministe) par les vrais points
- Fallback : si < 3 points, garder le seed deterministe oriente vers le prix actuel (comportement actuel)

---

## Part C — Admin Resolution (`/admin`)

### C1. Page `/admin`

**Fichier** : `app/src/app/admin/page.tsx`

Layout : StatusBar + contenu centre (max-w-2xl)

- Titre : `"ADMIN — RESOLVE MARKETS"`
- Guard : si pas de wallet connecte → "Connect wallet"
- Liste tous les markets ou `authority === wallet.publicKey`
- Si aucun market → "No markets owned by this wallet"

### C2. Composant `AdminMarketRow`

**Fichier** : `app/src/components/admin-market-row.tsx`

Pour chaque market :
- Nom (de l'account on-chain, ou `Market #{id}` fallback)
- Prix YES actuel
- Status badge : `ACTIVE` / `EXPIRED` / `RESOLVED`
- Si EXPIRED + non resolved :
  - 2 boutons : `RESOLVE YES` (variant yes) / `RESOLVE NO` (variant no)
  - Confirmation dialog (double-click ou modal simple)
  - Appel `resolve_market(Side::Yes)` ou `resolve_market(Side::No)`
  - Toast sonner avec lien Solscan
- Si RESOLVED : affiche le gagnant, pas d'action
- Si ACTIVE : affiche countdown, pas d'action

### C3. Lien admin dans le StatusBar

- Ajouter un lien discret `[ADMIN]` dans le StatusBar (visible uniquement si wallet connecte)
- Style : `text-muted`, hover `text-text-hi`

---

## Part D — Frontend : Afficher les metadatas

### D1. Nom du market partout

**Fichiers** :
- `app/src/hooks/use-markets.ts` — decoder `market.name` (trim trailing zeros, UTF-8)
- `app/src/components/market-table.tsx` — colonne "Market" affiche le vrai nom
- `app/src/app/market/[id]/page.tsx` — titre = nom
- `app/src/components/market-detail-panel.tsx` — nom dans le header

### D2. Nom du market dans create

**Fichier** : `app/src/app/create/page.tsx`

- Le champ "QUESTION" existe deja (`name` state)
- Passer `name` comme argument a `initializeMarket(marketId, endTs, name)`
- Validation frontend : 1-64 chars

### D3. Tokens identifies dans les wallets

Grace au Metaplex metadata (Part A3), les tokens apparaitront automatiquement dans :
- Phantom, Backpack, Solflare (lisent le metadata)
- Solscan (affiche nom + image)

Aucun changement frontend necessaire — c'est le standard SPL.

---

## Part E — V1 Polish

### E1. Favicon + OG Meta

**Fichiers** :
- `app/public/favicon.ico` — icone [p] 32x32 brand
- `app/public/og.png` — 1200x630, fond `--bg`, wordmark centre
- `app/src/app/layout.tsx` — metadata Next.js :
  ```ts
  export const metadata = {
    title: "pm-AMM — Prediction Markets on Solana",
    description: "Paradigm pm-AMM: the first production prediction market AMM with uniform LVR and continuous LP yield.",
    openGraph: { images: ["/og.png"] },
    icons: { icon: "/favicon.ico" },
  };
  ```

### E2. Loading skeletons

**Fichier** : `app/src/components/ui/skeleton.tsx`

- Composant `Skeleton` : `div` avec `animate-pulse`, bg `surface`, border `line`
- Utiliser dans :
  - `market-table.tsx` : 5 lignes skeleton pendant le chargement
  - `market/[id]/page.tsx` : skeleton pour prix + meta + trade panel
  - `portfolio-panel.tsx` : skeleton pour positions

### E3. Mobile responsive (minimum viable)

**Fichiers** : `app/src/app/page.tsx`, `globals.css`

- Home page : sous 860px, passer en layout single-column (sidebar cachee, table full-width)
- Market detail : sous 768px, stack trade/LP panels verticalement (deja `grid-cols-1 md:grid-cols-2`)
- StatusBar : sous 640px, cacher les stats intermediaires, garder wordmark + wallet
- Table : scroll horizontal si necessaire

### E4. Market share link

**Fichier** : `app/src/app/market/[id]/page.tsx`

- Bouton "Copy link" a cote du badge status
- `navigator.clipboard.writeText(window.location.href)`
- Toast "Link copied"

### E5. Error boundary

**Fichier** : `app/src/app/error.tsx`

- Error boundary Next.js au niveau app
- Affiche : "Something went wrong" + bouton "Try again" (brand style)
- Log l'erreur en console

### E6. Empty states

- Home page sans markets : "No markets yet — create one" + lien `/create`
- Portfolio sans positions : "No positions yet — explore markets" (deja partiellement fait)

### E7. Market countdown live

**Fichier** : `app/src/components/ui/countdown.tsx`

- Composant `Countdown` : affiche `Xd Xh Xm` ou `EXPIRED` si passe
- Update chaque minute (setInterval)
- Utilise dans market detail et market table (colonne Expires)

---

## Ordre d'execution recommande

```
Jour 1 (4h) : A1-A5 — On-chain changes + redeploy
Jour 2 (4h) : C1-C3 + D1-D2 — Admin + affichage noms
Jour 3 (4h) : B1-B5 — Redis + price history + sparklines reelles
Jour 4 (2h) : E1-E7 — Polish, OG, mobile, skeletons
```

---

## Decisions techniques

| Sujet | Choix | Raison |
|-------|-------|--------|
| Market name storage | `[u8; 64]` on-chain | Simple, pas de PDA supplementaire, suffisant pour questions courtes |
| Token metadata | Metaplex Token Metadata v3 | Standard Solana, reconnu par tous les wallets/explorers |
| Token images | PNG heberges (Arweave ou `app/public/`) | Arweave pour permanence, public/ pour POC rapide |
| Price history | Upstash Redis (sorted sets) | Serverless, free tier genereux, latence <10ms, zero infra |
| Price recording | Frontend passive hook (poll + POST) | Simple, pas de backend additionnel, suffit pour POC |
| Admin auth | `market.authority === wallet` on-chain | Deja dans le programme, pas de role system additionnel |

## Risques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Metaplex CPI ajoute du CU | Moyen | Deja 1.4M CU budget sur initialize_market, Metaplex CPI ~100k |
| Redeploy casse markets existants | Faible | Devnet POC, on re-seed |
| Upstash free tier (10k cmds/j) | Faible | Largement suffisant pour POC, upgrade $10/mo si besoin |
| Images token pas encore hebergees | Faible | Fallback : raw GitHub URL, migration Arweave avant mainnet |

## Definition of Done

- [ ] `initialize_market` accepte un nom, visible dans les wallets et l'interface
- [ ] Tokens YES/NO ont un nom + image dans Phantom/Solflare
- [ ] Page `/admin` permet de resoudre les markets expires (authority only)
- [ ] Sparklines affichent des prix reels (Redis) avec fallback seed
- [ ] Favicon + OG meta en place
- [ ] Skeletons sur les chargements
- [ ] Layout responsive minimum sur mobile
- [ ] Zero TypeScript errors, zero console.log, build clean
