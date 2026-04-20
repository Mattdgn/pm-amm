# Sprint 7 — Resolve + claim winnings

**Duree estimee** : 2h
**Output** : Resolution du market et claim des gains
**Dependances** : Sprint 6

## Contexte
Cloture du lifecycle : l'authority resolve le market, les detenteurs de tokens gagnants claim 1 USDC/token.

## Taches

### resolve_market.rs
- [ ] Accounts : signer (market.authority), market (mut)
- [ ] Accrue first (capture le dernier dt jusqu'a end_ts)
- [ ] Check `now >= end_ts` sinon revert `MarketNotExpired`
- [ ] Check signer == market.authority sinon revert `Unauthorized`
- [ ] Set `resolved = true`, `winning_side = Some(side)`
- [ ] Emit event `MarketResolved { market, winning_side }`

### claim_winnings.rs
- [ ] Accounts : signer, market, winning_mint, vault, user winning token ATA, user USDC ATA, token_program
- [ ] Check `market.resolved` sinon revert `MarketNotResolved`
- [ ] Determiner le mint gagnant selon `winning_side`
- [ ] User burn ses tokens du winning side (amount au choix du user)
- [ ] Transfer `amount` USDC vault → user (1 token gagnant = 1 USDC)
- [ ] Emit event `WinningsClaimed { user, amount, side }`

### Tests TS
- [ ] Test happy path : create → deposit → swaps → warp past end_ts → resolve YES → holder YES claim → USDC recu
- [ ] Test resolve avant end_ts → revert MarketNotExpired
- [ ] Test resolve par non-authority → revert Unauthorized
- [ ] Test claim avant resolve → revert MarketNotResolved
- [ ] Test edge : LP qui n'a pas claim residuels avant resolve → peut claim apres resolve, recevoir YES+NO, puis claim_winnings sur side gagnant
- [ ] Test edge : redeem_pair reste possible apres resolve (user avec YES+NO peut redeem au lieu de claim)
- [ ] Test : vault balance >= sum(winning_claims) (no-arbitrage invariant)

## Definition of Done
- Scenario TS complet jusqu'a resolve + claims vert
- Tous edge cases couverts
- Invariant no-arbitrage verifie : `sum(winning_claims) <= vault_balance`
