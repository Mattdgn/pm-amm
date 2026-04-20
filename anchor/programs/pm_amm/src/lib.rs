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

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        market_id: u64,
        end_ts: i64,
    ) -> Result<()> {
        instructions::initialize_market::handler(ctx, market_id, end_ts)
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
}
