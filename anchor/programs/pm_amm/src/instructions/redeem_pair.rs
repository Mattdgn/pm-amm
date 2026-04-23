//! Redeem 1 YES + 1 NO = 1 USDC. Does not touch pool reserves.
//! Allowed at any time (pre/post resolution) — 1 pair always = 1 USDC.
//! No accrual needed since reserves are not modified.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::PmAmmError;
use crate::state::Market;

#[derive(Accounts)]
pub struct RedeemPair<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        has_one = yes_mint,
        has_one = no_mint,
        has_one = vault,
        has_one = collateral_mint,
    )]
    pub market: Box<Account<'info, Market>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub yes_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub no_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(mut, constraint = user_yes.mint == market.yes_mint, constraint = user_yes.owner == signer.key())]
    pub user_yes: Box<Account<'info, TokenAccount>>,

    #[account(mut, constraint = user_no.mint == market.no_mint, constraint = user_no.owner == signer.key())]
    pub user_no: Box<Account<'info, TokenAccount>>,

    #[account(mut, constraint = user_collateral.mint == market.collateral_mint, constraint = user_collateral.owner == signer.key())]
    pub user_collateral: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

/// Burn 1 YES + 1 NO to receive 1 USDC.
pub fn handler(ctx: Context<RedeemPair>, amount: u64) -> Result<()> {
    require!(amount > 0, PmAmmError::InvalidBudget);

    // Check user has enough YES and NO
    require!(
        ctx.accounts.user_yes.amount >= amount,
        PmAmmError::InsufficientBalance
    );
    require!(
        ctx.accounts.user_no.amount >= amount,
        PmAmmError::InsufficientBalance
    );
    // Check vault has enough USDC to pay out
    require!(
        ctx.accounts.vault.amount >= amount,
        PmAmmError::InsufficientVault
    );

    let market_id_bytes = ctx.accounts.market.market_id.to_le_bytes();
    let bump = ctx.accounts.market.bump;
    let seeds: &[&[&[u8]]] = &[&[Market::SEED, market_id_bytes.as_ref(), &[bump]]];
    let tp = ctx.accounts.token_program.key();

    // Burn YES
    token::burn(
        CpiContext::new(
            tp,
            Burn {
                mint: ctx.accounts.yes_mint.to_account_info(),
                from: ctx.accounts.user_yes.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        amount,
    )?;

    // Burn NO
    token::burn(
        CpiContext::new(
            tp,
            Burn {
                mint: ctx.accounts.no_mint.to_account_info(),
                from: ctx.accounts.user_no.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        amount,
    )?;

    // Transfer USDC vault → user (1 pair = 1 USDC)
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

    msg!("Redeemed {} pairs for {} USDC", amount, amount);

    Ok(())
}
