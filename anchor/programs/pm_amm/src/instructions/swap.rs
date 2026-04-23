//! Swap between USDC, YES, and NO tokens.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};
use fixed::types::I80F48;

use crate::accrual;
use crate::errors::PmAmmError;
use crate::pm_math::{self, SwapSide};
use crate::state::Market;

/// Direction of a swap. Six combinations covering all USDC/YES/NO pairs.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum SwapDirection {
    /// Buy YES tokens with USDC (mint YES, deposit USDC).
    UsdcToYes,
    /// Buy NO tokens with USDC (mint NO, deposit USDC).
    UsdcToNo,
    /// Sell YES tokens for USDC (burn YES, withdraw USDC).
    YesToUsdc,
    /// Sell NO tokens for USDC (burn NO, withdraw USDC).
    NoToUsdc,
    /// Convert YES to NO (burn YES, mint NO).
    YesToNo,
    /// Convert NO to YES (burn NO, mint YES).
    NoToYes,
}

impl SwapDirection {
    fn to_sides(&self) -> (SwapSide, SwapSide) {
        match self {
            Self::UsdcToYes => (SwapSide::Usdc, SwapSide::Yes),
            Self::UsdcToNo => (SwapSide::Usdc, SwapSide::No),
            Self::YesToUsdc => (SwapSide::Yes, SwapSide::Usdc),
            Self::NoToUsdc => (SwapSide::No, SwapSide::Usdc),
            Self::YesToNo => (SwapSide::Yes, SwapSide::No),
            Self::NoToYes => (SwapSide::No, SwapSide::Yes),
        }
    }
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
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

    #[account(mut, constraint = user_collateral.mint == market.collateral_mint, constraint = user_collateral.owner == signer.key())]
    pub user_collateral: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = user_yes.mint == market.yes_mint, constraint = user_yes.owner == signer.key())]
    pub user_yes: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = user_no.mint == market.no_mint, constraint = user_no.owner == signer.key())]
    pub user_no: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

/// Swap between USDC, YES, and NO tokens (6 directions).
pub fn handler(ctx: Context<Swap>, direction: SwapDirection, amount_in: u64, min_output: u64) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    require!(amount_in > 0, PmAmmError::InvalidBudget);

    // --- Phase 1: compute + update market ---
    let output_u64: u64;
    let market_id_bytes: [u8; 8];
    let bump: u8;
    {
        let market = &mut ctx.accounts.market;
        require!(!market.resolved, PmAmmError::MarketAlreadyResolved);
        require!(market.l_zero > 0, PmAmmError::InsufficientLiquidity);
        accrual::accrue_first(market, now)?;

        let time_remaining = market.end_ts - now;
        require!(time_remaining > 0, PmAmmError::MarketExpired);

        let l_eff = market.l_effective(now)?;
        let (side_in, side_out) = direction.to_sides();
        let result = pm_math::compute_swap_output(
            market.reserve_yes_fixed(), market.reserve_no_fixed(),
            l_eff, I80F48::from_num(amount_in), side_in, side_out,
        )?;

        output_u64 = result.output.max(I80F48::ZERO).to_num::<u64>();
        require!(output_u64 > 0, PmAmmError::InsufficientOutput);
        require!(output_u64 >= min_output, PmAmmError::SlippageExceeded);

        // Vault solvency check for USDC-out swaps
        match direction {
            SwapDirection::YesToUsdc | SwapDirection::NoToUsdc => {
                require!(
                    ctx.accounts.vault.amount >= output_u64,
                    PmAmmError::InsufficientVault
                );
            }
            _ => {}
        }

        market_id_bytes = market.market_id.to_le_bytes();
        bump = market.bump;
        market.set_reserve_yes_fixed(result.x_new);
        market.set_reserve_no_fixed(result.y_new);
    }

    // --- Phase 2: CPI ---
    let seeds: &[&[&[u8]]] = &[&[Market::SEED, market_id_bytes.as_ref(), &[bump]]];
    let tp = ctx.accounts.token_program.key();
    let market_info = ctx.accounts.market.to_account_info();

    match direction {
        SwapDirection::UsdcToYes => {
            token::transfer(CpiContext::new(tp, Transfer {
                from: ctx.accounts.user_collateral.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            }), amount_in)?;
            token::mint_to(CpiContext::new_with_signer(tp, MintTo {
                mint: ctx.accounts.yes_mint.to_account_info(),
                to: ctx.accounts.user_yes.to_account_info(),
                authority: market_info,
            }, seeds), output_u64)?;
        }
        SwapDirection::UsdcToNo => {
            token::transfer(CpiContext::new(tp, Transfer {
                from: ctx.accounts.user_collateral.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            }), amount_in)?;
            token::mint_to(CpiContext::new_with_signer(tp, MintTo {
                mint: ctx.accounts.no_mint.to_account_info(),
                to: ctx.accounts.user_no.to_account_info(),
                authority: market_info,
            }, seeds), output_u64)?;
        }
        SwapDirection::YesToUsdc => {
            token::burn(CpiContext::new(tp, Burn {
                mint: ctx.accounts.yes_mint.to_account_info(),
                from: ctx.accounts.user_yes.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            }), amount_in)?;
            token::transfer(CpiContext::new_with_signer(tp, Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_collateral.to_account_info(),
                authority: market_info,
            }, seeds), output_u64)?;
        }
        SwapDirection::NoToUsdc => {
            token::burn(CpiContext::new(tp, Burn {
                mint: ctx.accounts.no_mint.to_account_info(),
                from: ctx.accounts.user_no.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            }), amount_in)?;
            token::transfer(CpiContext::new_with_signer(tp, Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_collateral.to_account_info(),
                authority: market_info,
            }, seeds), output_u64)?;
        }
        SwapDirection::YesToNo => {
            token::burn(CpiContext::new(tp, Burn {
                mint: ctx.accounts.yes_mint.to_account_info(),
                from: ctx.accounts.user_yes.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            }), amount_in)?;
            token::mint_to(CpiContext::new_with_signer(tp, MintTo {
                mint: ctx.accounts.no_mint.to_account_info(),
                to: ctx.accounts.user_no.to_account_info(),
                authority: market_info,
            }, seeds), output_u64)?;
        }
        SwapDirection::NoToYes => {
            token::burn(CpiContext::new(tp, Burn {
                mint: ctx.accounts.no_mint.to_account_info(),
                from: ctx.accounts.user_no.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            }), amount_in)?;
            token::mint_to(CpiContext::new_with_signer(tp, MintTo {
                mint: ctx.accounts.yes_mint.to_account_info(),
                to: ctx.accounts.user_yes.to_account_info(),
                authority: market_info,
            }, seeds), output_u64)?;
        }
    }

    Ok(())
}
