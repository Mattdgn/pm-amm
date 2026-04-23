//! Withdraw liquidity: auto-claim residuals, mint YES+NO proportional to shares.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};
use fixed::types::I80F48;

use crate::accrual;
use crate::errors::PmAmmError;
use crate::state::{LpPosition, Market};

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        has_one = yes_mint,
        has_one = no_mint,
        has_one = collateral_mint,
    )]
    pub market: Box<Account<'info, Market>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub yes_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub no_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [LpPosition::SEED, market.key().as_ref(), signer.key().as_ref()],
        bump = lp_position.bump,
        constraint = lp_position.owner == signer.key() @ PmAmmError::Unauthorized,
        constraint = lp_position.market == market.key() @ PmAmmError::Unauthorized,
    )]
    pub lp_position: Box<Account<'info, LpPosition>>,

    #[account(
        mut,
        constraint = user_yes.mint == market.yes_mint,
        constraint = user_yes.owner == signer.key(),
    )]
    pub user_yes: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_no.mint == market.no_mint,
        constraint = user_no.owner == signer.key(),
    )]
    pub user_no: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

/// Burn LP shares, receive proportional YES+NO tokens.
pub fn handler(ctx: Context<WithdrawLiquidity>, shares_to_burn: u128) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // --- Phase 1: Compute all values + update state ---
    let yes_u64: u64;
    let no_u64: u64;
    let market_id_bytes: [u8; 8];
    let bump: u8;
    {
        let market = &mut ctx.accounts.market;
        let lp = &mut ctx.accounts.lp_position;

        accrual::accrue_first(market, now)?;

        let lp_shares = I80F48::from_bits(lp.shares as i128);
        let burn_shares = I80F48::from_bits(shares_to_burn as i128);
        require!(burn_shares > I80F48::ZERO, PmAmmError::InvalidBudget);
        require!(burn_shares <= lp_shares, PmAmmError::InsufficientLiquidity);

        let total_shares = market.total_lp_shares_fixed();
        require!(total_shares > I80F48::ZERO, PmAmmError::InsufficientLiquidity);

        // Auto-claim pending residuals
        let (pending_yes, pending_no) = accrual::compute_lp_pending(
            lp_shares,
            I80F48::from_bits(lp.yes_per_share_checkpoint as i128),
            I80F48::from_bits(lp.no_per_share_checkpoint as i128),
            market.cum_yes_per_share_fixed(),
            market.cum_no_per_share_fixed(),
        );

        // Pool share from reserves
        let fraction = burn_shares / total_shares;
        let x = market.reserve_yes_fixed();
        let y = market.reserve_no_fixed();
        let yes_from_pool = x * fraction;
        let no_from_pool = y * fraction;

        let total_yes = pending_yes + yes_from_pool;
        let total_no = pending_no + no_from_pool;
        yes_u64 = total_yes.max(I80F48::ZERO).to_num::<u64>();
        no_u64 = total_no.max(I80F48::ZERO).to_num::<u64>();

        // Extract signer data
        market_id_bytes = market.market_id.to_le_bytes();
        bump = market.bump;

        // Update market
        market.set_reserve_yes_fixed(x - yes_from_pool);
        market.set_reserve_no_fixed(y - no_from_pool);
        market.set_total_lp_shares_fixed(total_shares - burn_shares);

        let old_l_zero = market.l_zero_fixed();
        let remaining_fraction = (total_shares - burn_shares) / total_shares;
        market.set_l_zero_fixed(old_l_zero * remaining_fraction);

        // Update LP position
        lp.shares = (lp_shares - burn_shares).to_bits() as u128;
        lp.yes_per_share_checkpoint = market.cum_yes_per_share;
        lp.no_per_share_checkpoint = market.cum_no_per_share;
    }

    // --- Phase 2: CPI mints ---
    let signer_seeds: &[&[&[u8]]] = &[&[Market::SEED, market_id_bytes.as_ref(), &[bump]]];

    let tp = ctx.accounts.token_program.key();

    if yes_u64 > 0 {
        token::mint_to(
            CpiContext::new_with_signer(
                tp,
                MintTo {
                    mint: ctx.accounts.yes_mint.to_account_info(),
                    to: ctx.accounts.user_yes.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                signer_seeds,
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
                    authority: ctx.accounts.market.to_account_info(),
                },
                signer_seeds,
            ),
            no_u64,
        )?;
    }

    // Close LP position if fully withdrawn — reclaim rent to signer
    if ctx.accounts.lp_position.shares == 0 {
        let lp_info = ctx.accounts.lp_position.to_account_info();
        let dest_info = ctx.accounts.signer.to_account_info();
        let rent_lamports = lp_info.lamports();
        **lp_info.try_borrow_mut_lamports()? = 0;
        **dest_info.try_borrow_mut_lamports()? = dest_info
            .lamports()
            .checked_add(rent_lamports)
            .ok_or(error!(PmAmmError::MathOverflow))?;
        lp_info.assign(&System::id());
        lp_info.resize(0)?;
    }

    Ok(())
}
