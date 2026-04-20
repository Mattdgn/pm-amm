//! Initialize a new prediction market.
//! Creates Market PDA, YES/NO mints (decimals 6), and USDC vault.

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::PmAmmError;
use crate::state::Market;

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Market::LEN,
        seeds = [Market::SEED, market_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub market: Account<'info, Market>,

    /// The collateral mint (USDC or mock, decimals 6).
    pub collateral_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = market,
    )]
    pub yes_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = market,
    )]
    pub no_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = collateral_mint,
        token::authority = market,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeMarket>,
    market_id: u64,
    end_ts: i64,
) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // Must be at least 1 hour in the future
    require!(
        end_ts > now + 3600,
        PmAmmError::InvalidDuration
    );

    let market = &mut ctx.accounts.market;

    market.authority = ctx.accounts.authority.key();
    market.market_id = market_id;
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.yes_mint = ctx.accounts.yes_mint.key();
    market.no_mint = ctx.accounts.no_mint.key();
    market.vault = ctx.accounts.vault.key();

    market.start_ts = now;
    market.end_ts = end_ts;

    // AMM starts empty — deposit will bootstrap L_0
    market.l_zero = 0;
    market.reserve_yes = 0;
    market.reserve_no = 0;

    // Accrual
    market.last_accrual_ts = now;
    market.cum_yes_per_share = 0;
    market.cum_no_per_share = 0;

    // Stats
    market.total_yes_distributed = 0;
    market.total_no_distributed = 0;

    // LP
    market.total_lp_shares = 0;

    // Resolution
    market.resolved = false;
    market.winning_side = 0; // unresolved

    market.bump = ctx.bumps.market;

    msg!(
        "Market {} initialized: end_ts={}, authority={}",
        market_id,
        end_ts,
        market.authority
    );

    Ok(())
}
