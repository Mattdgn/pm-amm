# Sprint 2 — Module math `pm_math.rs` (CRITIQUE)

**Duree estimee** : 6h
**Output** : Toutes les fonctions mathematiques Paradigm en fixed-point, testees
**Dependances** : Sprint 1
**Reference** : `doc/wp-para.md` — TOUJOURS verifier chaque formule contre ce document avant d'implementer

## Contexte
Module coeur. Toutes les fonctions du paper Paradigm en fixed-point I80F48.
Tests vs scipy.stats.norm obligatoires.

Formules exactes du paper (dynamic pm-AMM, sections 7 & 8) :
- Invariant : `(y-x)*Phi((y-x)/L_eff) + L_eff*phi((y-x)/L_eff) - y = 0` (section 8)
- Reserves eq.(5) : `x* = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) - Phi_inv(P) }`
- Reserves eq.(6) : `y* = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) }`
- Pool value : `V = L_eff * phi(Phi_inv(P))` (section 7)
- Identite cle : `y - x = L_eff * Phi_inv(P)`
- LVR : `LVR_t = V_t / (2*(T-t))` (section 7)
- beta = 1/2 (solution unique de l'ODE eq.4 avec concavite, section 7)

IMPORTANT : `L_eff` est passe en parametre, jamais `L_0` + `T-t` separement dans les fonctions pool.
IMPORTANT : sigma n'apparait PAS dans la dynamique du prix (section 5 du paper).

## Taches

### Primitives fixed-point
- [ ] Implementer `exp_approx(x: I80F48) -> Result<I80F48>` — Taylor, `x in [-20, 20]`
- [ ] Implementer `sqrt_fixed(x: I80F48) -> Result<I80F48>` — Newton, 8 iterations
- [ ] Implementer `ln_approx(x: I80F48) -> Result<I80F48>` — necessaire pour Acklam

### Fonctions speciales (distribution normale)
- [ ] Implementer `erf_approx(x)` — Abramowitz & Stegun 7.1.26
- [ ] Implementer `phi(z)` — PDF normale standard : `(1/sqrt(2*pi)) * exp(-z^2/2)`
- [ ] Implementer `capital_phi(z)` — CDF : `0.5 * (1 + erf(z/sqrt(2)))`
- [ ] Implementer `capital_phi_inv(p)` — Acklam, `p in [0.0001, 0.9999]`

### Fonctions pool pm-AMM
- [ ] Implementer `price_from_reserves(x, y, l_eff) -> Result<I80F48>` — via identite `y - x = L_eff * Phi_inv(P)`
- [ ] Implementer `reserves_from_price(p, l_eff) -> Result<(I80F48, I80F48)>` — eq. 5 & 6 du paper
- [ ] Implementer `invariant_value(x, y, l_eff) -> Result<I80F48>` — verifie invariant = 0
- [ ] Implementer `pool_value(x, y, l_eff) -> Result<I80F48>` — `V = L_eff * phi(Phi_inv(P))`
- [ ] Implementer `compute_swap_output(x, y, l_eff, delta_in, side_in, side_out) -> Result<SwapResult>`

### Fonction suggest_l_zero
- [ ] Implementer `suggest_l_zero_for_budget(budget_usdc, duration_secs, sigma_bps) -> Result<u128>`
  - Formule : `L_0 = budget / (0.39894 * sqrt(T))`
  - sigma_bps pour info/warnings uniquement (prix invariant en sigma, cf. paper section 5)

### Tests unitaires (cargo test)
- [ ] Test fonctions elementaires : `Phi(0)=0.5`, `Phi(1.96)=0.975`, `phi(0)=0.39894`, `Phi_inv(Phi(x))=x`
- [ ] Test `reserves_from_price(0.5, L_eff=1000)` → `x ~ y ~ 398.94`
- [ ] Test round-trip : `price_from_reserves(reserves_from_price(P, L)) = P`
- [ ] Test invariant : `invariant_value(x*(P), y*(P), L_eff) ~ 0` pour P in {0.1, 0.3, 0.5, 0.7, 0.9}
- [ ] Test swap round-trip : loss <= 0.1%
- [ ] Test `suggest_l_zero` : budget=1000, duration=86400*7 → verifier `V(0.5, 0) ~ 1000`
- [ ] Logger bench CU pour chaque fonction critique

## Definition of Done
- `cargo test --package pm_amm pm_math` vert
- Tolerance tests 1e-7
- Aucune panic, `unwrap` safe uniquement
- CU documente en commentaire
- Fallback CU prevu : lookup table pour Phi_inv (feature flag `acklam-lut`)
