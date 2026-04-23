//! Permissionless accrue instruction. Anyone can call to trigger dC_t accrual.

use anchor_lang::prelude::*;

use crate::accrual;
use crate::state::Market;

#[derive(Accounts)]
pub struct Accrue<'info> {
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
}

/// Permissionless accrual — anyone can trigger dC_t redistribution.
pub fn handler(ctx: Context<Accrue>) -> Result<()> {
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;

    let result = accrual::compute_accrual(market, clock.unix_timestamp)?;
    accrual::apply_accrual(market, &result);

    if !result.is_noop {
        let yr: u64 = result.yes_released.saturating_to_num();
        let nr: u64 = result.no_released.saturating_to_num();
        msg!("Accrued: yes={}, no={}", yr, nr);
    }

    Ok(())
}
