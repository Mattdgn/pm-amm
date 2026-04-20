# Sprint 3 — Scaffold Anchor (structs + PDAs + init_market)

**Duree estimee** : 3h
**Output** : Structs on-chain, PDAs, instruction initialize_market
**Dependances** : Sprint 1
**Reference** : `doc/wp-para.md` (notations x, y, L, P, V du paper)

## Contexte
Structs on-chain v3. Un seul vault USDC. Fields `cum_yes_per_share` et `cum_no_per_share` pour mecanisme dC_t redistribution. Pas de `withdrawn_vault`.

## Taches

### state.rs — Structs on-chain
- [ ] Implementer struct `Market` (PDA seeds `[b"market", market_id.to_le_bytes()]`) :
  - `authority`, `collateral_mint`, `yes_mint`, `no_mint`, `vault`
  - `start_ts`, `end_ts`
  - `l_zero: u128`, `reserve_yes: u128`, `reserve_no: u128` (Q64.64)
  - `last_accrual_ts`, `cum_yes_per_share: u128`, `cum_no_per_share: u128`
  - `total_yes_distributed: u64`, `total_no_distributed: u64`
  - `total_lp_shares: u128`
  - `resolved: bool`, `winning_side: Option<Side>`
  - `bump: u8`
- [ ] Implementer struct `Position` (PDA seeds `[b"position", market.key(), owner.key()]`) :
  - `owner`, `market`, `yes_tokens: u64`, `no_tokens: u64`, `bump`
- [ ] Implementer struct `LpPosition` (PDA seeds `[b"lp", market.key(), owner.key()]`) :
  - `owner`, `market`, `shares: u128`, `collateral_deposited: u64`
  - `yes_per_share_checkpoint: u128`, `no_per_share_checkpoint: u128`, `bump`
- [ ] Implementer enum `Side { Yes, No }`

### Helpers Market
- [ ] `l_zero_fixed(&self) -> I80F48`
- [ ] `l_effective(&self, now: i64) -> Result<I80F48>` — `L_0 * sqrt(end_ts - now)`
- [ ] `reserve_yes_fixed(&self) -> I80F48`
- [ ] `reserve_no_fixed(&self) -> I80F48`
- [ ] `cum_yes_per_share_fixed(&self) -> I80F48`
- [ ] `cum_no_per_share_fixed(&self) -> I80F48`

### errors.rs
- [ ] Implementer `PmAmmError` enum avec tous les codes d'erreur :
  `MarketAlreadyResolved`, `MarketNotResolved`, `MarketExpired`, `MarketNotExpired`,
  `InsufficientLiquidity`, `SlippageExceeded`, `Unauthorized`, `InvalidPrice`,
  `MathOverflow`, `ConvergenceFailed`, `AccrualFailed`, `NoResidualsToClaim`,
  `InvalidDuration`, `InvalidBudget`

### initialize_market.rs
- [ ] Accounts : authority, market (init PDA), collateral_mint, yes_mint (init), no_mint (init), vault (init ATA), token programs
- [ ] Args : `market_id: u64`, `end_ts: i64`
- [ ] Logic : init mints decimals 6, vault token account, `last_accrual_ts = Clock::get().unix_timestamp`, cumules a 0
- [ ] Check : `end_ts > start_ts + 3600` (au moins 1h)
- [ ] Wirer dans `lib.rs`

### Test TS
- [ ] Ecrire test TS `initialize_market` : creer un market, verifier state post-creation (all fields)

## Definition of Done
- `anchor build` passe
- Test TS init_market vert
- State post-creation conforme au PRD section 2.2
