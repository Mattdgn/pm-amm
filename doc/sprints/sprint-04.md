# Sprint 4 — Module `accrual.rs` v3

**Duree estimee** : 5h
**Output** : Mecanisme dC_t complet avec redistribution YES+NO aux LPs
**Dependances** : Sprint 2, Sprint 3
**Reference** : `doc/wp-para.md` section 8 (Dynamic pm-AMM, processus dC_t)

## Contexte
Module critique. Implemente le mecanisme `dC_t` du paper (section 8) :
- `dC_t = -(L_dot_t / L_t) * V_t * dt` — valeur retiree du pool
- `W_t = V_t + C_t` — wealth totale LP = pool + cumul retraits
- `E[W_T] = W_0 / 2` — propriete a verifier en test

Version v3 simplifiee : pas de token transfers dans accrual. Les tokens YES/NO sont virtuels jusqu'au claim LP. L'algorithme calcule les tokens YES et NO "liberes" quand L_eff decroit, et les credite via accumulateurs per-share.

## Taches

### compute_accrual
- [ ] Implementer `AccrualResult` struct avec : `yes_released`, `no_released`, `new_reserve_yes`, `new_reserve_no`, `new_cum_yes_per_share`, `new_cum_no_per_share`, `new_last_accrual_ts`
- [ ] Implementer `compute_accrual(market, now) -> Result<AccrualResult>` :
  - Cas de base : market resolved → noop
  - Clamper now a end_ts
  - Calculer dt, si <= 0 → noop
  - Calculer `l_eff_old = L_0 * sqrt(t_rem_old)` et `l_eff_new = L_0 * sqrt(t_rem_new)`
  - Prix courant via `price_from_reserves(x, y, l_eff_old)`
  - Nouvelles reserves au prix constant : `reserves_from_price(P, l_eff_new)`
  - Tokens liberes : `delta_x = x_old - x_new`, `delta_y = y_old - y_new` (max 0)
  - Distribution per-share si `total_lp_shares > 0`
- [ ] Implementer `apply_accrual(market, result)` — applique le resultat au state
- [ ] Implementer `AccrualResult::noop(market)` — retourne un resultat sans changement

### compute_lp_pending
- [ ] Implementer `compute_lp_pending(lp, market) -> (u64, u64)` :
  - `pending_yes = (cum_yes_per_share - checkpoint_yes) * shares / SCALE`
  - `pending_no = (cum_no_per_share - checkpoint_no) * shares / SCALE`

### Helper accrue_first
- [ ] Implementer `accrue_first(market) -> Result<()>` — pattern commun pour toutes les ix mutatives

### Tests unitaires (9 tests obligatoires)
- [ ] Test 1 — Sanity : market P=0.5, 1 LP 1000 shares, dt=1 jour → `yes_released > 0`, `no_released > 0`, valeur USDC equiv coherente avec `V_t/(2(T-t))*dt`
- [ ] Test 2 — No-op : deux appels consecutifs, deuxieme retourne `yes_released = no_released = 0`
- [ ] Test 3 — Conservation stricte : somme tokens liberes sur market complet → valeur totale `~ V_0/2` en USDC equiv (tolerance 3%)
- [ ] Test 4 — Prix inchange : apres accrual, `price_from_reserves(new_x, new_y, l_eff_new) == P_old` (tolerance 1e-6)
- [ ] Test 5 — Invariant preserve : `invariant_value(new_x, new_y, l_eff_new) ~ 0`
- [ ] Test 6 — Edge case T-t=0 : `L_eff_new = 0`, toute la liquidite liberee
- [ ] Test 7 — Prix extremes P=0.05 et P=0.95 : accrual fonctionne, ratio coherent
- [ ] Test 8 — Asymetrie : a P=0.7, `no_released > yes_released` (pool a plus de NO)
- [ ] Test 9 — Petite duree : dt=1 seconde, accrual minuscule mais non-zero

### Tests compute_lp_pending
- [ ] LP avec 0 shares → pending = (0, 0)
- [ ] LP avec checkpoint a jour → pending = (0, 0)
- [ ] LP avec checkpoint en retard → pending coherent

## Definition of Done
- 9 tests accrual verts + 3 tests compute_lp_pending
- Conservation a 3% tolerance
- CU cible : <40k pour compute_accrual
