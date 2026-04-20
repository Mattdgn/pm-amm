//! View instruction: compute suggested L_0 for a given budget.
//! Non-mutative — emits an event with the suggestion and warnings.
//! Composable: other programs can CPI this to calibrate auto-LP vaults.

use anchor_lang::prelude::*;
use fixed::types::I80F48;

use crate::errors::PmAmmError;
use crate::pm_math;
use crate::state::Market;

#[derive(Accounts)]
pub struct SuggestLZero<'info> {
    pub market: Account<'info, Market>,
}

#[event]
pub struct LZeroSuggestion {
    pub market: Pubkey,
    pub suggested_l_zero: u128, // Q64.64
    pub estimated_pool_value: u64, // USDC (= budget by construction)
    pub estimated_daily_lvr: u64, // budget / (2 * duration_days)
    pub warning_high_sigma: bool, // sigma > 200% annualized (20000 bps)
    pub warning_short_duration: bool, // duration < 1 day
}

pub fn handler(
    ctx: Context<SuggestLZero>,
    budget_usdc: u64,
    sigma_bps: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let market = &ctx.accounts.market;

    require!(budget_usdc > 0, PmAmmError::InvalidBudget);
    require!(!market.resolved, PmAmmError::MarketAlreadyResolved);

    let duration_secs = market.end_ts - now;
    require!(duration_secs > 0, PmAmmError::MarketExpired);

    // Compute L_0
    let l_zero = pm_math::suggest_l_zero_for_budget(budget_usdc, duration_secs)?;
    let l_zero_bits = l_zero.to_bits() as u128;

    // Estimated daily LVR = budget / (2 * duration_days)
    let duration_days = duration_secs as f64 / 86400.0;
    let daily_lvr = if duration_days > 0.0 {
        (budget_usdc as f64 / (2.0 * duration_days)) as u64
    } else {
        0
    };

    // Warnings
    let warning_high_sigma = sigma_bps > 20000; // > 200% annualized
    let warning_short_duration = duration_secs < 86400; // < 1 day

    emit!(LZeroSuggestion {
        market: market.key(),
        suggested_l_zero: l_zero_bits,
        estimated_pool_value: budget_usdc, // V(0.5) = budget by construction
        estimated_daily_lvr: daily_lvr,
        warning_high_sigma,
        warning_short_duration,
    });

    Ok(())
}
