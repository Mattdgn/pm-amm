# Sprint 8 — Instruction `suggest_l_zero`

**Duree estimee** : 2h
**Output** : Helper on-chain composable pour calibrer L_0
**Dependances** : Sprint 2, Sprint 3
**Reference** : `doc/wp-para.md` — V(0.5) = L_eff * phi(0) = L_eff * 0.39894 (section 7)

## Contexte
View function on-chain (pas mutative). Permet a un LP de savoir quel `L_0` proposer pour un budget donne. Composable : un vault auto-LP peut l'appeler en CPI.

## Taches

### suggest_l_zero.rs
- [ ] Accounts : `market` (readonly)
- [ ] Args : `budget_usdc: u64`, `sigma_bps: u64` (volatilite annuelle en basis points, pour warnings)
- [ ] Calculer `duration_secs = market.end_ts - Clock::get()?.unix_timestamp`
- [ ] Appeler `suggest_l_zero_for_budget(budget_usdc, duration_secs, sigma_bps)` du module pm_math
- [ ] Emettre event `LZeroSuggestion` :
  ```
  suggested_l_zero: u128       // Q64.64
  estimated_pool_value: u64    // en USDC (= budget par construction)
  estimated_daily_lvr: u64     // budget / (2 * duration_days) en USDC/jour
  warning_high_sigma: bool     // si sigma > 200% annuel (20000 bps)
  warning_short_duration: bool // si duration < 1 jour (86400s)
  ```
- [ ] Wirer dans `anchor/programs/pm_amm/src/lib.rs`

### Composabilite
- [ ] Exposer via IDL pour CPI par d'autres programmes
- [ ] Ecrire un snippet TS d'exemple d'integration pour un vault externe

### Tests TS
- [ ] Budget 1000, 7 jours, sigma=5000 bps (50%) → suggested L_0 coherent, `pool_value ~ 1000`
- [ ] Budget 10000, 30 jours → L_0 coherent, `daily_LVR ~ 166`
- [ ] sigma=30000 bps (300%) → `warning_high_sigma = true`
- [ ] duration = 3600 (1h) → `warning_short_duration = true`
- [ ] Verifier round-trip : `suggest_l_zero` → `deposit` avec ce L_0 → `pool_value ~ budget`

## Definition of Done
- Instruction callable, events correctement emis
- Tests verts
- IDL expose pour CPI
