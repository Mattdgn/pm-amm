//! Claim winnings: burn winning-side tokens for 1 USDC each.
//! Only callable after market is resolved.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::PmAmmError;
use crate::state::{Market, Side};

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    pub signer: Signer<'info>,

    #[account(
        has_one = vault,
        has_one = collateral_mint,
    )]
    pub market: Box<Account<'info, Market>>,

    pub collateral_mint: Account<'info, Mint>,

    /// The winning side's mint (YES or NO depending on resolution).
    #[account(mut)]
    pub winning_mint: Account<'info, Mint>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    /// User's winning token account.
    #[account(
        mut,
        constraint = user_winning.mint == winning_mint.key(),
        constraint = user_winning.owner == signer.key(),
    )]
    pub user_winning: Account<'info, TokenAccount>,

    /// User's USDC token account.
    #[account(
        mut,
        constraint = user_collateral.mint == market.collateral_mint,
        constraint = user_collateral.owner == signer.key(),
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimWinnings>, amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;

    require!(market.resolved, PmAmmError::MarketNotResolved);
    require!(amount > 0, PmAmmError::InvalidBudget);

    // Verify the winning_mint matches the resolved winning side
    let expected_mint = match market.get_winning_side() {
        Some(Side::Yes) => market.yes_mint,
        Some(Side::No) => market.no_mint,
        None => return err!(PmAmmError::MarketNotResolved),
    };
    require!(
        ctx.accounts.winning_mint.key() == expected_mint,
        PmAmmError::Unauthorized
    );

    // Check user has enough winning tokens
    require!(
        ctx.accounts.user_winning.amount >= amount,
        PmAmmError::InsufficientLiquidity
    );
    // Check vault has enough USDC
    require!(
        ctx.accounts.vault.amount >= amount,
        PmAmmError::InsufficientLiquidity
    );

    let market_id_bytes = market.market_id.to_le_bytes();
    let bump = market.bump;
    let seeds: &[&[&[u8]]] = &[&[Market::SEED, market_id_bytes.as_ref(), &[bump]]];
    let tp = ctx.accounts.token_program.to_account_info();

    // Burn winning tokens
    token::burn(
        CpiContext::new(
            tp.clone(),
            Burn {
                mint: ctx.accounts.winning_mint.to_account_info(),
                from: ctx.accounts.user_winning.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        amount,
    )?;

    // Transfer USDC vault → user (1 winning token = 1 USDC)
    token::transfer(
        CpiContext::new_with_signer(
            tp,
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_collateral.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            seeds,
        ),
        amount,
    )?;

    msg!("Claimed {} USDC for {} winning tokens", amount, amount);

    Ok(())
}
