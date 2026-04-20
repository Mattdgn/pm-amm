pub mod accrual;
pub mod errors;
pub mod instructions;
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
}
