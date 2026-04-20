# Handoff — pm/amm Brand System

## About these files

Everything in `design_references/` is a **design reference built in HTML**: a
prototype that shows the intended look, feel and component specs. It is **not
production code to copy verbatim**. Your job is to recreate these designs in
the target codebase's environment (React + Tailwind, shadcn/ui, SwiftUI, etc.)
using its existing primitives and conventions — or, if the project is
greenfield, pick the most appropriate stack and implement the system there.

Bundled files:

- `design_references/Brand System.html` — the canonical brand sheet. Open this
  first. It documents every token and primitive.
- `design_references/Home.html` — a reference screen (Markets surveillance /
  trading terminal) that applies the system end-to-end. Use it to see tokens
  in context.
- `design_references/shared/tokens.css` — raw CSS custom properties. Port
  these values into your design token layer (Tailwind theme, CSS variables,
  Swift color assets — whatever your project uses).
- `design_references/shared/logo.js` — wordmark component in React. Re-author
  in whatever framework the target uses; the shape is simple.

## Fidelity

**High-fidelity.** Colors, typography, spacing, radii and component states are
final. Recreate pixel-for-pixel. Do not substitute tokens or introduce new
ones.

---

## Design intent

pm/amm is a prediction-market AMM on Solana. The brand is deliberately
restrained — a neutral, warm-charcoal surface that puts numbers and markets
first. **No gradients, no glow, no ornament.** Everything is a rectangle and a
border. Two type families, never three. Motion is used sparingly (120ms
linear).

If you are tempted to add a shadow, a gradient, a rounded card, a decorative
icon, or a second accent color — don't. The restraint *is* the brand.

---

## Design tokens

All tokens live in `shared/tokens.css` as CSS custom properties. Port these
values exactly. OKLCH is used for the neutrals so the warm undertone stays
consistent across the ramp; hex fallbacks are listed for environments that
don't support OKLCH yet.

### Color — neutral ramp (warm charcoal, chroma ≤ 0.008)

| Token         | OKLCH                | Hex fallback | Use                                |
|---------------|----------------------|--------------|------------------------------------|
| `--bg`        | `oklch(0.145 0.004 60)` | `#1f1d1a` | Page background                    |
| `--surface`   | `oklch(0.175 0.005 60)` | `#272420` | Cards / panels                     |
| `--surface-2` | `oklch(0.205 0.005 60)` | `#2f2b27` | Hover, raised rows                 |
| `--line`      | `oklch(0.245 0.005 60)` | `#373330` | Default 1px border                 |
| `--line-2`    | `oklch(0.305 0.005 60)` | `#47423d` | Strong border / input outline      |
| `--muted`     | `oklch(0.55 0.006 60)`  | `#8a847c` | Captions, labels, secondary text   |
| `--text-dim`  | `oklch(0.70 0.006 60)`  | `#b5afa6` | Body text secondary                |
| `--text`      | `oklch(0.92 0.008 70)`  | `#e8e2d7` | Body text                          |
| `--text-hi`   | `oklch(0.98 0.006 80)`  | `#f5efe3` | Headings, primary button fill      |

### Color — semantic (outcomes)

| Token        | OKLCH                     | Use                                   |
|--------------|---------------------------|---------------------------------------|
| `--yes`      | `oklch(0.70 0.09 150)`    | YES outcome, positive deltas (sage)   |
| `--yes-soft` | `oklch(0.70 0.09 150 / 0.12)` | YES button fill / row tint        |
| `--no`       | `oklch(0.66 0.11 30)`     | NO outcome, negative deltas (clay)    |
| `--no-soft`  | `oklch(0.66 0.11 30 / 0.12)`  | NO button fill / row tint         |
| `--accent`   | `oklch(0.78 0.08 75)`     | System voice only (amber). Use rarely. |

**Rule:** `--yes` and `--no` are reserved for outcome-bearing data. Never use
them for chrome, buttons unrelated to YES/NO, or decoration.

### Typography

Two families. Load from Google Fonts:

- **Inter Tight** — 400, 500 (600 for Brand page display only). Used for
  everything readable.
- **JetBrains Mono** — 400, 500. Used for numbers, timestamps, addresses,
  captions (uppercased, tracked).

Feature settings on `body`: `font-feature-settings: "tnum", "cv11";` —
required so figures line up in tables.

| Role    | Family          | Size | Line | Tracking | Weight | Color       |
|---------|-----------------|------|------|----------|--------|-------------|
| Display | Inter Tight     | 44   | 1.05 | -0.03em  | 400    | `--text-hi` |
| Title   | Inter Tight     | 22   | 1.27 | -0.02em  | 400    | `--text-hi` |
| Body    | Inter Tight     | 14   | 1.55 | -0.005em | 400    | `--text`    |
| Caption | JetBrains Mono  | 11   | 1.4  | +0.05em  | 400 UPPER | `--muted` |
| Figure  | JetBrains Mono  | 32   | 1    | -0.02em  | 400 tnum | `--text-hi` |
| Data    | JetBrains Mono  | 13   | 1.4  | 0        | 400 tnum | `--text`   |

Apply `font-variant-numeric: tabular-nums` (helper class `.tnum`) to every
column of figures. Non-negotiable.

### Radius

| Token   | px | Use                     |
|---------|----|-------------------------|
| `--r-sm`| 2  | Chips, probability ticks |
| `--r-md`| 4  | Badges                  |
| (6)     | 6  | Buttons, inputs         |
| `--r-lg`| 10 | Cards, panels (rarely)  |

Most surfaces are **sharp (0 radius)** — lists, tables, logo cells, swatches.
Rounding is the exception, not the default.

### Spacing

4-point scale: **4 / 8 / 12 / 16 / 24 / 32 / 48**. Do not invent half-steps.

| Step | px | Use          |
|------|----|--------------|
| 1    | 4  | Inline gap   |
| 2    | 8  | Stack, icon  |
| 3    | 12 | Control      |
| 4    | 16 | Card padding |
| 6    | 24 | Section      |
| 8    | 32 | Block        |
| 12   | 48 | Page gutter  |

### Motion

- Default: `transition: all 120ms ease;` — linear or standard ease, nothing
  elastic.
- Reserved for: hover state on interactive elements, focus ring. No entrance
  animations, no spring physics, no parallax.

---

## Components

Each primitive is shown in `Brand System.html` under section 05. Ports should
match structure, states and classnames 1:1 where possible.

### Button

Three intents + two outcome variants:

- **primary** — `bg: --text-hi`, `color: --bg`. Hover: `bg: --text`. Single
  primary per view (wallet connect).
- **secondary** — transparent, `border: --line-2`, `color: --text`. Hover
  border: `--muted`.
- **ghost** — transparent, no border, `color: --text-dim`. Hover: `--text-hi`.
- **yes** — `bg: --yes-soft`, `color: --yes`, `border: color-mix(--yes 25%,
  transparent)`. Reserved for buying YES.
- **no** — same mirror for NO.

Size: `padding: 8px 14px; font-size: 13px; font-weight: 500; border-radius:
6px; gap: 6px;`. No icon-only large buttons.

### Badge

Mono, uppercased, tracked. `padding: 2px 8px; font-size: 10px;
letter-spacing: 0.05em; border-radius: 2px; border: 1px solid --line-2;`.
Variants: default, `.badge-yes`, `.badge-no`. Optional `.badge-dot` (4×4
filled circle in `currentColor`).

### Input (amount)

Row wrapping `<input>` + unit suffix (e.g. `USDC`). `border: 1px solid
--line-2; border-radius: 6px; padding: 0 12px;`. Focus state: border becomes
`--muted`. Input is mono 16px `--text-hi`, unit is mono 12px `--muted`. No
labels inside the frame — labels sit above as a mono caption.

### Probability bar

2px-tall horizontal bar. Left portion `--yes`, right portion `--no` at 70%
opacity. Always accompanied by paired percentages above (`YES 62.3%` in
`--yes`, `NO 37.7%` in `--no`, mono).

### Figure

Large mono tabular-nums number. Label (mono 10px `--muted` uppercased) sits
above. YES/NO figure pairs use `--yes` / `--no` respectively; standalone
figures (TVL, volume) use `--text-hi`.

### Meta row

Key–value list for market metadata (TVL, volume, expiry, liquidity
providers). Row is `display: flex; justify-content: space-between; padding:
8px 0; border-bottom: 1px solid --line;` — last row has no border.
Label: `--muted` 12px sans. Value: mono tabular-nums 12px `--text`.

### Wordmark

A bracketed lowercase `p` (square, 1px border, radius 2, mono) sitting beside
`pm` + dim `/` + `amm` in sans 500, tracking −0.02em. No animated curve, no
live probability — the mark stays still so the data can move. See
`shared/logo.js` for proportions; `size` prop scales both the bracket and the
text together.

### Tables & lists

Rows are **44px tall** (`--row`). Borders are 1px, `--line`. Header row is
mono uppercased 10px `--muted`. Alignment: left for text, right for numbers.
Zebra striping: none. Hover state: `background: --surface-2`.

---

## Screens

### Brand System (`Brand System.html`)

Static documentation page. 1120px centered page. Numbered sections (`01 /
Mark`, `02 / Color`, …) with a 180px gutter for section numbers + body in the
right column. Use this layout if you build an in-app design docs section.

### Home — Markets (`Home.html`)

Full trading terminal. Three-column shell:

- **Left sidebar (180px)** — filters (View, Status, Category, Sort). No
  headers larger than 11px mono uppercased.
- **Center table** — market list. Columns: ID · Market · YES price · NO price
  · Δ24h · 30-day probability sparkline · TVL · 24h Vol · Expires · State
  badge. Sticky header. Resolved markets rendered at ~50% opacity.
- **Right detail (320px)** — selected market: question, live YES/NO figures,
  sparkline with midline, meta rows, Buy YES / Buy NO buttons, recent
  activity log (mono monospace, right-aligned prices).
- **Top status bar** — environment (MAINNET), slot, TVL, 24h vol, market
  count, LP APY, UTC clock, wallet stub. Mono throughout.

Responsive:
- `≤ 1200px` — hide right detail panel, hide extra status-bar stats.
- `≤ 860px` — hide left sidebar; center table is full width.

---

## State & behavior

These prototypes are static except for the Brand page wordmark. When you
implement:

- **Selected market** — persist selection in URL (`?mkt=MKT-001`). Right
  panel reflects selection.
- **Filtering** — View / Status / Category are single-select; Sort is
  single-select. All filter state in URL params.
- **Price ticks** — update at most once per second. Flash cell background
  `--yes-soft` / `--no-soft` for 120ms on change, then fade back.
- **Wallet** — stub shows truncated address (`7F3k…bA2q`) + SOL balance.
  Connect button is the only `.btn-primary` in the app.
- **Sparkline** — 30-day probability line. Stroke `currentColor`, 1px, no
  fill, no dots. Color inherits from YES/NO state of the selected outcome.

---

## Assets

No raster assets. Wordmark is rendered in code (see `shared/logo.js`). Icons,
if added later, should be 1px stroke, rounded joins, 16/20/24 at most —
match Lucide's "minimal" set if you need a library.

Fonts load from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

Self-host in production.

---

## Questions for the implementer

- **Target framework?** If React + Tailwind, map tokens to the Tailwind
  `theme.extend.colors` block and expose the OKLCH values via CSS variables
  so dark/light theming stays clean later.
- **Component library?** shadcn/ui primitives port cleanly — Button, Badge,
  Input, Separator all match the spec above with minor class swaps.
- **Charts?** The sparkline and probability bar are trivial SVG; no chart
  library needed. If a heavier chart is added later, style axes/gridlines
  with `--line` and `--muted` only.

Ping the designer before adding any new token, any new color, or any
component that isn't in section 05 of the brand page.
