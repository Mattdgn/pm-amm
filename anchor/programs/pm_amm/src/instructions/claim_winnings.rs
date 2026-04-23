//! Settle position: burn ALL user tokens (winning + losing), pay winning side
//! at 1 USDC each, close empty token accounts to reclaim rent.
//! Only callable after market is resolved.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::errors::PmAmmError;
use crate::state::Market;

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
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

    /// User's YES token account.
    #[account(
        mut,
        constraint = user_yes.mint == market.yes_mint,
        constraint = user_yes.owner == signer.key(),
    )]
    pub user_yes: Box<Account<'info, TokenAccount>>,

    /// User's NO token account.
    #[account(
        mut,
        constraint = user_no.mint == market.no_mint,
        constraint = user_no.owner == signer.key(),
    )]
    pub user_no: Box<Account<'info, TokenAccount>>,

    /// User's USDC token account.
    #[account(
        mut,
        constraint = user_collateral.mint == market.collateral_mint,
        constraint = user_collateral.owner == signer.key(),
    )]
    pub user_collateral: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

/// Burn winning tokens for 1 USDC each after market resolution.
pub fn handler(ctx: Context<ClaimWinnings>, _amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;

    require!(market.resolved, PmAmmError::MarketNotResolved);

    let yes_bal = ctx.accounts.user_yes.amount;
    let no_bal = ctx.accounts.user_no.amount;
    require!(yes_bal > 0 || no_bal > 0, PmAmmError::InsufficientBalance);

    let (winning_balance, losing_balance) = match market.get_winning_side() {
        Some(crate::state::Side::Yes) => (yes_bal, no_bal),
        Some(crate::state::Side::No) => (no_bal, yes_bal),
        None => return err!(PmAmmError::MarketNotResolved),
    };

    let payout = winning_balance.min(ctx.accounts.vault.amount);

    let market_id_bytes = market.market_id.to_le_bytes();
    let bump = market.bump;
    let seeds: &[&[&[u8]]] = &[&[Market::SEED, market_id_bytes.as_ref(), &[bump]]];
    let tp = ctx.accounts.token_program.key();

    // --- Burn winning tokens + pay USDC ---
    if winning_balance > 0 {
        let (from, mint) = match market.get_winning_side() {
            Some(crate::state::Side::Yes) => (
                ctx.accounts.user_yes.to_account_info(),
                ctx.accounts.yes_mint.to_account_info(),
            ),
            _ => (
                ctx.accounts.user_no.to_account_info(),
                ctx.accounts.no_mint.to_account_info(),
            ),
        };
        token::burn(CpiContext::new(tp, Burn {
            mint, from,
            authority: ctx.accounts.signer.to_account_info(),
        }), winning_balance)?;

        if payout > 0 {
            token::transfer(CpiContext::new_with_signer(tp, Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_collateral.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            }, seeds), payout)?;
        }
    }

    // --- Burn losing tokens ---
    if losing_balance > 0 {
        let (from, mint) = match market.get_winning_side() {
            Some(crate::state::Side::Yes) => (
                ctx.accounts.user_no.to_account_info(),
                ctx.accounts.no_mint.to_account_info(),
            ),
            _ => (
                ctx.accounts.user_yes.to_account_info(),
                ctx.accounts.yes_mint.to_account_info(),
            ),
        };
        token::burn(CpiContext::new(tp, Burn {
            mint, from,
            authority: ctx.accounts.signer.to_account_info(),
        }), losing_balance)?;
    }

    // --- Close empty token accounts → rent back to signer ---
    // Reload after burns to check balances
    ctx.accounts.user_yes.reload()?;
    ctx.accounts.user_no.reload()?;

    if ctx.accounts.user_yes.amount == 0 {
        token::close_account(CpiContext::new(tp, CloseAccount {
            account: ctx.accounts.user_yes.to_account_info(),
            destination: ctx.accounts.signer.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        }))?;
    }
    if ctx.accounts.user_no.amount == 0 {
        token::close_account(CpiContext::new(tp, CloseAccount {
            account: ctx.accounts.user_no.to_account_info(),
            destination: ctx.accounts.signer.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        }))?;
    }

    msg!("Settled: {} USDC paid, {} losing burned, accounts closed", payout, losing_balance);

    Ok(())
}
