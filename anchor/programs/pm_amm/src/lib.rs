// Anchor's #[program] macro generates code that triggers these lints
// Anchor 1.0 #[program] macro generates unexpected cfgs
#![allow(unexpected_cfgs)]

// Anchor's #[program] macro and generated LUT code trigger these clippy lints
#![allow(
    clippy::diverging_sub_expression,
    clippy::too_many_arguments,
    clippy::assign_op_pattern,
    clippy::manual_range_contains,
    clippy::excessive_precision,
    clippy::unreadable_literal,
    clippy::large_const_arrays,
    clippy::wrong_self_convention
)]

//! # pm-AMM — Paradigm Dynamic AMM for Prediction Markets
//!
//! Faithful implementation of the pm-AMM paper by Moallemi & Robinson (Paradigm, Nov 2024).
//! Uses a time-decaying liquidity function `L_eff = L_0 * sqrt(T - t)` to achieve
//! uniform LVR in both price and time, with continuous LP yield via the dC_t mechanism.
//!
//! See: <https://www.paradigm.xyz/2024/11/pm-amm>

pub mod accrual;
pub mod errors;
pub mod instructions;
pub mod lut;
pub mod pm_math;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

declare_id!("8V872cTKfH1gC5zBvQhrQN2DXSmRNokPPjPsBE46MZNj");

#[program]
pub mod pm_amm {
    use super::*;

    /// Create a new prediction market with YES/NO mints, a USDC vault,
    /// and Metaplex token metadata for wallet display.
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        market_id: u64,
        end_ts: i64,
        name: String,
    ) -> Result<()> {
        instructions::initialize_market::handler(ctx, market_id, end_ts, name)
    }

    /// Deposit USDC as liquidity. First deposit bootstraps L_0 at 50/50 price.
    /// Subsequent deposits scale L_0 proportionally to preserve the current price.
    pub fn deposit_liquidity(
        ctx: Context<DepositLiquidity>,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit_liquidity::handler(ctx, amount)
    }

    /// Swap between USDC, YES, and NO tokens (6 directions).
    /// Updates reserves and enforces the pm-AMM invariant.
    pub fn swap(
        ctx: Context<Swap>,
        direction: SwapDirection,
        amount_in: u64,
        min_output: u64,
    ) -> Result<()> {
        instructions::swap::handler(ctx, direction, amount_in, min_output)
    }

    /// Withdraw LP shares: auto-claims pending residuals, then mints
    /// proportional YES+NO tokens from the pool reserves.
    pub fn withdraw_liquidity(
        ctx: Context<WithdrawLiquidity>,
        shares_to_burn: u128,
    ) -> Result<()> {
        instructions::withdraw_liquidity::handler(ctx, shares_to_burn)
    }

    /// Permissionless dC_t accrual. Anyone can trigger to release tokens
    /// from the pool as L_eff decreases over time.
    pub fn accrue(ctx: Context<Accrue>) -> Result<()> {
        instructions::accrue::handler(ctx)
    }

    /// Claim pending YES+NO residuals accrued to an LP position.
    /// Allowed at any time, including after resolution.
    pub fn claim_lp_residuals(ctx: Context<ClaimLpResiduals>) -> Result<()> {
        instructions::claim_lp_residuals::handler(ctx)
    }

    /// Burn 1 YES + 1 NO to receive 1 USDC. Always valid, pre- or post-resolution.
    pub fn redeem_pair(ctx: Context<RedeemPair>, amount: u64) -> Result<()> {
        instructions::redeem_pair::handler(ctx, amount)
    }

    /// View-only: compute the optimal L_0 for a given USDC budget.
    /// Emits a `LZeroSuggestion` event. Composable via CPI for auto-LP vaults.
    pub fn suggest_l_zero(
        ctx: Context<SuggestLZero>,
        budget_usdc: u64,
        sigma_bps: u64,
    ) -> Result<()> {
        instructions::suggest_l_zero::handler(ctx, budget_usdc, sigma_bps)
    }

    /// Resolve the market after expiration. Authority-only.
    /// Triggers final accrual and sets the winning side.
    pub fn resolve_market(ctx: Context<ResolveMarket>, winning_side: Side) -> Result<()> {
        instructions::resolve_market::handler(ctx, winning_side)
    }

    /// Burn all user tokens (winning + losing), pay winning side at 1 USDC each.
    /// Only callable post-resolution. Burns both sides atomically.
    pub fn claim_winnings(ctx: Context<ClaimWinnings>, amount: u64) -> Result<()> {
        instructions::claim_winnings::handler(ctx, amount)
    }
}
