# pm-AMM — Design Brief

## What is pm-AMM?

pm-AMM is a **prediction market AMM** (Automated Market Maker) on Solana. Users bet on binary outcomes (e.g., "Will BTC hit $200k by December?") by buying YES or NO tokens. The price of YES reflects the market's perceived probability of the event happening.

The AMM uses a dynamic liquidity curve from Paradigm's pm-AMM research paper. Liquidity naturally decreases as a market approaches expiry, making prices more sensitive near resolution. Unredeemed tokens are progressively redistributed to liquidity providers.

---

## Users

- **Traders**: Buy YES or NO tokens based on their conviction. Want clear prices, quick execution, and to know what their position is worth at any moment.
- **Liquidity Providers (LPs)**: Deposit USDC to bootstrap markets. Earn yield via token redistribution (dC_t mechanism). Want to track returns and claim rewards easily.
- **Market Creators**: Create new prediction markets with a question, duration, and initial liquidity.

---

## Pages & Flows

### 1. Home Page (`/`)
- Header: logo "pm-AMM", "+ Create Market" button, wallet connect
- Grid of market cards, each showing: question, YES price, pool value, time remaining, status badge (Active/Resolved)
- Click card → market detail page

### 2. Market Detail Page (`/market/[id]`)
- Back link, market title + status badge + Solscan link
- **Stats row** (4 cards): YES price (green), NO price (red), Pool Value, Expires
- **Projections**: Pool value decay over time with color-coded progress bars (blue→yellow→red)
- **Position Card**: USDC balance, YES/NO holdings, on-chain position value (simulated sell), redeem pairs button, claim winnings button (post-resolution)
- **Tabs** (Trade / LP):
  - **Trade**: Buy/Sell toggle, YES/NO toggle, amount input, on-chain quote preview (you pay, you receive, avg price, min output with 1% slippage), execute button
  - **LP**: Deposit USDC input, current shares display, withdraw all button
  - **Residuals Widget**: Claim accumulated YES+NO tokens from liquidity decay

### 3. Create Market Page (`/create`)
- Simple form: question (text), duration (days), initial liquidity (USDC)
- Creates market on-chain + deposits initial liquidity
- Redirects to the new market

### Notifications
- All actions produce toast notifications (bottom-right, dark theme)
- Success toasts include "View on Solscan" action button
- Error toasts show truncated error messages

---

## Key Data Displayed

| Data Point | Format | Example |
|------------|--------|---------|
| YES/NO Price | Percentage | 62.3% |
| Pool Value | USD | $99.92 |
| Token Balances | Formatted with 2 decimals | 1,234.56 |
| Time Remaining | Human-readable | 14d 8h |
| Position Value | USD (from on-chain simulation) | $45.23 USDC |
| Swap Quote | Token amount + avg price | 156.78 YES @ 0.6382 USDC |
| LP Shares | 2 decimals | 12.50 |

---

## Visual Identity (Current)

- **Theme**: Dark mode only
- **Fonts**: Geist Sans (body), Geist Mono (numbers/prices)
- **Colors**: Green = YES/positive, Red = NO/negative, Primary blue = interactive, Yellow = warning
- **Components**: shadcn/ui cards, badges, buttons, inputs, tabs
- **Layout**: Centered single-column, max-width constrained, responsive 2→4 column grids
- **Style**: Minimal, data-dense, monospace for financial data

---

## Design Goals

1. **Production-quality feel.** Clean, confident, trustworthy. This is a financial product — it needs to feel solid.
2. **Simplify the complexity.** The math is sophisticated; the UI should not be. A first-time user should understand what they're betting on, how much it costs, and what they'll get.
3. **Visual hierarchy.** The most important info (price, position value) should jump out. Secondary info (pool value, LP mechanics, projections) should be discoverable but not overwhelming.
4. **Mobile-ready.** The layout should work well on phone screens.

### Pages to Design
1. **Home** — Market list. Should feel like browsing opportunities, not a data table.
2. **Market Detail** — The main screen. Trading, position tracking, LP management all in one place. Needs to feel organized despite the density.
3. **Create Market** — Simple form. Should feel quick and easy.

### Specific Design Questions
- How to present the Buy/Sell + YES/NO dual toggle without it feeling confusing?
- How to show position value (from on-chain simulation) in a way that feels trustworthy and clear?
- How to make the projections (pool value decay) feel informative without being overwhelming?
- Where to put LP features (deposit, withdraw, residuals) relative to trading?
- How to handle the post-resolution state (market resolved, claim winnings) elegantly?

### Constraints
- Dark mode only
- Must work with shadcn/ui components (or compatible design tokens)
- Wallet connect button is a pre-built Solana component (limited customization)
- All financial values come from on-chain simulation (may have ~1s loading delay)
- Toasts for all transaction feedback (success/error + Solscan links)

---

## Inspiration / Comparable Products
- **Polymarket** — Clean prediction market UI, simple buy/sell, clear probability display
- **Uniswap** — Swap interface with quote preview, slippage settings
- **dYdX** — Trading interface with position tracking
- **Manifold Markets** — Lightweight prediction markets, community feel
- **Drift Protocol** — Solana perps, dark mode, data-dense but organized

---

## Technical Notes
- Stack: Next.js + Tailwind + shadcn/ui
- 3 pages, all client-rendered (App Router)
- Data refreshes every 5-10 seconds via React Query polling
- Swap quotes use on-chain transaction simulation (~1-2s latency)
- All amounts are in USDC (6 decimals, formatted to 2)
- YES/NO tokens are SPL tokens on Solana
