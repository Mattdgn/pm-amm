# Sprint 14 — Brand System & UI Refactor

## Objectif

Refactoring complet du frontend Next.js sur le design system pm/amm. Passer d'une app shadcn générique à un terminal de trading sobre et typé, pixel-perfect par rapport aux références `Brand System.html` et `Home.html`.

**Source de vérité** : `doc/design_handoff_pmamm_brand/`

---

## Phase 1 — Design Tokens & Fondations

### 1.1 Tokens CSS

Créer `app/src/styles/tokens.css` — porter les custom properties depuis `shared/tokens.css` :

```
--bg, --surface, --surface-2, --line, --line-2, --muted, --text-dim, --text, --text-hi
--yes, --yes-soft, --no, --no-soft, --accent
--font-sans, --font-mono
--r-sm (2px), --r-md (4px), --r-lg (6px), --r-xl (10px)
--row (44px)
```

**Règle** : OKLCH en primaire, hex fallback en commentaire. Jamais de couleur en dur dans les composants.

### 1.2 Tailwind Config

Mapper les tokens dans `tailwind.config.ts` `theme.extend` :
- `colors` : bg, surface, surface-2, line, line-2, muted, text-dim, text, text-hi, yes, yes-soft, no, no-soft, accent
- `fontFamily` : sans → Inter Tight, mono → JetBrains Mono
- `borderRadius` : sm/md/lg/xl sur les valeurs du brand
- `spacing` : respecter la grille 4/8/12/16/24/32/48

### 1.3 Typography

- Remplacer Geist par **Inter Tight** (400, 500) + **JetBrains Mono** (400, 500)
- `font-feature-settings: "tnum", "cv11"` sur body
- Créer les classes utilitaires : `.text-display`, `.text-title`, `.text-body`, `.text-caption`, `.text-figure`, `.text-data`
- `font-variant-numeric: tabular-nums` sur toute colonne de chiffres

### 1.4 Reset globals.css

Supprimer tout le theming shadcn existant (HSL variables). Remplacer par les tokens du brand. Body : `bg: var(--bg)`, `color: var(--text)`, scrollbar styling, `::selection`.

**Fichiers** : `globals.css`, `tailwind.config.ts`, `layout.tsx`

---

## Phase 2 — Composants Primitifs

Recréer les primitifs dans `app/src/components/ui/` — chaque composant est autonome, utilise les tokens, zéro valeur en dur.

### 2.1 Wordmark (`wordmark.tsx`)

Port React du `shared/logo.js`. Props : `size` (default 16), `tone` ("light" | "dark"). Bracket `[p]` mono + `pm/amm` sans.

### 2.2 Button (`button.tsx`)

5 variants exactes du brand :
- `primary` — bg text-hi, color bg. Hover: bg text. **Un seul primary par vue** (wallet connect).
- `secondary` — transparent, border line-2, color text. Hover: border muted.
- `ghost` — transparent, no border, color text-dim. Hover: text-hi.
- `yes` — bg yes-soft, color yes, border yes/25%.
- `no` — bg no-soft, color no, border no/25%.

Taille : `padding 8px 14px`, `font-size 13px`, `font-weight 500`, `border-radius 6px`, `gap 6px`. Transition 120ms.

### 2.3 Badge (`badge.tsx`)

Mono, uppercase, tracked. `padding 2px 8px`, `font-size 10px`, `letter-spacing 0.05em`, `border-radius 2px`, `border 1px solid line-2`.
Variants : default, yes, no. Optional dot (4×4 circle currentColor).

### 2.4 Input Amount (`amount-input.tsx`)

Row avec `<input>` + unit suffix (ex: "USDC"). Border `line-2`, radius `6px`, padding `0 12px`. Focus: border `muted`. Input mono 16px text-hi, unit mono 12px muted. Label au-dessus en caption mono.

### 2.5 Probability Bar (`probability-bar.tsx`)

2px height. Left = `--yes`, right = `--no` (opacity 0.7). Props : `yesPercent`. Accompagné des % au-dessus (mono, yes/no colors).

### 2.6 Figure (`figure.tsx`)

Grand nombre mono tnum. Props : `label` (caption au-dessus, 10px muted uppercase), `value`, `color` (yes/no/text-hi). Tailles : price (28px), hero (32px), data (13px).

### 2.7 Meta Row (`meta-row.tsx`)

Key-value row. `justify-between`, `padding 7px 0`, `border-bottom 1px solid line`. Label muted 12px sans, value mono 12px text. Dernier row sans border.

### 2.8 Sparkline (`sparkline.tsx`)

SVG inline. Props : `points: number[]`, `color`, `width`, `height`. Stroke 1px, no fill, midline à 50% en line-2 dashed. Dot sur le dernier point.

### 2.9 Status Badge (`status-badge.tsx`)

Micro badge pour la table : 9px, uppercase, letter-spacing 0.1em, radius 2px.
Variants : active (yes color), expiring/warn (accent), resolved-yes, resolved-no.

**Fichiers** : `app/src/components/ui/*`

---

## Phase 3 — Layout Shell

### 3.1 Status Bar (`status-bar.tsx`)

Barre sticky top. Grid 3 colonnes : brand (wordmark) | stats center | right meta (live dot + wallet).
Stats : NET, SLOT (si dispo), TVL, 24H VOL, MKTS, LP APY. Mono 11px muted.
Le wallet connect Solana est stylé en secondaire (border line-2, radius 2px) sauf le bouton "Connect" qui est primary.

### 3.2 Shell Layout

Grid 3 colonnes `220px 1fr 300px` :
- `≤ 1200px` : masquer le panel droit
- `≤ 860px` : masquer la sidebar, table full-width

### 3.3 Sidebar (`sidebar.tsx`)

Sections : View (All markets, My positions, My liquidity, Watchlist), Status (Active, Expiring, Resolved), Category, Sort. Chaque item : `padding 7px 20px`, hover surface, active = border-left 2px accent + surface bg. Mono 12px.

**Fichiers** : `app/src/components/layout/status-bar.tsx`, `sidebar.tsx`, `app/src/app/layout.tsx`

---

## Phase 4 — Home Page (Market Table)

### 4.1 Toolbar

Tabs (ALL / ACTIVE / EXPIRING / RESOLVED) avec compteurs. Searchbar avec icône + placeholder + kbd shortcut. Boutons FILTER + NEW MARKET.

### 4.2 Market Table

Grille sticky header. Colonnes : ID · Market · YES · NO · Δ24h · Sparkline 30d · TVL · 24h Vol · State.
- Rows 44px, border-bottom line, hover surface.
- Row sélectionnée : bg surface, border-left 2px accent.
- Markets résolus : opacity 0.55, hover opacity 1.
- YES en `--yes`, NO en `--no`, delta up/down coloré.
- Market name en sans 13px text-hi avec category badge.

### 4.3 Detail Panel (Right)

Panel pour le market sélectionné :
- Header : "SELECTED" + market ID
- Question en sans 17px text-hi
- Prix YES/NO dans des boxes bordées (yes-soft / no-soft bg)
- Sparkline chart 30d avec midline 50%
- Meta rows : TVL, 24h volume, LPs, Expires
- Boutons BUY YES / BUY NO
- Recent activity (tick list) — si on-chain data dispo

**Fichiers** : `app/src/app/page.tsx`, `app/src/components/market-table.tsx`, `app/src/components/market-detail-panel.tsx`

---

## Phase 5 — Market Page Refactor

### 5.1 Adapter `/market/[id]/page.tsx`

Appliquer les mêmes composants brand :
- Stats avec Figure components (YES/NO prices en yes/no colors)
- Probability bar sous les prix
- Meta rows pour pool value, expires, etc.
- Trade panel avec les vrais boutons yes/no du brand
- Position card avec figure + meta rows
- LP panel et residuals widget restylés

### 5.2 Trade Panel

- Remplacer les toggles par les boutons brand `btn-yes` / `btn-no`
- Input amount avec le composant `amount-input`
- Quote en meta rows
- Bouton d'exécution en variant yes ou no selon le side

### 5.3 Create Market Page

Restyler avec les composants brand. Input amounts, bouton secondary pour créer.

---

## Phase 6 — Cleanup & Polish

### 6.1 Supprimer l'ancien

- Supprimer les composants shadcn ui qui ne sont plus utilisés
- Supprimer les anciennes font imports (Geist)
- Supprimer les HSL variables inutilisées dans globals.css
- Vérifier qu'aucune couleur n'est en dur (grep `#`, `rgb`, `hsl` dans les composants)

### 6.2 Responsive

- Tester les 3 breakpoints (full, ≤1200, ≤860)
- S'assurer que le trade flow fonctionne sur mobile

### 6.3 Motion

- Toutes les transitions : `120ms ease`, rien d'autre
- Hover states sur tous les éléments interactifs
- Live dot animation (blink 1.4s) sur le status bar
- Flash cell background yes-soft/no-soft pendant 120ms sur changement de prix

---

## Règles Strictes

1. **Zéro gradient, zéro glow, zéro ornement.** Tout est rectangle et border.
2. **Deux font families max.** Inter Tight + JetBrains Mono.
3. **Couleurs uniquement via tokens.** Jamais de hex/rgb en dur dans les composants.
4. **`--yes` et `--no` réservés aux outcomes.** Jamais pour du chrome ou de la déco.
5. **Un seul `.btn-primary` par vue.** Le wallet connect.
6. **Rows 44px.** Tables et listes.
7. **Spacing grille 4pt.** 4/8/12/16/24/32/48 uniquement.
8. **Radius minimal.** La plupart des surfaces sont sharp (0). Rounding = exception.
9. **Motion 120ms.** Rien d'élastique, pas de spring physics.
10. **`tabular-nums` sur toute colonne de chiffres.** Non négociable.

---

## Deliverables

- [ ] Tokens CSS + Tailwind config mappés 1:1 avec le brand
- [ ] 9 composants primitifs (wordmark, button, badge, amount-input, probability-bar, figure, meta-row, sparkline, status-badge)
- [ ] Layout shell 3 colonnes responsive
- [ ] Home page terminal (table + sidebar + detail panel)
- [ ] Market detail page restylée
- [ ] Trade panel avec boutons brand
- [ ] Create market page restylée
- [ ] Zéro couleur en dur, zéro ancien shadcn résiduel
- [ ] Build propre, TypeScript strict, 0 warning
