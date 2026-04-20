pub mod accrual;
pub mod errors;
pub mod instructions;
pub mod pm_math;
pub mod state;

use anchor_lang::prelude::*;

declare_id!("GQGSTV9dig5fEwcfMpgqHjo9jAhxtnusMEbx8SrBBYnQ");

#[program]
pub mod pm_amm {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
