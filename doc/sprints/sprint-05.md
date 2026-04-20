# Sprint 5 — Core instructions (deposit / swap / withdraw)

**Duree estimee** : 7h
**Output** : 3 instructions Anchor fonctionnelles avec accrue integre
**Dependances** : Sprint 2, Sprint 3, Sprint 4
**Reference** : `doc/wp-para.md` — verifier invariant apres chaque operation

## Contexte
3 ix : deposit, swap, withdraw. Chacune appelle `accrue_first` en premier. Accrue ne fait que du state update (pas de transfers de tokens).

## Taches

### deposit_liquidity.rs
- [ ] Definir struct Accounts `DepositLiquidity` : signer, market, collateral_mint, vault, lp_position (init_if_needed), system_program, token_program
- [ ] Accrue first
- [ ] Check `now < end_ts`
- [ ] Si premier LP (total_lp_shares == 0) :
  - Bootstrap `L_0 = collateral / (0.39894 * sqrt(T-t))`
  - Reserves initiales `x = y = collateral / 2` (a P=0.5)
  - Shares = collateral_amount
- [ ] Sinon :
  - Calculer pool value courant via `pool_value()`
  - `new_shares = collateral * total_shares / pool_value`
  - Augmenter `L_0` proportionnellement, recalculer `x, y` en gardant P constant
- [ ] Transfer USDC user → vault via CPI
- [ ] Update/create `LpPosition` avec checkpoints = current `cum_yes/no_per_share`
- [ ] Edge case : deposit apres `end_ts` → revert `MarketExpired`

### swap.rs
- [ ] Definir struct Accounts `Swap` : signer, market, yes_mint, no_mint, vault, collateral_mint, user token accounts, position (init_if_needed), token_program
- [ ] Accrue first
- [ ] Calculer `L_eff` avec `now` post-accrual
- [ ] Appeler `compute_swap_output` de pm_math
- [ ] Slippage check : `output >= min_output` sinon revert `SlippageExceeded`
- [ ] Selon side_in/side_out :
  - `USDC → YES` : transfer USDC user→vault, mint YES au user
  - `USDC → NO` : idem NO
  - `YES → USDC` : burn YES user, transfer USDC vault→user
  - `NO → USDC` : idem
  - `YES → NO` / `NO → YES` : burn + mint
- [ ] Update reserves dans Market
- [ ] Update Position user (yes_tokens, no_tokens)

### withdraw_liquidity.rs
- [ ] Definir struct Accounts `WithdrawLiquidity` : signer, market, lp_position, yes_mint, no_mint, user yes/no ATAs, token_program
- [ ] Accrue first (crucial pour credits a jour)
- [ ] Auto-claim residuels pending (compute_lp_pending, mint si > 0) — pour UX simple
- [ ] Calculer share fraction : `shares_to_burn / total_shares`
- [ ] Le LP recupere :
  - `share_fraction * reserve_yes` tokens YES (mint to user)
  - `share_fraction * reserve_no` tokens NO (mint to user)
  - Pas de USDC direct
- [ ] Reduire `L_0` proportionnellement
- [ ] Update `Market.total_lp_shares`, reserves
- [ ] Burn `LpPosition.shares`
- [ ] Update checkpoints

### Tests TS — scenario complet
- [ ] Test scenario :
  1. Alice init market (7 jours)
  2. Alice deposit 1000 USDC → 1000 shares, `L_0` calibre, `V(0.5, 0) = 1000`
  3. Bob swap 100 USDC → ~199 YES — verifier reserves, prix, position
  4. Warp 1 jour → accrual auto au prochain swap
  5. Charlie swap 50 USDC → NO — verifier accrual s'est fait
  6. Verifier `cum_yes_per_share > 0` et `cum_no_per_share > 0`
  7. Alice withdraw 50% → recupere ~500 USDC equiv en YES+NO
- [ ] Test edge : deposit apres end_ts → revert
- [ ] Test edge : swap avec slippage trop strict → revert

## Definition of Done
- Scenario complet passe (7 etapes)
- Slippage check fonctionnel
- Accrue integre dans chaque ix
- Invariant AMM verifie apres chaque operation
