//! Claim pending YES+NO residuals for an LP position.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};
use fixed::types::I80F48;

use crate::accrual;
use crate::errors::PmAmmError;
use crate::state::{LpPosition, Market};

#[derive(Accounts)]
pub struct ClaimLpResiduals<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        has_one = yes_mint,
        has_one = no_mint,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(mut)]
    pub yes_mint: Account<'info, Mint>,

    #[account(mut)]
    pub no_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [LpPosition::SEED, market.key().as_ref(), signer.key().as_ref()],
        bump = lp_position.bump,
        constraint = lp_position.owner == signer.key() @ PmAmmError::Unauthorized,
        constraint = lp_position.market == market.key() @ PmAmmError::Unauthorized,
    )]
    pub lp_position: Account<'info, LpPosition>,

    #[account(mut, constraint = user_yes.mint == market.yes_mint, constraint = user_yes.owner == signer.key())]
    pub user_yes: Account<'info, TokenAccount>,

    #[account(mut, constraint = user_no.mint == market.no_mint, constraint = user_no.owner == signer.key())]
    pub user_no: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimLpResiduals>) -> Result<()> {
    let clock = Clock::get()?;

    // Compute pending + update state in scoped borrow
    let yes_u64: u64;
    let no_u64: u64;
    let market_id_bytes: [u8; 8];
    let bump: u8;
    {
        let market = &mut ctx.accounts.market;
        let lp = &mut ctx.accounts.lp_position;

        // Accrue first to include latest dC_t
        accrual::accrue_first(market, clock.unix_timestamp)?;

        let shares = I80F48::from_bits(lp.shares as i128);
        let cp_yes = I80F48::from_bits(lp.yes_per_share_checkpoint as i128);
        let cp_no = I80F48::from_bits(lp.no_per_share_checkpoint as i128);

        let (pending_yes, pending_no) = accrual::compute_lp_pending(
            shares,
            cp_yes,
            cp_no,
            market.cum_yes_per_share_fixed(),
            market.cum_no_per_share_fixed(),
        );

        yes_u64 = pending_yes.max(I80F48::ZERO).to_num::<u64>();
        no_u64 = pending_no.max(I80F48::ZERO).to_num::<u64>();

        require!(
            yes_u64 > 0 || no_u64 > 0,
            PmAmmError::NoResidualsToClaim
        );

        market_id_bytes = market.market_id.to_le_bytes();
        bump = market.bump;

        // Update checkpoints
        lp.yes_per_share_checkpoint = market.cum_yes_per_share;
        lp.no_per_share_checkpoint = market.cum_no_per_share;
    }

    // Mint YES+NO to user
    let seeds: &[&[&[u8]]] = &[&[Market::SEED, market_id_bytes.as_ref(), &[bump]]];
    let tp = ctx.accounts.token_program.to_account_info();
    let market_info = ctx.accounts.market.to_account_info();

    if yes_u64 > 0 {
        token::mint_to(
            CpiContext::new_with_signer(
                tp.clone(),
                MintTo {
                    mint: ctx.accounts.yes_mint.to_account_info(),
                    to: ctx.accounts.user_yes.to_account_info(),
                    authority: market_info.clone(),
                },
                seeds,
            ),
            yes_u64,
        )?;
    }

    if no_u64 > 0 {
        token::mint_to(
            CpiContext::new_with_signer(
                tp,
                MintTo {
                    mint: ctx.accounts.no_mint.to_account_info(),
                    to: ctx.accounts.user_no.to_account_info(),
                    authority: market_info,
                },
                seeds,
            ),
            no_u64,
        )?;
    }

    msg!("Claimed: yes={}, no={}", yes_u64, no_u64);

    Ok(())
}
