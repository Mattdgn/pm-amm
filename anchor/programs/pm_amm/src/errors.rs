//! Error codes for pm-AMM program.

use anchor_lang::prelude::*;

#[error_code]
pub enum PmAmmError {
    #[msg("Market already resolved")]
    MarketAlreadyResolved,
    #[msg("Market not yet resolved")]
    MarketNotResolved,
    #[msg("Market has expired")]
    MarketExpired,
    #[msg("Market has not expired yet")]
    MarketNotExpired,
    #[msg("Insufficient liquidity or balance")]
    InsufficientLiquidity,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid price: must be in (0, 1)")]
    InvalidPrice,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("No residuals to claim")]
    NoResidualsToClaim,
    #[msg("Invalid duration")]
    InvalidDuration,
    #[msg("Invalid budget or amount")]
    InvalidBudget,
    #[msg("Invalid winning mint: does not match resolved side")]
    InvalidWinningMint,
    #[msg("Insufficient vault balance")]
    InsufficientVault,
    #[msg("Invalid name: must be 1-64 bytes")]
    InvalidName,
}
