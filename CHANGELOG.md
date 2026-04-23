# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-04-22

### Added

- 10 Anchor instructions: initialize_market, deposit_liquidity, swap, withdraw_liquidity, accrue, claim_lp_residuals, redeem_pair, resolve_market, claim_winnings, suggest_l_zero
- dC_t mechanism for continuous LP yield via per-share accumulators
- Fixed-point math (I80F48) with 2048-point lookup tables for on-chain performance
- Next.js frontend with trading, LP, portfolio, and admin panels
- Metaplex token metadata for YES/NO mints (name + symbol on-chain)
- 197 tests: 49 Rust unit, 18 TypeScript integration, 130 Python oracle
- Python reference oracle with scipy cross-validation
- Price history via Upstash Redis
- Mock USDC faucet for devnet testing
