//! dC_t accrual mechanism for LP residual redistribution.
//!
//! When L_eff decreases over time, tokens are released from the pool
//! and credited pro-rata to LPs as YES+NO tokens.
//!
//! Paper section 8: dC_t = -(L_dot_t / L_t) * V_t * dt
//! With L_t = L_0 * sqrt(T-t): reserves scale linearly with L_eff.
//! Released tokens = old_reserves - new_reserves at constant price.

use anchor_lang::prelude::*;
use fixed::types::I80F48;

use crate::pm_math;
use crate::state::Market;

// ============================================================================
// AccrualResult
// ============================================================================

/// Result of accrual computation. Applied to Market state via `apply_accrual`.
pub struct AccrualResult {
    pub yes_released: I80F48,
    pub no_released: I80F48,
    pub new_reserve_yes: I80F48,
    pub new_reserve_no: I80F48,
    pub new_cum_yes_per_share: I80F48,
    pub new_cum_no_per_share: I80F48,
    pub new_last_accrual_ts: i64,
    pub is_noop: bool,
}

impl AccrualResult {
    /// No-op result — no state changes.
    pub fn noop(market: &Market) -> Self {
        Self {
            yes_released: I80F48::ZERO,
            no_released: I80F48::ZERO,
            new_reserve_yes: market.reserve_yes_fixed(),
            new_reserve_no: market.reserve_no_fixed(),
            new_cum_yes_per_share: market.cum_yes_per_share_fixed(),
            new_cum_no_per_share: market.cum_no_per_share_fixed(),
            new_last_accrual_ts: market.last_accrual_ts,
            is_noop: true,
        }
    }
}

// ============================================================================
// compute_accrual
// ============================================================================

/// Compute the accrual result without modifying state.
///
/// When time passes, L_eff = L_0 * sqrt(T - t) decreases.
/// At constant price P, reserves scale with L_eff (eq. 5 & 6).
/// Released tokens = old_reserves - new_reserves, credited pro-rata to LPs.
pub fn compute_accrual(market: &Market, now: i64) -> Result<AccrualResult> {
    // Resolved market: no more accrual
    if market.resolved {
        return Ok(AccrualResult::noop(market));
    }

    // No liquidity: nothing to accrue
    let total_shares = market.total_lp_shares_fixed();
    if total_shares == I80F48::ZERO {
        return Ok(AccrualResult::noop(market));
    }

    // No L_0: pool not bootstrapped yet
    let l_zero = market.l_zero_fixed();
    if l_zero == I80F48::ZERO {
        return Ok(AccrualResult::noop(market));
    }

    // Clamp now to end_ts (can't accrue past expiration)
    let clamped_now = now.min(market.end_ts);

    // Time delta since last accrual
    let dt = clamped_now - market.last_accrual_ts;
    if dt <= 0 {
        return Ok(AccrualResult::noop(market));
    }

    let t_rem_old = market.end_ts - market.last_accrual_ts;
    let t_rem_new = market.end_ts - clamped_now;

    // Edge case: at expiration, all remaining liquidity is released
    if t_rem_new <= 0 {
        let x_old = market.reserve_yes_fixed();
        let y_old = market.reserve_no_fixed();

        let yes_per_share = x_old / total_shares;
        let no_per_share = y_old / total_shares;

        return Ok(AccrualResult {
            yes_released: x_old,
            no_released: y_old,
            new_reserve_yes: I80F48::ZERO,
            new_reserve_no: I80F48::ZERO,
            new_cum_yes_per_share: market.cum_yes_per_share_fixed() + yes_per_share,
            new_cum_no_per_share: market.cum_no_per_share_fixed() + no_per_share,
            new_last_accrual_ts: clamped_now,
            is_noop: false,
        });
    }

    // Compute L_eff before and after
    let l_eff_old = pm_math::l_effective(l_zero, t_rem_old)?;
    let l_eff_new = pm_math::l_effective(l_zero, t_rem_new)?;

    // Current reserves and price
    let x_old = market.reserve_yes_fixed();
    let y_old = market.reserve_no_fixed();
    let price = pm_math::price_from_reserves(x_old, y_old, l_eff_old)?;

    // New reserves at same price but lower L_eff
    let (x_new, y_new) = pm_math::reserves_from_price(price, l_eff_new)?;

    // Tokens released (always >= 0 since L_eff decreased)
    let yes_released = (x_old - x_new).max(I80F48::ZERO);
    let no_released = (y_old - y_new).max(I80F48::ZERO);

    // Per-share accumulation
    let yes_per_share = yes_released / total_shares;
    let no_per_share = no_released / total_shares;

    Ok(AccrualResult {
        yes_released,
        no_released,
        new_reserve_yes: x_new,
        new_reserve_no: y_new,
        new_cum_yes_per_share: market.cum_yes_per_share_fixed() + yes_per_share,
        new_cum_no_per_share: market.cum_no_per_share_fixed() + no_per_share,
        new_last_accrual_ts: clamped_now,
        is_noop: false,
    })
}

// ============================================================================
// apply_accrual
// ============================================================================

/// Apply an AccrualResult to the Market state.
pub fn apply_accrual(market: &mut Market, result: &AccrualResult) {
    if result.is_noop {
        return;
    }

    market.set_reserve_yes_fixed(result.new_reserve_yes);
    market.set_reserve_no_fixed(result.new_reserve_no);
    market.set_cum_yes_per_share_fixed(result.new_cum_yes_per_share);
    market.set_cum_no_per_share_fixed(result.new_cum_no_per_share);
    market.last_accrual_ts = result.new_last_accrual_ts;

    // Update distribution stats — floor to u64 (stats only, not used in math)
    let yes_tokens: u64 = result.yes_released.max(I80F48::ZERO).to_num::<u64>();
    let no_tokens: u64 = result.no_released.max(I80F48::ZERO).to_num::<u64>();
    market.total_yes_distributed = market.total_yes_distributed.saturating_add(yes_tokens);
    market.total_no_distributed = market.total_no_distributed.saturating_add(no_tokens);
}

// ============================================================================
// accrue_first — convenience pattern for instructions
// ============================================================================

/// Run accrual before any mutative instruction.
/// Common pattern: every ix that reads reserves must accrue first.
pub fn accrue_first(market: &mut Market, now: i64) -> Result<()> {
    let result = compute_accrual(market, now)?;
    apply_accrual(market, &result);
    Ok(())
}

// ============================================================================
// compute_lp_pending
// ============================================================================

/// Compute pending YES/NO tokens for an LP based on checkpoint deltas.
/// Returns (pending_yes, pending_no) in fixed-point.
pub fn compute_lp_pending(
    shares: I80F48,
    checkpoint_yes: I80F48,
    checkpoint_no: I80F48,
    cum_yes: I80F48,
    cum_no: I80F48,
) -> (I80F48, I80F48) {
    if shares == I80F48::ZERO {
        return (I80F48::ZERO, I80F48::ZERO);
    }

    let delta_yes = cum_yes - checkpoint_yes;
    let delta_no = cum_no - checkpoint_no;

    let pending_yes = (delta_yes * shares).max(I80F48::ZERO);
    let pending_no = (delta_no * shares).max(I80F48::ZERO);

    (pending_yes, pending_no)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pm_math;
    use anchor_lang::prelude::Pubkey;

    fn make_market(l_zero: f64, price: f64, end_ts: i64, now: i64, shares: f64) -> Market {
        let l_zero_fixed = I80F48::from_num(l_zero);
        let l_eff = pm_math::l_effective(l_zero_fixed, end_ts - now).unwrap();
        let (x, y) = pm_math::reserves_from_price(I80F48::from_num(price), l_eff).unwrap();

        let mut market = Market {
            authority: Pubkey::default(),
            market_id: 1,
            collateral_mint: Pubkey::default(),
            yes_mint: Pubkey::default(),
            no_mint: Pubkey::default(),
            vault: Pubkey::default(),
            start_ts: now,
            end_ts,
            l_zero: 0,
            reserve_yes: 0,
            reserve_no: 0,
            last_accrual_ts: now,
            cum_yes_per_share: 0,
            cum_no_per_share: 0,
            total_yes_distributed: 0,
            total_no_distributed: 0,
            total_lp_shares: 0,
            resolved: false,
            winning_side: 0,
            bump: 0,
            name: [0u8; 64],
        };

        market.set_l_zero_fixed(l_zero_fixed);
        market.set_reserve_yes_fixed(x);
        market.set_reserve_no_fixed(y);
        market.set_total_lp_shares_fixed(I80F48::from_num(shares));

        market
    }

    // --- Test 1: Sanity ---
    #[test]
    fn test_accrual_sanity() {
        let start = 1000;
        let end = start + 86400 * 7; // 7 days
        let market = make_market(10.0, 0.5, end, start, 1000.0);
        let now = start + 86400; // 1 day later

        let result = compute_accrual(&market, now).unwrap();

        assert!(!result.is_noop);
        let yr: f64 = result.yes_released.to_num();
        let nr: f64 = result.no_released.to_num();
        assert!(yr > 0.0, "yes_released should be > 0, got {yr}");
        assert!(nr > 0.0, "no_released should be > 0, got {nr}");

        // At P=0.5, yes_released == no_released (symmetry)
        assert!(
            (yr - nr).abs() < 0.01,
            "At P=0.5, yes == no: {yr} vs {nr}"
        );

        // Value ~ V_t / (2*(T-t)) * dt (paper section 8)
        let l_eff: f64 = pm_math::l_effective(
            market.l_zero_fixed(), end - start
        ).unwrap().to_num();
        let v_0: f64 = pm_math::pool_value(
            I80F48::from_num(0.5),
            I80F48::from_num(l_eff),
        ).unwrap().to_num();
        let expected_daily = v_0 / (2.0 * 7.0);
        // Released value ≈ yes_released (at P=0.5, each YES+NO pair = 1 USDC,
        // and yes=no, so value ≈ 2 * yes * 0.5 = yes)
        assert!(
            (yr - expected_daily).abs() / expected_daily < 0.15,
            "Released value {yr} far from expected daily {expected_daily}"
        );
    }

    // --- Test 2: No-op (consecutive calls) ---
    #[test]
    fn test_accrual_noop() {
        let start = 1000;
        let end = start + 86400 * 7;
        let mut market = make_market(10.0, 0.5, end, start, 1000.0);
        let now = start + 86400;

        // First accrual
        let r1 = compute_accrual(&market, now).unwrap();
        apply_accrual(&mut market, &r1);

        // Second call at same time — should be noop
        let r2 = compute_accrual(&market, now).unwrap();
        assert!(r2.is_noop, "Second call should be noop");
        assert_eq!(r2.yes_released, I80F48::ZERO);
        assert_eq!(r2.no_released, I80F48::ZERO);
    }

    // --- Test 3: Conservation (full lifetime) ---
    #[test]
    fn test_accrual_conservation() {
        let start = 0;
        let end = 86400 * 7;
        let mut market = make_market(10.0, 0.5, end, start, 1000.0);

        let v_0: f64 = pm_math::pool_value(
            I80F48::from_num(0.5),
            pm_math::l_effective(market.l_zero_fixed(), end - start).unwrap(),
        ).unwrap().to_num();

        let mut total_yes: f64 = 0.0;
        let mut total_no: f64 = 0.0;

        // Step through time in 100 steps
        let steps = 100;
        let dt = (end - 1) / steps;
        for i in 1..=steps {
            let now = (i * dt).min(end);
            let result = compute_accrual(&market, now as i64).unwrap();
            total_yes += result.yes_released.to_num::<f64>();
            total_no += result.no_released.to_num::<f64>();
            apply_accrual(&mut market, &result);
        }

        // At P=0.5, total value released ≈ V_0 (no LVR at fixed price)
        // Value of released tokens: at P=0.5, each YES = $0.5, each NO = $0.5
        let total_value = total_yes * 0.5 + total_no * 0.5;
        let ratio = total_value / v_0;
        assert!(
            (ratio - 1.0).abs() < 0.03,
            "Conservation: total_value/V_0 = {ratio:.4} (expect ~1.0, tol 3%)"
        );
    }

    // --- Test 4: Price unchanged after accrual ---
    #[test]
    fn test_accrual_price_unchanged() {
        let start = 0;
        let end = 86400 * 7;

        for p in [0.2, 0.5, 0.8] {
            let market = make_market(10.0, p, end, start, 1000.0);
            let now = 86400; // 1 day

            let result = compute_accrual(&market, now).unwrap();

            let l_eff_new = pm_math::l_effective(
                market.l_zero_fixed(), end - now
            ).unwrap();
            let p_new: f64 = pm_math::price_from_reserves(
                result.new_reserve_yes, result.new_reserve_no, l_eff_new,
            ).unwrap().to_num();

            assert!(
                (p_new - p).abs() < 0.001,
                "Price changed after accrual at P={p}: {p_new}"
            );
        }
    }

    // --- Test 5: Invariant preserved ---
    #[test]
    fn test_accrual_invariant() {
        let start = 0;
        let end = 86400 * 7;

        for p in [0.1, 0.3, 0.5, 0.7, 0.9] {
            let market = make_market(10.0, p, end, start, 1000.0);
            let now = 86400;

            let result = compute_accrual(&market, now).unwrap();

            let l_eff_new = pm_math::l_effective(
                market.l_zero_fixed(), end - now
            ).unwrap();
            let inv: f64 = pm_math::invariant_value(
                result.new_reserve_yes, result.new_reserve_no, l_eff_new,
            ).unwrap().to_num();

            assert!(
                inv.abs() < 0.01,
                "Invariant broken after accrual at P={p}: {inv:.6e}"
            );
        }
    }

    // --- Test 6: Edge case T-t=0 (expiration) ---
    #[test]
    fn test_accrual_at_expiration() {
        let start = 0;
        let end = 86400 * 7;
        let market = make_market(10.0, 0.5, end, start, 1000.0);

        let x_old: f64 = market.reserve_yes_fixed().to_num();
        let y_old: f64 = market.reserve_no_fixed().to_num();

        let result = compute_accrual(&market, end).unwrap();

        assert!(!result.is_noop);
        // All reserves released
        let yr: f64 = result.yes_released.to_num();
        let nr: f64 = result.no_released.to_num();
        assert!((yr - x_old).abs() < 0.01, "All YES should be released");
        assert!((nr - y_old).abs() < 0.01, "All NO should be released");
        // New reserves = 0
        assert_eq!(result.new_reserve_yes, I80F48::ZERO);
        assert_eq!(result.new_reserve_no, I80F48::ZERO);
    }

    // --- Test 7: Extreme prices ---
    #[test]
    fn test_accrual_extreme_prices() {
        let start = 0;
        let end = 86400 * 7;

        for p in [0.05, 0.95] {
            let market = make_market(10.0, p, end, start, 1000.0);
            let now = 86400;

            let result = compute_accrual(&market, now).unwrap();
            assert!(!result.is_noop);
            let yr: f64 = result.yes_released.to_num();
            let nr: f64 = result.no_released.to_num();
            assert!(yr > 0.0, "YES released at P={p}: {yr}");
            assert!(nr > 0.0, "NO released at P={p}: {nr}");
        }
    }

    // --- Test 8: Asymmetry at P != 0.5 ---
    #[test]
    fn test_accrual_asymmetry() {
        let start = 0;
        let end = 86400 * 7;
        let market = make_market(10.0, 0.7, end, start, 1000.0);
        let now = 86400;

        let result = compute_accrual(&market, now).unwrap();
        let yr: f64 = result.yes_released.to_num();
        let nr: f64 = result.no_released.to_num();

        // At P=0.7, pool has more NO than YES (y > x)
        // So no_released > yes_released
        assert!(
            nr > yr,
            "At P=0.7, NO released ({nr:.4}) should > YES released ({yr:.4})"
        );
    }

    // --- Test 9: Small dt (1 second) ---
    #[test]
    fn test_accrual_small_dt() {
        let start = 0;
        let end = 86400 * 7;
        let market = make_market(10.0, 0.5, end, start, 1000.0);
        let now = 1; // 1 second

        let result = compute_accrual(&market, now).unwrap();
        assert!(!result.is_noop);
        let yr: f64 = result.yes_released.to_num();
        assert!(yr > 0.0, "Even 1s should release something: {yr}");
        // But very small
        assert!(yr < 1.0, "1s accrual should be tiny: {yr}");
    }

    // --- compute_lp_pending tests ---

    #[test]
    fn test_pending_zero_shares() {
        let (py, pn) = compute_lp_pending(
            I80F48::ZERO,
            I80F48::ZERO,
            I80F48::ZERO,
            I80F48::from_num(100),
            I80F48::from_num(100),
        );
        assert_eq!(py, I80F48::ZERO);
        assert_eq!(pn, I80F48::ZERO);
    }

    #[test]
    fn test_pending_up_to_date() {
        let cum = I80F48::from_num(50);
        let (py, pn) = compute_lp_pending(
            I80F48::from_num(100), // shares
            cum, cum,              // checkpoints = current cum
            cum, cum,              // cum values
        );
        assert_eq!(py, I80F48::ZERO);
        assert_eq!(pn, I80F48::ZERO);
    }

    #[test]
    fn test_pending_behind() {
        let shares = I80F48::from_num(1000);
        let checkpoint = I80F48::from_num(10);
        let cum = I80F48::from_num(15); // 5 per share accrued since checkpoint

        let (py, pn) = compute_lp_pending(shares, checkpoint, checkpoint, cum, cum);

        let expected = I80F48::from_num(5000); // 5 * 1000
        assert_eq!(py, expected);
        assert_eq!(pn, expected);
    }

    // --- Test 10: now > end_ts (clamp) ---
    #[test]
    fn test_accrual_past_expiration() {
        let start = 0;
        let end = 86400 * 7;
        let market = make_market(10.0, 0.5, end, start, 1000.0);

        let x_old: f64 = market.reserve_yes_fixed().to_num();

        // now = 2 weeks past end — should clamp and release all
        let result = compute_accrual(&market, end + 86400 * 7).unwrap();
        assert!(!result.is_noop);
        let yr: f64 = result.yes_released.to_num();
        assert!((yr - x_old).abs() < 0.01, "Should release all YES: {yr} vs {x_old}");
        assert_eq!(result.new_reserve_yes, I80F48::ZERO);
        assert_eq!(result.new_last_accrual_ts, end); // clamped to end_ts
    }

    // --- Test 11: multi-step accrual → lp_pending integration ---
    #[test]
    fn test_accrual_then_pending() {
        let start = 0;
        let end = 86400 * 7;
        let mut market = make_market(10.0, 0.5, end, start, 1000.0);

        // LP checkpoint starts at 0 (deposited at start)
        let lp_shares = I80F48::from_num(1000);
        let cp_yes = I80F48::ZERO;
        let cp_no = I80F48::ZERO;

        // Accrue 1 day
        let r1 = compute_accrual(&market, 86400).unwrap();
        apply_accrual(&mut market, &r1);

        // Pending should equal released (single LP owns all shares)
        let (py, pn) = compute_lp_pending(
            lp_shares, cp_yes, cp_no,
            market.cum_yes_per_share_fixed(),
            market.cum_no_per_share_fixed(),
        );
        let py_f: f64 = py.to_num();
        let yr_f: f64 = r1.yes_released.to_num();
        assert!(
            (py_f - yr_f).abs() < 0.01,
            "Pending YES should equal released: {py_f} vs {yr_f}"
        );

        // Accrue 1 more day — pending should accumulate
        let r2 = compute_accrual(&market, 86400 * 2).unwrap();
        apply_accrual(&mut market, &r2);

        let (py2, _) = compute_lp_pending(
            lp_shares, cp_yes, cp_no,
            market.cum_yes_per_share_fixed(),
            market.cum_no_per_share_fixed(),
        );
        let py2_f: f64 = py2.to_num();
        let total: f64 = r1.yes_released.to_num::<f64>() + r2.yes_released.to_num::<f64>();
        assert!(
            (py2_f - total).abs() < 0.1,
            "Accumulated pending should match sum: {py2_f} vs {total}"
        );
    }

    // --- Test 12: exact oracle cross-validation ---
    #[test]
    fn test_accrual_oracle_values() {
        // From Python oracle: L_0=10, P=0.5, 7 days, accrual after 1 day
        // delta_x = 230.1453486055, delta_y = 230.1453486055
        let start = 0;
        let end = 86400 * 7;
        let market = make_market(10.0, 0.5, end, start, 1000.0);

        let result = compute_accrual(&market, 86400).unwrap();
        let yr: f64 = result.yes_released.to_num();
        let nr: f64 = result.no_released.to_num();

        assert!(
            (yr - 230.145).abs() < 1.0,
            "YES released: got {yr:.3}, expected ~230.145"
        );
        assert!(
            (nr - 230.145).abs() < 1.0,
            "NO released: got {nr:.3}, expected ~230.145"
        );
        // Symmetry at P=0.5
        assert!((yr - nr).abs() < 0.01, "YES != NO at P=0.5: {yr} vs {nr}");
    }

    // --- Test 13: exact oracle at P=0.3 (asymmetric) ---
    #[test]
    fn test_accrual_oracle_p03() {
        // Python: P=0.3, delta_x=412.34, delta_y=109.82
        // Ratio delta_y/delta_x = y_old/x_old = 0.2663
        let start = 0;
        let end = 86400 * 7;
        let market = make_market(10.0, 0.3, end, start, 1000.0);

        let result = compute_accrual(&market, 86400).unwrap();
        let yr: f64 = result.yes_released.to_num();
        let nr: f64 = result.no_released.to_num();

        assert!(
            (yr - 412.34).abs() < 2.0,
            "YES released at P=0.3: got {yr:.3}, expected ~412.34"
        );
        assert!(
            (nr - 109.82).abs() < 2.0,
            "NO released at P=0.3: got {nr:.3}, expected ~109.82"
        );
        // Ratio must match reserves ratio
        let ratio = nr / yr;
        assert!(
            (ratio - 0.2663).abs() < 0.01,
            "Release ratio {ratio:.4} should be ~0.2663"
        );
    }

    // --- Test 14: resolved market → noop ---
    #[test]
    fn test_accrual_resolved_noop() {
        let start = 0;
        let end = 86400 * 7;
        let mut market = make_market(10.0, 0.5, end, start, 1000.0);
        market.resolved = true;

        let result = compute_accrual(&market, 86400).unwrap();
        assert!(result.is_noop, "Resolved market should be noop");
    }
}
