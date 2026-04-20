# Sprint 6 — LP residuals flow (accrue + claim + redeem_pair)

**Duree estimee** : 3h
**Output** : 3 nouvelles instructions : accrue, claim_lp_residuals, redeem_pair
**Dependances** : Sprint 5
**Reference** : `doc/wp-para.md` section 8 — processus dC_t et W_t = V_t + C_t

## Contexte
3 ix : `accrue` permissionless (keeper), `claim_lp_residuals` (LP claim ses YES+NO), `redeem_pair` (1 YES + 1 NO = 1 USDC).

## Taches

### accrue.rs (instruction permissionless)
- [ ] Accounts : market (mut), pas de signer special
- [ ] Args : aucun
- [ ] Logic : `accrue_first(market)` + emit event avec deltas (yes_released, no_released)
- [ ] CU cible : <50k

### claim_lp_residuals.rs
- [ ] Accounts : signer (lp.owner), market (mut), lp_position (mut), yes_mint, no_mint, user yes/no ATAs, token_program
- [ ] Accrue first (pour inclure les derniers dC_t)
- [ ] Calculer `(pending_yes, pending_no) = compute_lp_pending(lp, market)`
- [ ] Revert `NoResidualsToClaim` si both == 0
- [ ] Mint `pending_yes` YES tokens au user (authority = market PDA)
- [ ] Mint `pending_no` NO tokens au user (authority = market PDA)
- [ ] Update checkpoints : `lp.yes_per_share_checkpoint = market.cum_yes_per_share`, idem NO
- [ ] Emit event `LpResidualsClaimed { lp, yes_amount, no_amount }`

### redeem_pair.rs
- [ ] Accounts : signer (holder), market, yes_mint, no_mint, vault, user yes/no/usdc ATAs, token_program
- [ ] Args : `amount: u64`
- [ ] Check : user a >= `amount` YES et >= `amount` NO
- [ ] Burn `amount` YES et `amount` NO
- [ ] Transfer `amount` USDC vault → user (1 pair = 1 USDC)
- [ ] Emit event `PairRedeemed { user, amount }`
- [ ] Note : ne touche PAS les reserves du pool

### Tests TS
- [ ] Test "LP patient" : Alice LP jour 0, warp 3 jours, call accrue, claim residuels → recoit YES+NO non-trivial, puis redeem_pair partiel pour USDC
- [ ] Test "Multi-LP pro-rata" : Alice LP 1000 jour 0, Bob LP 1000 jour 2. Warp 3 jours. Alice claim > Bob claim (proportionnel au temps)
- [ ] Test "Redeem pair" : user avec 10 YES + 10 NO → redeem 10 → recupere 10 USDC, balances a 0
- [ ] Test "Redeem partial" : user avec 10 YES + 5 NO → redeem 5 → OK, reste 5 YES et 0 NO
- [ ] Test "Claim sans residuels" → revert NoResidualsToClaim

## Definition of Done
- Tous tests verts
- Flow complet : LP deposit → wait → accrue → claim YES+NO → redeem_pair → USDC
- Events emis correctement
