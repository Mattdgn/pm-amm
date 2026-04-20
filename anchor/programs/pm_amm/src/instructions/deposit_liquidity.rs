//! Deposit USDC liquidity into a market. Bootstraps L_0 on first deposit.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use fixed::types::I80F48;

use crate::accrual;
use crate::errors::PmAmmError;
use crate::pm_math;
use crate::state::{LpPosition, Market};

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        has_one = collateral_mint,
        has_one = vault,
    )]
    pub market: Account<'info, Market>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_collateral.mint == market.collateral_mint,
        constraint = user_collateral.owner == signer.key(),
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = signer,
        space = LpPosition::LEN,
        seeds = [LpPosition::SEED, market.key().as_ref(), signer.key().as_ref()],
        bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    require!(amount > 0, PmAmmError::InvalidBudget);

    // --- Phase 1: Mutations on market (scoped borrow) ---
    let new_shares: I80F48;
    {
        let market = &mut ctx.accounts.market;
        require!(now < market.end_ts, PmAmmError::MarketExpired);

        accrual::accrue_first(market, now)?;

        let amount_fixed = I80F48::from_num(amount);
        let time_remaining = market.end_ts - now;

        if market.total_lp_shares == 0 {
            let l_zero = pm_math::suggest_l_zero_for_budget(amount, time_remaining)?;
            let l_eff = pm_math::l_effective(l_zero, time_remaining)?;
            let (x, y) = pm_math::reserves_from_price(I80F48::from_num(0.5), l_eff)?;

            new_shares = amount_fixed;
            market.set_l_zero_fixed(l_zero);
            market.set_reserve_yes_fixed(x);
            market.set_reserve_no_fixed(y);
            market.set_total_lp_shares_fixed(amount_fixed);
        } else {
            let l_eff = market.l_effective(now)?;
            let price = pm_math::price_from_reserves(
                market.reserve_yes_fixed(), market.reserve_no_fixed(), l_eff,
            )?;
            let current_value = pm_math::pool_value(price, l_eff)?;
            require!(current_value > I80F48::ZERO, PmAmmError::InsufficientLiquidity);

            let total_shares = market.total_lp_shares_fixed();
            new_shares = amount_fixed * total_shares / current_value;
            let new_total = total_shares + new_shares;

            let old_l_zero = market.l_zero_fixed();
            let scale = new_total / total_shares;
            let new_l_zero = old_l_zero * scale;
            let new_l_eff = pm_math::l_effective(new_l_zero, time_remaining)?;
            let (x, y) = pm_math::reserves_from_price(price, new_l_eff)?;

            market.set_l_zero_fixed(new_l_zero);
            market.set_reserve_yes_fixed(x);
            market.set_reserve_no_fixed(y);
            market.set_total_lp_shares_fixed(new_total);
        }
    }
    // market mutable borrow dropped here

    // --- Phase 2: CPI transfer ---
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_collateral.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        amount,
    )?;

    // --- Phase 3: Update LP position ---
    let lp = &mut ctx.accounts.lp_position;
    if lp.owner == Pubkey::default() {
        lp.owner = ctx.accounts.signer.key();
        lp.market = ctx.accounts.market.key();
        lp.bump = ctx.bumps.lp_position;
    }

    let old_shares = I80F48::from_bits(lp.shares as i128);
    lp.shares = (old_shares + new_shares).to_bits() as u128;
    lp.collateral_deposited = lp.collateral_deposited.saturating_add(amount);
    lp.yes_per_share_checkpoint = ctx.accounts.market.cum_yes_per_share;
    lp.no_per_share_checkpoint = ctx.accounts.market.cum_no_per_share;

    Ok(())
}
