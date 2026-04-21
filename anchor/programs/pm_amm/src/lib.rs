pub mod accrual;
pub mod errors;
pub mod instructions;
pub mod lut;
pub mod pm_math;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

declare_id!("GQGSTV9dig5fEwcfMpgqHjo9jAhxtnusMEbx8SrBBYnQ");

#[program]
pub mod pm_amm {
    use super::*;

    pub fn initialize_market<'info>(
        ctx: Context<'_, '_, 'info, 'info, InitializeMarket<'info>>,
        market_id: u64,
        end_ts: i64,
        name: String,
    ) -> Result<()> {
        instructions::initialize_market::handler(ctx, market_id, end_ts, name)
    }

    pub fn deposit_liquidity(
        ctx: Context<DepositLiquidity>,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit_liquidity::handler(ctx, amount)
    }

    pub fn swap(
        ctx: Context<Swap>,
        direction: SwapDirection,
        amount_in: u64,
        min_output: u64,
    ) -> Result<()> {
        instructions::swap::handler(ctx, direction, amount_in, min_output)
    }

    pub fn withdraw_liquidity(
        ctx: Context<WithdrawLiquidity>,
        shares_to_burn: u128,
    ) -> Result<()> {
        instructions::withdraw_liquidity::handler(ctx, shares_to_burn)
    }

    pub fn accrue(ctx: Context<Accrue>) -> Result<()> {
        instructions::accrue::handler(ctx)
    }

    pub fn claim_lp_residuals(ctx: Context<ClaimLpResiduals>) -> Result<()> {
        instructions::claim_lp_residuals::handler(ctx)
    }

    pub fn redeem_pair(ctx: Context<RedeemPair>, amount: u64) -> Result<()> {
        instructions::redeem_pair::handler(ctx, amount)
    }

    pub fn suggest_l_zero(
        ctx: Context<SuggestLZero>,
        budget_usdc: u64,
        sigma_bps: u64,
    ) -> Result<()> {
        instructions::suggest_l_zero::handler(ctx, budget_usdc, sigma_bps)
    }

    pub fn resolve_market(ctx: Context<ResolveMarket>, winning_side: Side) -> Result<()> {
        instructions::resolve_market::handler(ctx, winning_side)
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>, amount: u64) -> Result<()> {
        instructions::claim_winnings::handler(ctx, amount)
    }
}
