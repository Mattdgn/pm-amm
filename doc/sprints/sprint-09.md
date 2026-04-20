# Sprint 9 — Tests complets (proprietes + robustesse)

**Duree estimee** : 7h
**Output** : Suite de tests TS validant la fidelite au paper Paradigm
**Dependances** : Sprint 1-8 (tous)
**Reference** : `doc/wp-para.md` — chaque test de propriete mappe a une equation du paper

## Contexte
La suite de tests qui VALIDE la fidelite au paper. Chaque propriete testee doit etre traceable a une equation specifique du paper (voir table "Resume des equations cles" dans `doc/wp-para.md`).

Trois categories : fonctionnel, proprietes Paradigm, robustesse hors-modele.

## Taches

### Tests fonctionnels (`anchor/tests/functional.ts`)
- [ ] Happy path complet : init → deposit → swap → accrue → claim → resolve → claim_winnings
- [ ] Stress : 100 swaps random, invariant OK apres chaque
- [ ] Scale : 0.01 USDC → 10k USDC meme pool
- [ ] Near-expiry : warp a end_ts - 1h, swap, accrual fonctionne
- [ ] Edge cases : tous les revert cases (MarketExpired, SlippageExceeded, Unauthorized, etc.)

### Tests proprietes Paradigm (`anchor/tests/paradigm_properties.ts`)

- [ ] **Test A — Uniform LVR en prix** (paper section 7 : `LVR_t = V_t / (2*(T-t))`) :
  Pour P in {0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9} :
  Setup pool a ce prix avec L_0 fixe, mesurer LVR instantane sur petit dt.
  Ratio LVR/V doit etre ~constant (std < 5% across prices)

- [ ] **Test B — Constant E[LVR] dans le temps** (paper section 8 : `E[LVR_t] = V_0 / (2T)`) :
  Pour t in {T/10, T/4, T/2, 3T/4, 9T/10} :
  Monte Carlo 50 runs : setup market, random walk P, mesurer LVR cumule a ce t.
  E[LVR(t)] doit etre ~constant (std < 10%)

- [ ] **Test C — Conservation E[W_T] = W_0/2** (paper section 8 : `W_bar_T = W_0/2`) :
  Monte Carlo 100 runs : init market W_0=1000, random walk prix, a chaque step accrual + track residuels.
  A T : `E[sum(residuels) + V_T] ~ W_0/2` (tolerance 5%)

### Tests robustesse hors-modele (`anchor/tests/robustness.ts`)

- [ ] **Test D — Jump deterministe** :
  Market P=0.5, V=1000, T-t=7 jours. Trade massif P 0.5→0.9 en une tx.
  Verifier : invariant ~ 0 (1e-5), slippage coherent, pool value decroit mais != 0, aucun revert/overflow

- [ ] **Test E — Monte Carlo avec jumps** :
  100 runs : a chaque step 80% petit mouvement gaussien, 20% jump +-20%.
  Logger LVR effectif vs theorique gaussien.
  Attendu : jumps augmentent LVR de 30-50% — documenter l'ecart

### Tests suggest_l_zero
- [ ] Correctness : L_0 produit pool_value ~ budget
- [ ] Warnings : actives selon seuils
- [ ] CPI compatibility : programme de test appelle en CPI (si faisable en localnet)

## Definition of Done
- Tous tests verts
- Proprietes Paradigm verifiees dans les tolerances specifiees (A: 5%, B: 10%, C: 5%)
- Tests robustesse documentent l'ecart hors-modele (valeurs a inclure dans README)
- Rapport de test avec tolerances mesurees
