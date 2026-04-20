# PRD v3 — PM-AMM Solana POC (100% Paradigm Fidelity)

**Projet** : Implémentation 100% fidèle du pm-AMM Paradigm sur Solana
**Target** : Submission hackathon $PREDICT avant le 26 avril 2026
**Format** : PRD orienté exécution Claude Code, découpé en sprints
**Refs** : [Paradigm pm-AMM paper](https://www.paradigm.xyz/2024/11/pm-amm) (Moallemi & Robinson, Nov 2024) · [Spark $PREDICT brief](https://justspark.fun/hackathons/$PREDICT)
**Version** : 3.0 — Full fidelity, zéro compromis non-documenté

---

## 0. Changements vs v2

Le v3 corrige les derniers 5% de compromis identifiés dans l'audit de fidélité :

| Aspect                          | v2                      | v3                                                                                              |
| ------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| Surplus asymétrique à l'accrual | Burn → perte invisible  | **Redistribué en tokens YES+NO aux LPs** (lecture stricte du paper : "LPs hold mixed position") |
| Calibration `L_0` pour LPs      | Absent                  | **Instruction on-chain `suggest_l_zero`** composable                                            |
| Tests robustesse hors-modèle    | Non                     | **Déterministe + Monte Carlo**                                                                  |
| Vaults                          | vault + withdrawn_vault | vault + residual_vault_accumulator (les LPs claim direct depuis reserves)                       |
| Conservation math               | ~98% (burn)             | **100%**                                                                                        |

---

## 1. Contexte exécutif

### 1.1 Le problème

Solana manque d'une base layer prediction markets production-grade. Les AMMs classiques (CPMM, LMSR) sont mal adaptés aux outcome tokens : invariant mal aligné avec la dynamique des prix (qui converge vers $0 ou $1 à la résolution), LVR qui explose près de l'expiration.

### 1.2 La solution — pm-AMM dynamique de Paradigm

Le **dynamic pm-AMM** (Moallemi & Robinson, nov. 2024) est la première AMM dérivée from first principles pour les prediction markets sous Gaussian score dynamics. Propriétés théoriques uniques :

1. **Uniform AMM** : `LVR_t = (1/2(T-t)) · V_t` — proportionnel à la pool value, **indépendant du prix**
2. **LVR constant en expectation dans le temps** : `E[LVR_t] = V_0/(2T)` constant sur `[0, T]`
3. **Redistribution active aux LPs** : le protocole retire des tokens du pool (`dC_t` du paper) pour maintenir la propriété (2). **À la résolution, `E[W_T] = W_0/2`** — la moitié distribuée avant, la moitié consommée par LVR
4. **Conservation parfaite** : aucune valeur détruite, tout va soit aux LPs (via dC_t et resolution claims), soit aux arbitrageurs (LVR)

### 1.3 Les invariants exacts

**Notation** :

- `L_0` = paramètre de liquidité constant, stocké on-chain
- `L_eff = L_0·√(T-t)` = liquidité effective au temps t
- `x`, `y` = réserves YES et NO du pool
- `P` = prix du YES en USDC (price of 1 YES = P USDC, price of 1 NO = 1-P)

**Invariant dynamic pm-AMM** (équation section 8 du paper) :

```
(y - x)·Φ((y-x)/L_eff) + L_eff·φ((y-x)/L_eff) - y = 0
```

**Formules explicites des réserves** (équations 5 & 6 du paper, dynamic version) :

```
x*(P) = L_eff · {Φ⁻¹(P)·P + φ(Φ⁻¹(P)) - Φ⁻¹(P)}
y*(P) = L_eff · {Φ⁻¹(P)·P + φ(Φ⁻¹(P))}
```

**Pool value** :

```
V(P, t) = L_eff · φ(Φ⁻¹(P)) = L_0·√(T-t) · φ(Φ⁻¹(P))
```

**Identité clé** :

```
y - x = L_eff · Φ⁻¹(P)
```

### 1.4 Le mécanisme dC_t — interprétation stricte du paper

**Ce que le paper dit** (section 8, Dynamic pm-AMM) :

> _"We imagine now a dynamic, time-varying variation of the static pm-AMM design where the AMM LPs withdraw liquidity over time to mitigate their losses."_

> _"Denote by C_t the cumulative dollar value of liquidity withdrawn. Then, since the pool value is linear in the liquidity L_t, the dollar value of a change in L_t is proportional to V_t/L_t."_

**Interprétation stricte** : les LPs reçoivent de la **liquidité**, pas du cash. La liquidité dans un pm-AMM = un mix de tokens YES + NO proportionnel aux réserves.

**Implémentation v3** : quand `L_eff` décroît de `L_old` à `L_new`, on :

1. Calcule les nouvelles réserves `(x_new, y_new)` au prix constant
2. Les tokens libérés sont `delta_x = x_old - x_new` YES et `delta_y = y_old - y_new` NO
3. **Ces tokens sont crédités au pro-rata des LPs** dans leurs `LpPosition` (via deux accumulateurs per-share : `cum_yes_per_share` et `cum_no_per_share`)
4. Les LPs claim ces tokens quand ils veulent via `claim_lp_residuals`
5. Les tokens claimed sont mintables par le market (qui garde l'autorité sur les mints YES/NO)
6. Les LPs peuvent ensuite :
   - Les redeem contre USDC en s'appariant (1 YES + 1 NO = 1 USDC anytime via `redeem_pair`)
   - Les vendre sur le pool (via un swap)
   - Les garder jusqu'à la résolution pour claim 1 USDC par token du side gagnant

**Propriétés garanties** :

- **Conservation parfaite** : pas de burn non-compensé, pas de perte invisible
- **Fidélité au paper** : les LPs reçoivent exactement ce que la math prévoit (valeur = `ΔL · φ(Φ⁻¹(P))` en USDC équivalent)
- **Composabilité** : les tokens reçus sont normaux, tradables, utilisables dans d'autres protocoles

### 1.5 Contraintes

- **Timeline** : 48-72h effectives
- **Équipe** : solo
- **Stack** : Anchor 0.30 + Next.js 14 + TypeScript
- **Compute budget** : 400k CU autorisé sur toutes les ix mutative (via `ComputeBudgetInstruction`)
- **Oracle** : hors scope, resolve admin-only pour POC

### 1.6 Definition of Done global

- [ ] Programme Anchor déployé sur devnet
- [ ] Invariant dynamic pm-AMM implémenté avec formules exactes Paradigm
- [ ] **Mécanisme dC_t avec redistribution YES+NO** : tests de conservation 100% stricts
- [ ] **Instruction `suggest_l_zero`** disponible et composable
- [ ] **Tests robustesse hors-modèle** : déterministe (jump P=0.5→0.9) + Monte Carlo (100 runs)
- [ ] LPs peuvent claim leurs résiduels YES+NO pendant la vie du market
- [ ] Resolution + claim winnings fonctionnels
- [ ] Front Next.js avec widget de résiduels (affichage YES+NO accumulés + bouton redeem)
- [ ] README avec math défendue, propriétés théoriques validées par tests, composability
- [ ] Demo video 2-3 min qui démontre le dC_t en redistribution YES+NO
- [ ] Repo public propre

---

## 2. Architecture

### 2.1 Stack

```
┌──────────────────────────────────────────┐
│  Front Next.js 14 (App Router) + Tailwind │
│  - wallet-adapter-react                    │
│  - @coral-xyz/anchor client                │
│  - Widget résiduels LP (YES + NO pending)  │
└──────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────┐
│  Programme Anchor (Rust)                  │
│  - pm_math.rs (fixed-point math)          │
│  - accrual.rs (dC_t avec redistribution)  │
│  - state.rs (Market, Position, LpPos)     │
│  - instructions/ (10 ix)                  │
└──────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────┐
│  Solana devnet                            │
│  - SPL Token (USDC mock)                  │
│  - Mints YES/NO par market                │
│  - 1 vault USDC (le seul)                 │
└──────────────────────────────────────────┘
```

**Simplification v3** : plus besoin de `withdrawn_vault` ni de `residual_vault`. Les tokens YES/NO sont mintés à la demande quand un LP claim (le market PDA a l'authority sur les mints).

### 2.2 Modèle de données on-chain

**`Market` (PDA)** — seeds `[b"market", market_id.to_le_bytes()]`

```rust
pub struct Market {
    pub authority: Pubkey,
    pub collateral_mint: Pubkey,    // USDC
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,
    pub vault: Pubkey,               // seul vault, USDC only
    pub start_ts: i64,
    pub end_ts: i64,                 // T

    // AMM params (Q64.64 via I80F48 → u128 storage)
    pub l_zero: u128,                // L_0 constant
    pub reserve_yes: u128,           // x actuel
    pub reserve_no: u128,            // y actuel

    // Accrual dC_t — accumulateurs per-share
    pub last_accrual_ts: i64,
    pub cum_yes_per_share: u128,     // YES tokens libérés par share cumulés
    pub cum_no_per_share: u128,      // NO tokens libérés par share cumulés

    // Stats (pour UI et audit)
    pub total_yes_distributed: u64,  // tokens YES total distribués aux LPs
    pub total_no_distributed: u64,   // idem NO

    // LP accounting
    pub total_lp_shares: u128,

    // Resolution
    pub resolved: bool,
    pub winning_side: Option<Side>,

    pub bump: u8,
}
```

**`Position` (PDA)** — seeds `[b"position", market.key(), owner.key()]`

```rust
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub yes_tokens: u64,
    pub no_tokens: u64,
    pub bump: u8,
}
```

**`LpPosition` (PDA)** — seeds `[b"lp", market.key(), owner.key()]`

```rust
pub struct LpPosition {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub shares: u128,
    pub collateral_deposited: u64,

    // Checkpoints pour le mécanisme dC_t
    pub yes_per_share_checkpoint: u128,
    pub no_per_share_checkpoint: u128,

    pub bump: u8,
}
```

**Calcul des résiduels pending pour un LP** (pas stocké, calculé à la demande) :

```rust
pending_yes = (market.cum_yes_per_share - lp.yes_per_share_checkpoint) · lp.shares / SCALE
pending_no = (market.cum_no_per_share - lp.no_per_share_checkpoint) · lp.shares / SCALE
```

### 2.3 Instructions (10 au total)

| #   | Instruction          | Qui          | Effet                                           | Accrue ?        |
| --- | -------------------- | ------------ | ----------------------------------------------- | --------------- |
| 1   | `initialize_market`  | any          | Crée market, mints, vault                       | Non             |
| 2   | `suggest_l_zero`     | any (view)   | Retourne L_0 suggéré pour (σ, budget, duration) | Non             |
| 3   | `deposit_liquidity`  | any          | Ajoute collateral, mint shares                  | **Oui**         |
| 4   | `withdraw_liquidity` | LP           | Burn shares, récup collat + tokens              | **Oui**         |
| 5   | `swap`               | any          | Trade YES↔NO↔USDC                               | **Oui**         |
| 6   | `accrue`             | any (keeper) | Force accrual manuel                            | N/A             |
| 7   | `claim_lp_residuals` | LP           | Claim tokens YES+NO pending                     | **Oui**         |
| 8   | `redeem_pair`        | any          | 1 YES + 1 NO → 1 USDC                           | Non             |
| 9   | `resolve_market`     | authority    | Set winning side                                | **Oui** (final) |
| 10  | `claim_winnings`     | winners      | Burn winning tokens → USDC                      | Non             |

### 2.4 Le module `accrual.rs` — version v3

**Fonction principale** :

```rust
pub struct AccrualResult {
    pub yes_released: u64,         // ajouté à cum_yes_per_share
    pub no_released: u64,          // ajouté à cum_no_per_share
    pub new_reserve_yes: u128,
    pub new_reserve_no: u128,
    pub new_cum_yes_per_share: u128,
    pub new_cum_no_per_share: u128,
    pub new_last_accrual_ts: i64,
}

pub fn compute_accrual(
    market: &Market,
    now: i64,
) -> Result<AccrualResult> {
    // Cas de base
    if market.resolved {
        return Ok(AccrualResult::noop(market));
    }

    let now_clamped = now.min(market.end_ts);
    let dt = now_clamped - market.last_accrual_ts;
    if dt <= 0 {
        return Ok(AccrualResult::noop(market));
    }

    // Calcul L_eff avant/après
    let t_rem_old = market.end_ts - market.last_accrual_ts;
    let t_rem_new = market.end_ts - now_clamped;

    if t_rem_old <= 0 {
        return Ok(AccrualResult::noop(market));
    }

    let l_zero = market.l_zero_fixed();
    let l_eff_old = l_zero * sqrt_fixed(I80F48::from_num(t_rem_old))?;
    let l_eff_new = if t_rem_new == 0 {
        I80F48::ZERO
    } else {
        l_zero * sqrt_fixed(I80F48::from_num(t_rem_new))?
    };

    // Prix courant
    let x = market.reserve_yes_fixed();
    let y = market.reserve_no_fixed();
    let p = price_from_reserves(x, y, l_eff_old)?;

    // Nouvelles réserves au prix constant
    let (x_new, y_new) = reserves_from_price(p, l_eff_new)?;

    // Tokens libérés (pas de burn, pas de surplus à gérer : tout va aux LPs)
    let yes_released = (x - x_new).max(I80F48::ZERO);
    let no_released = (y - y_new).max(I80F48::ZERO);

    // Distribution aux LPs via accumulateurs per-share
    let (new_cum_yes, new_cum_no) = if market.total_lp_shares > 0 {
        let shares = I80F48::from_num(market.total_lp_shares);
        let delta_yes_per_share = yes_released / shares;
        let delta_no_per_share = no_released / shares;
        (
            market.cum_yes_per_share + delta_yes_per_share.to_num::<u128>(),
            market.cum_no_per_share + delta_no_per_share.to_num::<u128>(),
        )
    } else {
        (market.cum_yes_per_share, market.cum_no_per_share)
    };

    Ok(AccrualResult {
        yes_released: yes_released.to_num::<u64>(),
        no_released: no_released.to_num::<u64>(),
        new_reserve_yes: x_new.to_num::<u128>(),
        new_reserve_no: y_new.to_num::<u128>(),
        new_cum_yes_per_share: new_cum_yes,
        new_cum_no_per_share: new_cum_no,
        new_last_accrual_ts: now_clamped,
    })
}

pub fn apply_accrual(market: &mut Market, result: &AccrualResult) {
    market.reserve_yes = result.new_reserve_yes;
    market.reserve_no = result.new_reserve_no;
    market.cum_yes_per_share = result.new_cum_yes_per_share;
    market.cum_no_per_share = result.new_cum_no_per_share;
    market.last_accrual_ts = result.new_last_accrual_ts;
    market.total_yes_distributed = market.total_yes_distributed
        .saturating_add(result.yes_released);
    market.total_no_distributed = market.total_no_distributed
        .saturating_add(result.no_released);
}

/// Calcule les tokens pending pour un LP
pub fn compute_lp_pending(
    lp: &LpPosition,
    market: &Market,
) -> (u64, u64) {
    let shares = I80F48::from_num(lp.shares);

    let delta_yes = I80F48::from_num(market.cum_yes_per_share)
        - I80F48::from_num(lp.yes_per_share_checkpoint);
    let delta_no = I80F48::from_num(market.cum_no_per_share)
        - I80F48::from_num(lp.no_per_share_checkpoint);

    let pending_yes = (delta_yes * shares).to_num::<u64>();
    let pending_no = (delta_no * shares).to_num::<u64>();

    (pending_yes, pending_no)
}
```

**Pattern d'usage dans les instructions mutatives** :

```rust
pub fn handler_swap(ctx: Context<Swap>, /* ... */) -> Result<()> {
    // Accrual first
    let accrual = compute_accrual(&ctx.accounts.market, Clock::get()?.unix_timestamp)?;
    apply_accrual(&mut ctx.accounts.market, &accrual);
    // Pas de token transfer à faire ici : les tokens sont "virtuellement"
    // crédités via les accumulateurs. Ils sont mintés seulement quand un LP claim.

    // ... logique swap normale
}
```

**Simplification majeure vs v2** : plus besoin de transfer USDC vers un withdrawn_vault. Les tokens YES/NO sont virtuels jusqu'au claim, et mintés par le market à ce moment-là.

### 2.5 Propriétés invariantes (vérifiées en tests)

1. **Conservation tokens** : `total_yes_minted = reserve_yes + sum(user.yes_tokens) + sum(lp.pending_yes)`, idem NO
2. **Conservation USDC** : `vault_balance = sum(user.collateral) + sum(lp.collateral_deposited) - sum(withdrawals_via_pair_redeem)`
3. **Monotonie accrual** : `cum_yes_per_share` et `cum_no_per_share` ne décroissent jamais
4. **Invariant amm** : après chaque ix, `invariant_value(x, y, L_eff) ≈ 0` (tolérance 10⁻⁶)
5. **No-arbitrage at resolve** : `sum(winning_claims) ≤ vault_balance`
6. **Propriété uniform LVR** (test Monte Carlo) : `LVR_t / V_t` indépendant de P (std < 5%)
7. **Propriété constant E[LVR]** (test Monte Carlo) : `E[LVR_t]` constant sur `[0, T]` (std < 10%)
8. **Propriété E[W_T] = W_0/2** (test scénario) : tolérance 5%

---

## 3. Sprint Planning v3

### Vue d'ensemble

| Sprint                                       | Durée | Output                                        | Changement vs v2                                   |
| -------------------------------------------- | ----- | --------------------------------------------- | -------------------------------------------------- |
| 1. Setup repo                                | 1h    | Monorepo init                                 | —                                                  |
| 2. Module math `pm_math.rs`                  | 6h    | Fonctions mathématiques testées               | —                                                  |
| 3. Scaffold Anchor                           | 3h    | Structs + PDAs + init_market                  | 🔄 Pas de withdrawn_vault, fields YES/NO per-share |
| 4. Module `accrual.rs`                       | 5h    | dC_t avec redistribution YES+NO               | 🔄 Simplifié (pas de transfers USDC dans accrue)   |
| 5. Core instructions (swap/deposit/withdraw) | 7h    | 3 ix + accrue intégré                         | 🔄 Plus simple sans transfers accrual              |
| 6. LP residuals flow                         | 3h    | `accrue`, `claim_lp_residuals`, `redeem_pair` | 🔄 Claim direct tokens YES+NO + redeem pair        |
| 7. Resolve + claim winnings                  | 2h    | —                                             | —                                                  |
| 8. Instruction `suggest_l_zero`              | 2h    | Helper on-chain composable                    | 🆕 **NOUVEAU**                                     |
| 9. Tests complets (propriétés + robustesse)  | 7h    | Suite TS + Monte Carlo + jump test            | 🔄 Ajout tests robustesse                          |
| 10. Devnet deploy + seed                     | 2h    | Markets de démo                               | —                                                  |
| 11. Front Next.js scaffold                   | 4h    | Wallet, hooks, layout                         | —                                                  |
| 12. UI trade + LP + résiduels                | 7h    | Flows + widget résiduels YES+NO               | 🔄 Widget YES+NO au lieu d'USDC                    |
| 13. Polish + README + demo                   | 6h    | Submission-ready                              | 🔄 +section propriétés testées                     |

**Total estimé : 55h** (+5h vs v2 pour suggest_l_zero et tests de robustesse).

---

## 4. Sprints détaillés

### Sprint 1 — Setup repo

**Contexte Claude Code** :

> POC Anchor + Next.js pour pm-AMM Solana. Monorepo classique.

**Tâches** :

1. Structure monorepo :
   ```
   pm-amm/
   ├── anchor/
   │   ├── programs/pm_amm/src/
   │   │   ├── instructions/
   │   │   ├── pm_math.rs
   │   │   ├── accrual.rs
   │   │   ├── state.rs
   │   │   ├── errors.rs
   │   │   └── lib.rs
   │   ├── tests/
   │   ├── scripts/
   │   ├── Anchor.toml
   │   └── Cargo.toml
   ├── app/                       # Next.js 14
   └── README.md
   ```
2. `cd anchor && anchor init pm_amm --no-git`
3. Next.js 14 dans `app/` (TS, Tailwind, App Router)
4. Deps :
   - Rust : `anchor-lang = "0.30"`, `anchor-spl = "0.30"`, `fixed = "1.27"`
   - TS : `@coral-xyz/anchor`, `@solana/web3.js`, `@solana/wallet-adapter-*`
5. `.env.example`, `anchor/Anchor.toml` devnet + localnet

**DoD** : `cd anchor && anchor build` passe (ou `pnpm build` from root), `pnpm dev` démarre.

---

### Sprint 2 — Module math `pm_math.rs` ⚠️ CRITIQUE

**Contexte Claude Code** :

> Module cœur. Toutes les fonctions Paradigm en fixed-point I80F48. Tests vs scipy.stats.norm obligatoires.
>
> Formules exactes (dynamic pm-AMM) :
>
> - Invariant : `(y-x)·Φ((y-x)/L_eff) + L_eff·φ((y-x)/L_eff) - y = 0` avec `L_eff = L_0·√(T-t)`
> - Réserves : `x* = L_eff·{Φ⁻¹(P)·P + φ(Φ⁻¹(P)) - Φ⁻¹(P)}`, `y* = L_eff·{Φ⁻¹(P)·P + φ(Φ⁻¹(P))}`
> - Pool value : `V = L_eff · φ(Φ⁻¹(P))`
> - Identité : `y - x = L_eff · Φ⁻¹(P)`
>
> IMPORTANT : `L_eff` est passé en paramètre, jamais `L_0` + `T-t` séparément.

**Tâches** :

1. **Primitives fixed-point** :
   - `exp_approx(x: I80F48) -> Result<I80F48>` — Taylor, `x ∈ [-20, 20]`
   - `sqrt_fixed(x: I80F48) -> Result<I80F48>` — Newton, 8 iter
   - `ln_approx(x: I80F48) -> Result<I80F48>` — pour Acklam

2. **Fonctions spéciales** :
   - `erf_approx(x)` — Abramowitz & Stegun 7.1.26
   - `phi(z)` — PDF
   - `capital_phi(z)` — CDF = `0.5·(1+erf(z/√2))`
   - `capital_phi_inv(p)` — Acklam, `p ∈ [0.0001, 0.9999]`

3. **Fonctions pool** :

   ```rust
   pub fn price_from_reserves(x: I80F48, y: I80F48, l_eff: I80F48) -> Result<I80F48>;
   pub fn reserves_from_price(p: I80F48, l_eff: I80F48) -> Result<(I80F48, I80F48)>;
   pub fn invariant_value(x: I80F48, y: I80F48, l_eff: I80F48) -> Result<I80F48>;
   pub fn pool_value(x: I80F48, y: I80F48, l_eff: I80F48) -> Result<I80F48>;
   pub fn compute_swap_output(
       x: I80F48, y: I80F48, l_eff: I80F48,
       delta_in: I80F48, side_in: Side, side_out: Side,
   ) -> Result<SwapResult>;
   ```

4. **Fonction pour `suggest_l_zero`** :

   ```rust
   /// Calcule le L_0 suggéré pour qu'un LP dépose `budget_usdc` en USDC
   /// sur un market qui dure `duration_secs` avec estimation de volatilité `sigma`.
   ///
   /// Rationale : pour une Gaussian score dynamics avec volatilité σ,
   /// la volatilité instantanée du prix à P=0.5 est σ/√(T-t).
   /// On calibre L_0 pour que la pool value initiale à P=0.5 soit égale au budget.
   /// V(0.5, 0) = L_0·√T · φ(0) = L_0·√T · 0.39894
   /// Donc L_0 = budget / (0.39894 · √T)
   ///
   /// Note: σ n'apparaît pas directement car le prix est invariant en σ
   /// (cf. paper section 5). Mais σ détermine la rapidité du price discovery,
   /// ce qui affecte le choix de `T` effectif pour l'LP (plus σ élevé, plus il
   /// devrait privilégier un `T` court pour limiter LVR cumulé).
   pub fn suggest_l_zero_for_budget(
       budget_usdc: u64,
       duration_secs: i64,
       sigma_bps: u64,  // σ en basis points, pour info / warnings
   ) -> Result<u128>;
   ```

5. **Tests unitaires** :
   - Fonctions élémentaires : `Φ(0)=0.5`, `Φ(1.96)=0.975`, `φ(0)=0.39894`, `Φ⁻¹(Φ(x))=x`
   - `reserves_from_price(0.5, L_eff=1000)` → `x≈y≈398.94`
   - Round-trip : `price_from_reserves(reserves_from_price(P, L)) = P`
   - Invariant : `invariant_value(x*(P), y*(P), L_eff) ≈ 0` pour P ∈ {0.1, 0.3, 0.5, 0.7, 0.9}
   - Swap round-trip : loss ≤ 0.1%
   - `suggest_l_zero` : pour budget=1000, duration=86400·7, σ=N/A → vérifier `V(0.5, 0) ≈ 1000`
   - **Bench CU** logged

**DoD** :

- `cd anchor && cargo test --package pm_amm pm_math` vert
- Tolérance tests 1e-7
- Aucune panic, `unwrap` safe uniquement
- Doc EN
- CU documenté

**Fallback CU** : lookup table pour Φ⁻¹ (feature flag `acklam-lut`).

---

### Sprint 3 — Scaffold Anchor (v3)

**Contexte Claude Code** :

> Structs on-chain v3. Un seul vault USDC. Fields cum_yes_per_share et cum_no_per_share pour dC_t redistribution.

**Tâches** :

1. **`state.rs`** — structs de section 2.2 du PRD

2. **Helpers sur `Market`** :

   ```rust
   impl Market {
       pub fn l_zero_fixed(&self) -> I80F48 { /* ... */ }
       pub fn l_effective(&self, now: i64) -> Result<I80F48>;
       pub fn reserve_yes_fixed(&self) -> I80F48;
       pub fn reserve_no_fixed(&self) -> I80F48;
       pub fn cum_yes_per_share_fixed(&self) -> I80F48;
       pub fn cum_no_per_share_fixed(&self) -> I80F48;
   }
   ```

3. **`errors.rs`** :

   ```rust
   pub enum PmAmmError {
       MarketAlreadyResolved,
       MarketNotResolved,
       MarketExpired,
       MarketNotExpired,
       InsufficientLiquidity,
       SlippageExceeded,
       Unauthorized,
       InvalidPrice,
       MathOverflow,
       ConvergenceFailed,
       AccrualFailed,
       NoResidualsToClaim,
       InvalidDuration,
       InvalidBudget,
   }
   ```

4. **`initialize_market.rs`** :
   - Accounts : authority, market (init), collateral_mint, yes_mint (init), no_mint (init), vault (init), associated token programs
   - Args : `market_id: u64`, `end_ts: i64`
   - Logic : init mints (decimals 6), vault token account, set `last_accrual_ts = start_ts`, cumulés à 0
   - Check : `end_ts > start_ts + 3600` (au moins 1h de durée)

**DoD** : `cd anchor && anchor build` (ou `pnpm build` from root) + test TS init → vérifie state post-création.

---

### Sprint 4 — Module `accrual.rs` v3

**Contexte Claude Code** :

> Module critique. Version v3 simplifiée : pas de token transfers dans accrual (tokens sont virtuels jusqu'au claim LP).
>
> L'algorithme calcule les tokens YES et NO "libérés" quand L_eff décroît, et les crédite via accumulateurs per-share. Les LPs claim et les tokens sont mintés à ce moment-là.

**Tâches** :

1. **`accrual.rs`** — code complet de la section 2.4 du PRD

2. **Tests unitaires obligatoires** :
   - **Test 1 — Sanity** : market à P=0.5, 1 LP avec 1000 shares, dt=1 jour, vérifier `yes_released > 0`, `no_released > 0`, cohérent avec `V_t/(2(T-t))·dt` en valeur équivalente USDC (= yes·P + no·(1-P))
   - **Test 2 — No-op** : deux appels consécutifs, deuxième retourne `yes_released = no_released = 0`
   - **Test 3 — Conservation stricte** : somme des tokens YES libérés au cours d'un market complet → valeur totale `≈ V_0/2` en USDC équivalent (tolérance 3%)
   - **Test 4 — Prix inchangé** : après accrual, `price_from_reserves(new_x, new_y, l_eff_new) == P_old` (tolérance 1e-6)
   - **Test 5 — Invariant préservé** : `invariant_value(new_x, new_y, l_eff_new) ≈ 0`
   - **Test 6 — Edge case T-t=0** : `L_eff_new = 0`, toute la liquidité libérée
   - **Test 7 — Prix extrêmes P=0.05 et P=0.95** : accrual fonctionne, ratio yes_released/no_released cohérent avec la direction du prix
   - **Test 8 — Asymétrie** : à P=0.7, vérifier `no_released > yes_released` (parce que le pool a plus de NO)
   - **Test 9 — Cas petite durée** : dt=1 seconde, accrual minuscule mais non-zéro et cohérent

3. **Helper compute_lp_pending** : tests séparés
   - LP avec 0 shares → pending = (0, 0)
   - LP avec checkpoint à jour → pending = (0, 0)
   - LP avec checkpoint en retard → pending cohérent

4. **Doc** : `accrual.md` dans `anchor/programs/pm_amm/src/` avec les formules et le rationale de la discrétisation.

**DoD** :

- 9 tests accrual verts
- Conservation à 3% tolérance (c'est plus strict que v2)
- CU documenté : target <40k pour compute_accrual

---

### Sprint 5 — Core instructions v3

**Contexte Claude Code** :

> 3 ix : deposit, swap, withdraw. Chacune appelle accrue en premier. Accrue ne fait que du state update (pas de transfer).

**Pattern commun** (helper) :

```rust
fn accrue_first(market: &mut Market) -> Result<()> {
    let result = compute_accrual(market, Clock::get()?.unix_timestamp)?;
    apply_accrual(market, &result);
    Ok(())
}
```

**Tâches** :

1. **`deposit_liquidity.rs`** :
   - Accrue first
   - Check `now < end_ts`
   - Si premier LP :
     - Bootstrap : `L_0 = collateral_amount / (0.39894 · √(T-t))` (formule `V(0.5, t) = L_eff·φ(0) = collateral`)
     - Réserves initiales : `x = y = L_eff · φ(0) = collateral / 2` (à P=0.5)
     - Shares = `collateral_amount`
   - Sinon :
     - Calculer pool value courant
     - Shares = `collateral_amount · total_shares / pool_value`
     - Augmenter `L_0` proportionnellement, rallocate `x, y` en gardant P constant
   - Transfer USDC user → vault
   - Create/update `LpPosition` avec checkpoints = current cum_yes/no_per_share
   - Edge case : deposit après end_ts → revert

2. **`swap.rs`** :
   - Accrue first
   - Calculer `L_eff` avec `now` post-accrual
   - `compute_swap_output`
   - Slippage check
   - Selon side_in/side_out :
     - `USDC → YES` : transfer USDC user→vault, mint YES au user
     - `USDC → NO` : idem NO
     - `YES → USDC` : burn YES user, transfer USDC vault→user
     - `NO → USDC` : idem
     - `YES → NO` / `NO → YES` : burn + mint
   - Update reserves et Position user

3. **`withdraw_liquidity.rs`** :
   - Accrue first (crucial)
   - Check : le LP doit claim ses résiduels d'abord (revert `ResidualsPending` si `compute_lp_pending > 0`)
     - Alternative plus UX : auto-claim dans le même ix. Choix : auto-claim pour simplicité
   - Calculer share fraction
   - Le LP récupère :
     - `share_fraction · reserve_yes` tokens YES (mint to user)
     - `share_fraction · reserve_no` tokens NO (mint to user)
     - Pas d'USDC direct (le LP doit soit redeem pair, soit attendre résolution)
   - Update `L_0` proportionnellement (réduit)
   - Update `Market.total_lp_shares`, reserves
   - Burn `LpPosition.shares`
   - Update checkpoints

**DoD** : scénario TS :

1. Alice init market (7 jours)
2. Alice deposit 1000 USDC → 1000 shares, L_0 calibré, V(0.5, 0) = 1000
3. Bob swap 100 USDC → ~199 YES
4. Warp 1 jour → accrual auto au prochain swap
5. Charlie swap 50 USDC → NO
6. Alice peut claim ses résiduels (voir sprint 6)
7. Alice withdraw 50% → récupère ~500 USDC équivalent en YES+NO

---

### Sprint 6 — LP residuals flow v3

**Contexte Claude Code** :

> 3 ix nouvelles : `accrue` permissionless, `claim_lp_residuals`, `redeem_pair`.

**Tâches** :

1. **`accrue.rs` (instruction)** :
   - Permissionless (pas de signer spécial)
   - Args : rien
   - Logic : `accrue_first` + event emit avec les deltas
   - CU target : <50k

2. **`claim_lp_residuals.rs`** :
   - Signer : `lp.owner`
   - Accrue first (pour inclure les derniers dC_t)
   - Calcule `(pending_yes, pending_no) = compute_lp_pending(lp, market)`
   - Revert si both == 0
   - **Mint `pending_yes` YES tokens** au user (authority = market PDA)
   - **Mint `pending_no` NO tokens** au user
   - Update checkpoints : `lp.yes_per_share_checkpoint = market.cum_yes_per_share`, idem NO
   - Update `Position` du user (si existe) ou créer
   - Event : `LpResidualsClaimed { lp, yes_amount, no_amount }`

3. **`redeem_pair.rs`** :
   - Signer : n'importe quel holder
   - Args : `amount: u64`
   - Check : user a `amount` YES et `amount` NO
   - Burn `amount` YES et `amount` NO
   - Transfer `amount` USDC vault → user (1 pair = 1 USDC)
   - **Attention** : ne touche pas les reserves du pool, ça vient des tokens minté en dehors du pool (claims LP + trades)
   - Event : `PairRedeemed { user, amount }`

**Question design** : le `redeem_pair` peut-il drain le vault au-delà des réserves ? **Non** : tous les tokens YES/NO en circulation ont été minté soit contre USDC (swap USDC→YES/NO), soit via claim résiduel (mais la contrepartie USDC est dans le vault parce qu'elle vient des swaps antérieurs). L'invariant de conservation USDC garantit ça.

**Tests TS** :

- **"LP patient"** : Alice LP au jour 0, warp 3 jours, call accrue, claim résiduels → reçoit YES+NO non-trivial, puis redeem_pair partiel pour USDC
- **"Multi-LP pro-rata"** : Alice LP 1000 jour 0, Bob LP 1000 jour 2. Warp 3 jours. Alice claim > Bob claim (proportionnel au temps de LP)
- **"Redeem pair"** : user avec 10 YES + 10 NO → redeem 10 → récupère 10 USDC, balances YES et NO à 0
- **"Redeem partial"** : user avec 10 YES + 5 NO → redeem 5 → OK, reste 5 YES et 0 NO

**DoD** : tous tests verts.

---

### Sprint 7 — Resolve + claim winnings

**Tâches** :

1. **`resolve_market.rs`** :
   - Signer : `market.authority`
   - Accrue first (capture le dernier dt jusqu'à end_ts)
   - Check `now >= end_ts`
   - Set `resolved = true`, `winning_side = Some(side)`

2. **`claim_winnings.rs`** :
   - Check `resolved`
   - User burn ses tokens du winning side
   - Transfer 1 USDC par token burned, depuis vault
   - Event : `WinningsClaimed`

**Edge cases** :

- LP qui avait pas claim ses résiduels avant resolve : ils peuvent claim après, recevoir YES+NO, puis claim_winnings sur le side gagnant
- Redeem_pair reste possible après resolve : un user avec 5 YES + 5 NO peut soit redeem_pair pour 5 USDC, soit claim 5 USDC si YES est gagnant et garder les 5 NO worthless

**DoD** : scénario TS complet jusqu'à resolve + claims.

---

### Sprint 8 — Instruction `suggest_l_zero` 🆕

**Contexte Claude Code** :

> View function on-chain (pas mutative). Permet à un LP de savoir combien de `L_0` proposer pour un budget donné. Composable : un vault auto-LP peut l'appeler en CPI.

**Tâches** :

1. **`suggest_l_zero.rs`** :
   - Accounts : `market` (readonly)
   - Args :
     - `budget_usdc: u64` — combien le LP veut déposer
     - `sigma_bps: u64` — estimation de la volatilité annuelle en basis points (pour warnings)
   - Return (via event) :
     ```rust
     pub struct LZeroSuggestion {
         pub suggested_l_zero: u128,       // Q64.64
         pub estimated_pool_value: u64,    // en USDC
         pub estimated_daily_lvr: u64,     // V/(2·T·86400) en USDC/jour
         pub warning_high_sigma: bool,     // si σ > 200% annuel
         pub warning_short_duration: bool, // si duration < 1 jour
     }
     ```

2. **Logique** :
   - Calcule `duration_secs = market.end_ts - Clock::get()?.unix_timestamp`
   - Appelle `suggest_l_zero_for_budget(budget_usdc, duration_secs, sigma_bps)` (sprint 2)
   - Calcule les estimations :
     - `estimated_pool_value = budget_usdc` (par construction)
     - `estimated_daily_lvr = budget_usdc / (2 · duration_days)` en équivalent
   - Set warnings selon seuils

3. **Composabilité** :
   - Exposer via IDL pour que d'autres programmes puissent le call en CPI
   - Exemple de code TS d'intégration pour un vault externe

**Tests** :

- Budget 1000, 7 jours, σ=50% → suggested L_0 cohérent, pool_value≈1000
- Budget 10k, 30 jours → L_0 cohérent, daily_LVR ≈ 166
- Warnings : σ=300% → warning_high_sigma true
- Warnings : duration = 1h → warning_short_duration true

**DoD** : instruction callable, events correctement émis, tests verts.

---

### Sprint 9 — Tests complets (propriétés théoriques + robustesse hors-modèle)

**Contexte Claude Code** :

> La suite de tests qui VALIDE la fidélité au paper. Trois catégories : fonctionnel, propriétés Paradigm, robustesse hors-modèle.

**Tâches** :

1. **Tests fonctionnels** (`anchor/tests/functional.ts`) :
   - Happy path complet
   - Stress : 100 swaps random, invariant OK après chaque
   - Scale : 0.01 USDC → 10k USDC même pool
   - Near-expiry : warp à end_ts - 1h
   - Edge cases : all revert cases

2. **Tests propriétés Paradigm** (`anchor/tests/paradigm_properties.ts`) :

   **Test A — Uniform LVR en prix** :

   ```
   Pour P ∈ {0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9} :
     Setup pool à ce prix avec L_0 fixe
     Mesurer LVR_instantané sur un petit dt
     Ratio LVR/V doit être ~constant (std < 5% across prices)
   ```

   **Test B — Constant E[LVR] dans le temps** :

   ```
   Pour t ∈ {T/10, T/4, T/2, 3T/4, 9T/10} :
     Run Monte Carlo 50 fois :
       Setup market, random walk P autour de P_0
       Mesurer LVR cumulé à ce t
     E[LVR(t)] doit être ~constant (std < 10%)
   ```

   **Test C — Conservation E[W_T] = W_0/2** :

   ```
   Monte Carlo 100 runs :
     Init market avec W_0 = 1000
     Simuler random walk de prix
     À chaque step : accrual + track résiduels distribués
     À T : measure sum(résiduels distribués) + V_T
     E[W_T] = E[sum(résiduels) + V_T] doit ≈ W_0/2 (tolérance 5%)
   ```

3. **Tests robustesse hors-modèle** (`anchor/tests/robustness.ts`) :

   **Test D — Jump déterministe** :

   ```
   Setup market, P=0.5, V=1000, T-t=7 jours
   Trade massif qui déplace P de 0.5 → 0.9 en une seule tx
   Mesurer :
     - Invariant après trade : doit être ≈ 0 (tolérance 1e-5)
     - Slippage observé : doit être cohérent avec la courbe
     - Pool value : doit décroître mais pas à zéro
     - Aucun revert/overflow
   ```

   **Test E — Monte Carlo avec jumps** :

   ```
   100 runs :
     Setup market
     À chaque step : 80% chance d'un petit mouvement gaussien, 20% chance d'un jump ±20%
     Mesurer LVR effectif vs théorique gaussien
     Logger l'écart moyen (expected : jumps augmentent LVR de 30-50%)
   ```

4. **Tests suggest_l_zero** :
   - Correctness : L_0 produit un pool_value ≈ budget
   - Warnings : activés selon seuils
   - CPI compatibility : un programme de test appelle en CPI

**DoD** :

- Toutes tests verts
- Propriétés paradigm vérifiées dans les tolérances spécifiées
- Tests robustesse documentent l'écart hors-modèle (pour le README)

---

### Sprint 10 — Devnet deploy + seed

**Tâches** :

1. `anchor/scripts/deploy-devnet.ts`
2. `anchor/scripts/seed-devnet.ts` : 2 markets démo
3. `anchor/scripts/simulate-life.ts` : simule 7 jours compressés (warps + trades + accruals)
4. `anchor/scripts/airdrop.ts`

**DoD** : programme déployé, markets seed visibles.

---

### Sprint 11 — Front Next.js scaffold

**Tâches** :

1. Providers
2. Layout + nav
3. Hooks : `useProgram`, `useMarkets`, `useMarket`, `usePosition`, `useLpPosition`, `useLpResiduals` (calcule pending YES+NO)
4. Types IDL
5. Utils : formatters, JS port de `priceFromReserves`

**DoD** : wallet connect, list markets, prix en temps réel.

---

### Sprint 12 — UI complète (trade + LP + widget résiduels YES+NO)

**Tâches** :

1. **`TradePanel.tsx`** : toggle YES/NO, input USDC, preview output, bouton Trade

2. **`LpPanel.tsx`** :
   - Deposit : avant le bouton, un champ "Estimated σ (annualized)" + appel à `suggest_l_zero` qui affiche "This deposit suggests L_0=X, pool value=Y, daily LVR=Z"
   - Withdraw : preview tokens YES+NO récupérés

3. **`ResidualsWidget.tsx`** 🆕 :
   - **Grosse carte mise en avant** sur la page LP
   - Affiche `pending_yes` + `pending_no` (en live via polling 3s)
   - Affiche la valeur USDC équivalente : `pending_yes·P + pending_no·(1-P)`
   - Bouton "Claim YES+NO" → appelle `claim_lp_residuals`
   - Après claim : affiche les tokens reçus, propose 2 actions :
     - "Redeem as pairs" (si user a du YES et du NO) → `redeem_pair(min(yes, no))`
     - "Sell YES/NO on pool" → redirige vers TradePanel préconfig
   - **Graph Recharts** : courbe de `total_yes_distributed + total_no_distributed` au fil du temps (historical fetch)

4. **`MarketChart.tsx`** :
   - Prix YES
   - Shaded area montrant `L_eff` décroissant (demonstre visuellement le dC_t)

5. **`PositionCard.tsx`** : YES + NO balance + claim si resolved

6. **`RedeemPairPanel.tsx`** (petit widget utility) :
   - Affiche les paires redeemables du user
   - Bouton "Redeem N pairs for N USDC"

7. **If resolved** : masquer trade/LP, afficher "Resolved: YES won", claim winnings button, mais redeem_pair reste possible

**DoD** : flow complet démontrable en 3 min, particulièrement "LP → wait → claim YES+NO residuals → redeem_pair for USDC" qui vend le produit.

---

### Sprint 13 — Polish + README + demo video

**Tâches** :

1. **README.md** (EN) :
   - **Pitch 3 lignes** : "First production pm-AMM on Solana. 100% fidelity to Paradigm's paper. Uniform LVR in price and time. LPs receive tokens continuously, not fees. Shipped in 72h."
   - **Section Math** (avec LaTeX rendus) :
     - Invariant dynamic avec formule
     - 3 propriétés théoriques (uniform LVR, constant E[LVR], W_T = W_0/2)
     - Référence au paper Paradigm
   - **Section "The dC_t mechanism — why this is different"** :
     - Explication pédagogique : "In standard AMMs, LPs pay IL. In pm-AMM, LPs receive a continuous stream of YES+NO tokens..."
     - Schéma timeline : LP deposits → accrual continu → LP claim pending → redeem or trade
     - Test de conservation visualisé (graph comparant théorique et observé)
   - **Section "Properties verified on-chain"** :
     - Lister les 3 propriétés avec les tests qui les valident
     - Mentionner les tolérances exactes mesurées
   - **Section "Robustness beyond the Gaussian model"** :
     - Honnêteté sur les limites
     - Résultats du test D (jump) et E (MC) avec écarts observés
     - Discussion : "For events with potential jumps (news breaking), expect LVR 30-50% higher than theoretical"
   - **Section "Composability"** :
     - Interface CPI : swap, deposit, suggest_l_zero
     - Exemple code : "How to build an auto-LP vault on top of pm-AMM"
   - **Section "Known limitations"** :
     - Oracle : admin-only POC, Spark resolution layer to integrate
     - Multi-outcome : binary only
     - Fee tier : 0% in POC
   - **Section "Roadmap"** : oracle, multi-outcome, fees, hedging primitives, institutional LP tools
   - **Section "Devis Spark"** : $8k avec milestones

2. **Diagrammes** :
   - Archi système (mermaid)
   - Flow dC_t (timeline)
   - Conservation test results (embedded graph)

3. **Demo video 2-3 min** :
   - Hook (10s) : "Paradigm published pm-AMM 18 months ago. Nobody shipped it. I did, in 72h, with 100% fidelity."
   - Math (30s) : zoom sur l'invariant et les 3 propriétés
   - **dC_t redistribution demo (60s)** : create → LP 1000 → warp 2 days → claim YES+NO residuals → redeem_pair for USDC → **c'est le moment qui vend**
   - Swap + resolve (30s)
   - Composability via `suggest_l_zero` CPI (15s)
   - Robustness tests results (15s)
   - CTA (10s)

4. **Tweet thread** (degen/builder)

5. **Cleanup code** : debug logs out, `unwrap` safe, commentaires sur math non-évidente

**DoD** : submission Spark complète (repo + video + devis + property verification report).

---

## 5. Risques v3

| Risque                                    | Probabilité  | Mitigation                                                    |
| ----------------------------------------- | ------------ | ------------------------------------------------------------- |
| `Φ⁻¹` dépasse CU                          | Haute        | Lookup table fallback, feature flag                           |
| **Accrual CU trop cher**                  | **Moyenne**  | 400k CU budget, optim via batch calc                          |
| Swap non-convergent bords                 | Moyenne      | Bornes p∈[0.001, 0.999]                                       |
| **dC_t conservation bug**                 | **Critique** | Tests sprint 4 (9 tests), tests sprint 9 propriétés (A, B, C) |
| **Mint YES/NO au claim : race condition** | Moyenne      | Accrue + update checkpoint atomic dans la même ix             |
| Overflow Q64.64                           | Faible       | Checks systématiques                                          |
| Devnet instable pour demo                 | Moyenne      | Record à l'avance, backup mainnet                             |
| **suggest_l_zero CPI cassé**              | Faible       | Test CPI dédié sprint 9                                       |

---

## 6. Appendice — Checklist fidélité 100%

À cocher avant submission :

**Math du paper**

- [ ] Invariant dynamic exact avec `L_eff = L_0·√(T-t)` ✅
- [ ] Formules explicites eq. (5) et (6) du paper ✅
- [ ] Pool value `V = L_eff·φ(Φ⁻¹(P))` ✅
- [ ] Identité `y - x = L_eff·Φ⁻¹(P)` utilisée pour pricing ✅
- [ ] β = 1/2 respecté ✅

**Mécanisme dC_t**

- [ ] Redistribution en tokens YES+NO (pas en USDC burned) ✅
- [ ] Accumulateurs per-share pour fair distribution ✅
- [ ] LPs claim via `claim_lp_residuals` ✅
- [ ] `redeem_pair` disponible pour convertir en USDC ✅
- [ ] Conservation testée à 3% tolérance (sprint 4 test 3) ✅
- [ ] Conservation testée à 5% en Monte Carlo (sprint 9 test C) ✅

**Propriétés Paradigm**

- [ ] Uniform LVR en prix : test sprint 9 A ✅
- [ ] Constant E[LVR] en temps : test sprint 9 B ✅
- [ ] E[W_T] = W_0/2 : test sprint 9 C ✅

**Composabilité & calibration**

- [ ] `suggest_l_zero` on-chain ✅
- [ ] Test CPI dédié ✅
- [ ] Warnings actifs (σ élevé, durée courte) ✅

**Robustesse hors-modèle**

- [ ] Test déterministe (jump 0.5 → 0.9) ✅
- [ ] Test Monte Carlo avec jumps ✅
- [ ] Écarts documentés dans le README ✅

**Modèle**

- [ ] Gaussian score dynamics défendu dans le README ✅
- [ ] σ noté comme caché on-chain ✅

Si un seul point n'est pas coché, le claim "100% fidelity" n'est pas défendable.

---

## 7. Devis Spark

```
Total ask: $9,000 (up from $8k in v2 due to extra robustness work)
Currency mix: $6,000 USDG + $3,000 $PREDICT
Split:
  - 40% upfront ($3,600) — 72h build + infra
  - 30% at Day 15 ($2,700) — milestone: Spark oracle integrated + mainnet deploy
  - 30% at Day 30 ($2,700) — milestone: 1 external protocol uses suggest_l_zero via CPI

Success milestones:
  - +$2,000 if daily volume > $10k for 7 consecutive days
  - +$3,000 if TVL > $100k at Day 60
  - +$2,000 if a security firm audits and publishes report (no critical findings)
```

Justif : "First 100% fidelity implementation of Paradigm's pm-AMM. Includes dC_t redistribution in YES+NO tokens (strict reading), on-chain calibration helper (composable), and robustness testing beyond the Gaussian assumption. Budget covers 72h ship + 30 days of polish, oracle integration, and audit preparation. Leaves room for a second exceptional team."

---

## 8. Prompts Claude Code

**Démarrage sprint** :

```
Lis /pm-amm-prd-v3.md. Exécute Sprint N.
Contraintes:
- DoD stricte
- Formules EXACTES du paper Paradigm (https://www.paradigm.xyz/2024/11/pm-amm)
- Tests obligatoires pour math
- Si ambiguïté, choix simple + commentaire
- JAMAIS dévier de la spec math du paper sans me demander
- Si tu simplifies, flag-le explicitement dans un commentaire `// SIMPLIFIED: <raison>`
```

**Validation fidélité** :

```
Vérifie que le code du sprint N respecte la section "Appendice Checklist" du PRD.
Liste les points cochés et ceux à risque.
Si un test de propriété (A, B, C, D, E) n'a pas sa tolérance documentée, fail.
```

---

_PRD v3.0 — 100% fidelity to Paradigm pm-AMM paper. Zéro compromis non-documenté. Stricte interprétation du mécanisme dC_t : LPs reçoivent des tokens YES+NO (mixed position), pas de l'USDC burned. Composabilité via `suggest_l_zero`. Robustesse testée hors-modèle._
