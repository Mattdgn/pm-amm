//! Permissionless accrue instruction. Anyone can call to trigger dC_t accrual.

use anchor_lang::prelude::*;

use crate::accrual;
use crate::state::Market;

#[derive(Accounts)]
pub struct Accrue<'info> {
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
}

pub fn handler(ctx: Context<Accrue>) -> Result<()> {
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;

    let result = accrual::compute_accrual(market, clock.unix_timestamp)?;
    accrual::apply_accrual(market, &result);

    if !result.is_noop {
        let yr: f64 = result.yes_released.to_num();
        let nr: f64 = result.no_released.to_num();
        msg!("Accrued: yes={}, no={}", yr as u64, nr as u64);
    }

    Ok(())
}
