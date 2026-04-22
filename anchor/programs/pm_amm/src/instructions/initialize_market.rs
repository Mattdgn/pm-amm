//! Initialize a new prediction market.
//! Creates Market PDA, YES/NO mint PDAs, and vault PDA.
//! All derived deterministically — no random keypairs needed.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token::{Mint, Token, TokenAccount};
use mpl_token_metadata::instructions::{
    CreateMetadataAccountV3, CreateMetadataAccountV3InstructionArgs,
};
use mpl_token_metadata::types::DataV2;

use crate::errors::PmAmmError;
use crate::state::Market;

pub const YES_MINT_SEED: &[u8] = b"yes_mint";
pub const NO_MINT_SEED: &[u8] = b"no_mint";
pub const VAULT_SEED: &[u8] = b"vault";

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

    /// The collateral mint (USDC or mock). Must have 6 decimals.
    #[account(constraint = collateral_mint.decimals == 6 @ PmAmmError::InvalidBudget)]
    pub collateral_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = market,
        seeds = [YES_MINT_SEED, market.key().as_ref()],
        bump,
    )]
    pub yes_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = market,
        seeds = [NO_MINT_SEED, market.key().as_ref()],
        bump,
    )]
    pub no_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = collateral_mint,
        token::authority = market,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: Created via CPI to Metaplex Token Metadata program.
    #[account(mut)]
    pub yes_metadata: UncheckedAccount<'info>,

    /// CHECK: Created via CPI to Metaplex Token Metadata program.
    #[account(mut)]
    pub no_metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex Token Metadata program.
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, InitializeMarket<'info>>,
    market_id: u64,
    end_ts: i64,
    name: String,
) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    require!(end_ts > now + 300, PmAmmError::InvalidDuration); // min 5 minutes
    require!(!name.is_empty() && name.len() <= 64, PmAmmError::InvalidName);

    let market = &mut ctx.accounts.market;

    market.authority = ctx.accounts.authority.key();
    market.market_id = market_id;
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.yes_mint = ctx.accounts.yes_mint.key();
    market.no_mint = ctx.accounts.no_mint.key();
    market.vault = ctx.accounts.vault.key();
    market.start_ts = now;
    market.end_ts = end_ts;

    // Name (zero-padded)
    let mut name_bytes = [0u8; 64];
    let src = name.as_bytes();
    name_bytes[..src.len()].copy_from_slice(src);
    market.name = name_bytes;

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
    market.winning_side = 0;

    market.bump = ctx.bumps.market;

    // Signer seeds for Market PDA (mint authority)
    let id_bytes = market_id.to_le_bytes();
    let bump = ctx.bumps.market;
    let signer_seeds: &[&[u8]] = &[Market::SEED, &id_bytes, &[bump]];

    const YES_URI: &str = "https://raw.githubusercontent.com/Mattdgn/pm-amm/main/app/public/tokens/yes.json";
    const NO_URI: &str = "https://raw.githubusercontent.com/Mattdgn/pm-amm/main/app/public/tokens/no.json";

    // Create Metaplex metadata for YES mint (32 bytes max on-chain)
    let yes_name = truncate_str(&format!("YES - {}", name), 32);
    create_token_metadata(
        ctx.accounts.yes_metadata.to_account_info(),
        ctx.accounts.yes_mint.to_account_info(),
        ctx.accounts.market.to_account_info(),
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        ctx.accounts.rent.to_account_info(),
        yes_name,
        "YES".to_string(),
        YES_URI.to_string(),
        signer_seeds,
    )?;

    // Create Metaplex metadata for NO mint (32 bytes max on-chain)
    let no_name = truncate_str(&format!("NO - {}", name), 32);
    create_token_metadata(
        ctx.accounts.no_metadata.to_account_info(),
        ctx.accounts.no_mint.to_account_info(),
        ctx.accounts.market.to_account_info(),
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        ctx.accounts.rent.to_account_info(),
        no_name,
        "NO".to_string(),
        NO_URI.to_string(),
        signer_seeds,
    )?;

    Ok(())
}

fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() <= max_len { s.to_string() } else { s[..max_len].to_string() }
}

#[allow(clippy::too_many_arguments)]
fn create_token_metadata<'info>(
    metadata_ai: AccountInfo<'info>,
    mint_ai: AccountInfo<'info>,
    authority_ai: AccountInfo<'info>,
    payer_ai: AccountInfo<'info>,
    system_ai: AccountInfo<'info>,
    rent_ai: AccountInfo<'info>,
    token_name: String,
    symbol: String,
    uri: String,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let ix = CreateMetadataAccountV3 {
        metadata: metadata_ai.key(),
        mint: mint_ai.key(),
        mint_authority: authority_ai.key(),
        payer: payer_ai.key(),
        update_authority: (authority_ai.key(), true),
        system_program: system_ai.key(),
        rent: Some(rent_ai.key()),
    }
    .instruction(CreateMetadataAccountV3InstructionArgs {
        data: DataV2 {
            name: token_name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        },
        is_mutable: true,
        collection_details: None,
    });

    invoke_signed(
        &ix,
        &[metadata_ai, mint_ai, authority_ai.clone(), payer_ai, system_ai, rent_ai],
        &[signer_seeds],
    )?;

    Ok(())
}
