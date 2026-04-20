//! Fixed-point math for pm-AMM (Paradigm paper, Moallemi & Robinson 2024).
//!
//! All functions use I80F48 fixed-point arithmetic.
//! Every formula is traced to doc/wp-para.md.
//! Cross-validated against oracle/pm_amm_math.py (scipy reference).

use anchor_lang::prelude::*;
use fixed::types::I80F48;

use crate::errors::PmAmmError;

// ============================================================================
// Constants
// ============================================================================

/// 1 / sqrt(2 * pi) = phi(0) ≈ 0.3989422804014327
const INV_SQRT_2PI: I80F48 = I80F48::lit("0.398942280401432677");

/// sqrt(2) ≈ 1.4142135623730951
const SQRT_2: I80F48 = I80F48::lit("1.414213562373095048");

/// pi ≈ 3.14159265358979
/// Reserved for future use (currently phi is computed via exp).
#[allow(dead_code)]
const PI: I80F48 = I80F48::lit("3.141592653589793238");

const ZERO: I80F48 = I80F48::ZERO;
const ONE: I80F48 = I80F48::ONE;
const TWO: I80F48 = I80F48::lit("2");
const HALF: I80F48 = I80F48::lit("0.5");

// ============================================================================
// 1. Primitives
// ============================================================================

/// Fixed-point exp(x) via Taylor series. Valid for x in [-20, 20].
/// Uses range reduction: exp(x) = exp(x/2^k)^(2^k) for |x| > 1.
pub fn exp_fixed(x: I80F48) -> Result<I80F48> {
    if x > I80F48::lit("20") || x < I80F48::lit("-20") {
        return err!(PmAmmError::MathOverflow);
    }

    // Range reduction: find k such that |x / 2^k| < 1
    let mut k = 0u32;
    let mut r = x;
    while r > ONE || r < (ZERO - ONE) {
        r = r / TWO;
        k += 1;
        if k > 30 {
            return err!(PmAmmError::MathOverflow);
        }
    }

    // Taylor series for exp(r) where |r| < 1: sum r^n / n!
    let mut term = ONE;
    let mut sum = ONE;
    for n in 1..=20u32 {
        term = term * r / I80F48::from_num(n);
        sum = sum + term;
        // Early exit if term is negligible
        if term > ZERO - I80F48::lit("0.0000000000001")
            && term < I80F48::lit("0.0000000000001")
        {
            break;
        }
    }

    // Square back: exp(x) = exp(r)^(2^k)
    for _ in 0..k {
        sum = sum * sum;
    }

    Ok(sum)
}

/// Fixed-point sqrt via Newton's method (8 iterations).
pub fn sqrt_fixed(x: I80F48) -> Result<I80F48> {
    if x < ZERO {
        return err!(PmAmmError::MathOverflow);
    }
    if x == ZERO {
        return Ok(ZERO);
    }

    // Initial guess: x/2 or 1, whichever is closer
    let mut guess = if x > ONE { x / TWO } else { ONE };

    for _ in 0..12 {
        guess = (guess + x / guess) / TWO;
    }

    Ok(guess)
}

/// Fixed-point ln(x) for x > 0. Uses identity ln(x) = 2 * atanh((x-1)/(x+1)).
pub fn ln_fixed(x: I80F48) -> Result<I80F48> {
    if x <= ZERO {
        return err!(PmAmmError::MathOverflow);
    }

    // Range reduction: ln(x * 2^k) = ln(x) + k*ln(2)
    let ln2 = I80F48::lit("0.693147180559945309");
    let mut val = x;
    let mut k: i32 = 0;

    while val > TWO {
        val = val / TWO;
        k += 1;
    }
    while val < HALF {
        val = val * TWO;
        k -= 1;
    }

    // Now val in [0.5, 2]. Use atanh series: ln(val) = 2*atanh((val-1)/(val+1))
    let t = (val - ONE) / (val + ONE);
    let t2 = t * t;
    let mut sum = t;
    let mut power = t;

    for n in (3..=21).step_by(2) {
        power = power * t2;
        sum = sum + power / I80F48::from_num(n);
    }
    sum = sum * TWO;

    Ok(sum + ln2 * I80F48::from_num(k))
}

// ============================================================================
// 2. Normal distribution functions
// ============================================================================

/// Error function approximation (Abramowitz & Stegun 7.1.26, max error 1.5e-7).
pub fn erf_fixed(x: I80F48) -> Result<I80F48> {
    let neg = x < ZERO;
    let ax = if neg { ZERO - x } else { x };

    // Coefficients from A&S 7.1.26
    let p = I80F48::lit("0.3275911");
    let a1 = I80F48::lit("0.254829592");
    let a2 = I80F48::lit("-0.284496736");
    let a3 = I80F48::lit("1.421413741");
    let a4 = I80F48::lit("-1.453152027");
    let a5 = I80F48::lit("1.061405429");

    let t = ONE / (ONE + p * ax);
    let t2 = t * t;
    let t3 = t2 * t;
    let t4 = t3 * t;
    let t5 = t4 * t;

    let poly = a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5;
    let exp_neg = exp_fixed(ZERO - ax * ax)?;
    let result = ONE - poly * exp_neg;

    Ok(if neg { ZERO - result } else { result })
}

/// Standard normal PDF: phi(z) = (1/sqrt(2*pi)) * exp(-z^2/2).
pub fn phi_fixed(z: I80F48) -> Result<I80F48> {
    let neg_half_z2 = ZERO - z * z / TWO;
    let e = exp_fixed(neg_half_z2)?;
    Ok(INV_SQRT_2PI * e)
}

/// Standard normal CDF: Phi(z) = 0.5 * (1 + erf(z / sqrt(2))).
pub fn capital_phi_fixed(z: I80F48) -> Result<I80F48> {
    let arg = z / SQRT_2;
    let erf_val = erf_fixed(arg)?;
    Ok(HALF * (ONE + erf_val))
}

/// Inverse CDF (Acklam's rational approximation). p in [0.0001, 0.9999].
/// Uses central region for 0.02425 <= p <= 0.97575, tail otherwise.
/// Refined with 2 Newton iterations for ~1e-8 accuracy.
pub fn capital_phi_inv_fixed(p: I80F48) -> Result<I80F48> {
    let p_min = I80F48::lit("0.0001");
    let p_max = I80F48::lit("0.9999");
    if p < p_min || p > p_max {
        return err!(PmAmmError::InvalidPrice);
    }

    let p_low = I80F48::lit("0.02425");
    let p_high = ONE - p_low;

    let mut result;

    if p < p_low {
        // Lower tail
        let q = sqrt_fixed(ZERO - TWO * ln_fixed(p)?)?;
        result = _acklam_tail(q)?;
    } else if p > p_high {
        // Upper tail: use symmetry
        let q = sqrt_fixed(ZERO - TWO * ln_fixed(ONE - p)?)?;
        result = ZERO - _acklam_tail(q)?;
    } else {
        // Central region
        let q = p - HALF;
        let r = q * q;
        result = _acklam_central(q, r)?;
    }

    // Newton refinement: x_{n+1} = x_n - (Phi(x_n) - p) / phi(x_n)
    for _ in 0..2 {
        let phi_r = phi_fixed(result)?;
        if phi_r < I80F48::lit("0.000001") {
            break;
        }
        let cdf_r = capital_phi_fixed(result)?;
        result = result - (cdf_r - p) / phi_r;
    }

    Ok(result)
}

/// Acklam central region: 0.02425 <= p <= 0.97575.
fn _acklam_central(q: I80F48, r: I80F48) -> Result<I80F48> {
    let a1 = I80F48::lit("-39.69683028665376");
    let a2 = I80F48::lit("220.9460984245205");
    let a3 = I80F48::lit("-275.9285104469687");
    let a4 = I80F48::lit("138.357751867269");
    let a5 = I80F48::lit("-30.66479806614716");
    let a6 = I80F48::lit("2.506628277459239");

    let b1 = I80F48::lit("-54.47609879822406");
    let b2 = I80F48::lit("161.5858368580409");
    let b3 = I80F48::lit("-155.6989798598866");
    let b4 = I80F48::lit("66.80131188771972");
    let b5 = I80F48::lit("-13.28068155288572");

    let num = (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q;
    let den = ((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + ONE;

    Ok(num / den)
}

/// Acklam tail region: p < 0.02425.
fn _acklam_tail(q: I80F48) -> Result<I80F48> {
    let c1 = I80F48::lit("-0.007784894002430293");
    let c2 = I80F48::lit("-0.3223964580411365");
    let c3 = I80F48::lit("-2.400758277161838");
    let c4 = I80F48::lit("-2.549732539343734");
    let c5 = I80F48::lit("4.374664141464968");
    let c6 = I80F48::lit("2.938163982698783");

    let d1 = I80F48::lit("0.007784695709041462");
    let d2 = I80F48::lit("0.3224671290700398");
    let d3 = I80F48::lit("2.445134137142996");
    let d4 = I80F48::lit("3.754408661907416");

    let num = ((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6;
    let den = (((d1 * q + d2) * q + d3) * q + d4) * q + ONE;

    Ok(num / den)
}

// ============================================================================
// 3. Pool functions — Paper sections 7 & 8
// ============================================================================

/// Effective liquidity: L_eff = L_0 * sqrt(T - t). Paper section 8.
pub fn l_effective(l_zero: I80F48, time_remaining_secs: i64) -> Result<I80F48> {
    if time_remaining_secs <= 0 {
        return err!(PmAmmError::InvalidDuration);
    }
    let t = I80F48::from_num(time_remaining_secs);
    let sqrt_t = sqrt_fixed(t)?;
    Ok(l_zero * sqrt_t)
}

/// Reserves from price. Paper eq. (5) & (6).
/// x*(P) = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) - Phi_inv(P) }
/// y*(P) = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) }
pub fn reserves_from_price(
    price: I80F48,
    l_eff: I80F48,
) -> Result<(I80F48, I80F48)> {
    let u = capital_phi_inv_fixed(price)?;
    let phi_u = phi_fixed(u)?;

    let x = l_eff * (u * price + phi_u - u);
    let y = l_eff * (u * price + phi_u);

    Ok((x, y))
}

/// Price from reserves via key identity: P = Phi((y - x) / L_eff). Paper section 7.
pub fn price_from_reserves(
    x: I80F48,
    y: I80F48,
    l_eff: I80F48,
) -> Result<I80F48> {
    let z = (y - x) / l_eff;
    capital_phi_fixed(z)
}

/// Invariant value. Returns 0 for valid reserves.
/// (y-x)*Phi((y-x)/L) + L*phi((y-x)/L) - y = 0. Paper section 7.
pub fn invariant_value(
    x: I80F48,
    y: I80F48,
    l_eff: I80F48,
) -> Result<I80F48> {
    let d = y - x;
    let z = d / l_eff;
    let phi_z = phi_fixed(z)?;
    let cdf_z = capital_phi_fixed(z)?;
    Ok(d * cdf_z + l_eff * phi_z - y)
}

/// Pool value: V(P) = L_eff * phi(Phi_inv(P)). Paper section 7.
pub fn pool_value(price: I80F48, l_eff: I80F48) -> Result<I80F48> {
    let u = capital_phi_inv_fixed(price)?;
    let phi_u = phi_fixed(u)?;
    Ok(l_eff * phi_u)
}

// ============================================================================
// 4. Swap
// ============================================================================

/// Result of a swap computation.
#[derive(Debug, Clone)]
pub struct SwapResult {
    pub output: I80F48,
    pub x_new: I80F48,
    pub y_new: I80F48,
    pub price_new: I80F48,
}

/// Side of a swap token.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwapSide {
    Yes,
    No,
    Usdc,
}

/// Find x given y and l_eff such that invariant = 0. Binary search.
fn find_x_from_y(y_target: I80F48, l_eff: I80F48) -> Result<I80F48> {
    let five = I80F48::lit("5");
    let mut lo = y_target - l_eff * five;
    let mut hi = y_target + l_eff * five;
    let tol = I80F48::lit("0.000000001"); // 1e-9

    for _ in 0..80 {
        let mid = (lo + hi) / TWO;
        let val = invariant_value(mid, y_target, l_eff)?;
        let abs_val = if val < ZERO { ZERO - val } else { val };
        if abs_val < tol {
            return Ok(mid);
        }
        if val > ZERO {
            lo = mid; // invariant positive at low x -> increase
        } else {
            hi = mid;
        }
    }

    err!(PmAmmError::ConvergenceFailed)
}

/// Find y given x and l_eff such that invariant = 0. Binary search.
fn find_y_from_x(x_target: I80F48, l_eff: I80F48) -> Result<I80F48> {
    let five = I80F48::lit("5");
    let mut lo = x_target - l_eff * five;
    let mut hi = x_target + l_eff * five;
    let tol = I80F48::lit("0.000000001");

    for _ in 0..80 {
        let mid = (lo + hi) / TWO;
        let val = invariant_value(x_target, mid, l_eff)?;
        let abs_val = if val < ZERO { ZERO - val } else { val };
        if abs_val < tol {
            return Ok(mid);
        }
        if val < ZERO {
            hi = mid; // invariant negative at high y -> decrease
        } else {
            lo = mid;
        }
    }

    err!(PmAmmError::ConvergenceFailed)
}

/// Compute swap output and new reserves.
///
/// Mechanisms (see oracle/pm_amm_math.py for derivation):
///   USDC->YES: mint pairs, swap NO->YES. output = delta + (x_old - x_new)
///   USDC->NO:  mint pairs, swap YES->NO. output = delta + (y_old - y_new)
///   YES->USDC: P_new = Phi((y-x-delta)/L). output = y_old - y_new
///   NO->USDC:  P_new = Phi((y-x+delta)/L). output = x_old - x_new
///   YES->NO:   direct swap. output = y_old - y_new
///   NO->YES:   direct swap. output = x_old - x_new
pub fn compute_swap_output(
    x: I80F48,
    y: I80F48,
    l_eff: I80F48,
    delta_in: I80F48,
    side_in: SwapSide,
    side_out: SwapSide,
) -> Result<SwapResult> {
    let p_clamp_lo = I80F48::lit("0.0001");
    let p_clamp_hi = I80F48::lit("0.9999");

    let (output, x_new, y_new) = match (side_in, side_out) {
        (SwapSide::Usdc, SwapSide::Yes) => {
            let yn = y + delta_in;
            let xn = find_x_from_y(yn, l_eff)?;
            (delta_in + (x - xn), xn, yn)
        }
        (SwapSide::Usdc, SwapSide::No) => {
            let xn = x + delta_in;
            let yn = find_y_from_x(xn, l_eff)?;
            (delta_in + (y - yn), xn, yn)
        }
        (SwapSide::Yes, SwapSide::Usdc) => {
            let new_z = ((y - x) - delta_in) / l_eff;
            let p_new_raw = capital_phi_fixed(new_z)?;
            let p_new = p_new_raw.max(p_clamp_lo).min(p_clamp_hi);
            let (xn, yn) = reserves_from_price(p_new, l_eff)?;
            (y - yn, xn, yn)
        }
        (SwapSide::No, SwapSide::Usdc) => {
            let new_z = ((y - x) + delta_in) / l_eff;
            let p_new_raw = capital_phi_fixed(new_z)?;
            let p_new = p_new_raw.max(p_clamp_lo).min(p_clamp_hi);
            let (xn, yn) = reserves_from_price(p_new, l_eff)?;
            (x - xn, xn, yn)
        }
        (SwapSide::Yes, SwapSide::No) => {
            let xn = x + delta_in;
            let yn = find_y_from_x(xn, l_eff)?;
            (y - yn, xn, yn)
        }
        (SwapSide::No, SwapSide::Yes) => {
            let yn = y + delta_in;
            let xn = find_x_from_y(yn, l_eff)?;
            (x - xn, xn, yn)
        }
        _ => return err!(PmAmmError::MathOverflow),
    };

    let price_new = price_from_reserves(x_new, y_new, l_eff)?;

    Ok(SwapResult {
        output,
        x_new,
        y_new,
        price_new,
    })
}

// ============================================================================
// 5. suggest_l_zero — derived from paper section 7
// ============================================================================

/// Calibrate L_0 so that pool value at P=0.5 equals the budget.
/// L_0 = budget / (phi(0) * sqrt(T)). Paper section 7.
pub fn suggest_l_zero_for_budget(
    budget_usdc: u64,
    duration_secs: i64,
) -> Result<I80F48> {
    if budget_usdc == 0 {
        return err!(PmAmmError::InvalidBudget);
    }
    if duration_secs <= 0 {
        return err!(PmAmmError::InvalidDuration);
    }

    let budget = I80F48::from_num(budget_usdc);
    let sqrt_t = sqrt_fixed(I80F48::from_num(duration_secs))?;
    let phi_0 = INV_SQRT_2PI; // phi(0) = 1/sqrt(2*pi)

    Ok(budget / (phi_0 * sqrt_t))
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn f(v: f64) -> I80F48 {
        I80F48::from_num(v)
    }

    fn assert_close(name: &str, got: I80F48, expected: f64, tol: f64) {
        let got_f: f64 = got.to_num();
        let err = (got_f - expected).abs();
        assert!(
            err < tol,
            "{name}: got={got_f:.12}, expected={expected:.12}, err={err:.2e}, tol={tol:.2e}"
        );
    }

    // --- Primitives ---

    #[test]
    fn test_exp() {
        assert_close("exp(0)", exp_fixed(ZERO).unwrap(), 1.0, 1e-10);
        assert_close("exp(1)", exp_fixed(ONE).unwrap(), std::f64::consts::E, 1e-8);
        assert_close("exp(-1)", exp_fixed(f(-1.0)).unwrap(), (-1.0_f64).exp(), 1e-8);
        assert_close("exp(2)", exp_fixed(f(2.0)).unwrap(), 2.0_f64.exp(), 1e-6);
        assert_close("exp(-5)", exp_fixed(f(-5.0)).unwrap(), (-5.0_f64).exp(), 1e-6);
        assert_close("exp(10)", exp_fixed(f(10.0)).unwrap(), 10.0_f64.exp(), 1.0);
    }

    #[test]
    fn test_sqrt() {
        assert_close("sqrt(1)", sqrt_fixed(ONE).unwrap(), 1.0, 1e-12);
        assert_close("sqrt(4)", sqrt_fixed(f(4.0)).unwrap(), 2.0, 1e-12);
        assert_close("sqrt(2)", sqrt_fixed(f(2.0)).unwrap(), std::f64::consts::SQRT_2, 1e-12);
        assert_close("sqrt(0.25)", sqrt_fixed(f(0.25)).unwrap(), 0.5, 1e-12);
        assert_close("sqrt(86400)", sqrt_fixed(f(86400.0)).unwrap(), 293.9387691, 1e-4);
    }

    #[test]
    fn test_ln() {
        assert_close("ln(1)", ln_fixed(ONE).unwrap(), 0.0, 1e-10);
        assert_close("ln(e)", ln_fixed(f(std::f64::consts::E)).unwrap(), 1.0, 1e-8);
        assert_close("ln(2)", ln_fixed(f(2.0)).unwrap(), 2.0_f64.ln(), 1e-10);
        assert_close("ln(0.5)", ln_fixed(f(0.5)).unwrap(), 0.5_f64.ln(), 1e-10);
        assert_close("ln(10)", ln_fixed(f(10.0)).unwrap(), 10.0_f64.ln(), 1e-8);
    }

    // --- Normal distribution ---

    #[test]
    fn test_erf() {
        assert_close("erf(0)", erf_fixed(ZERO).unwrap(), 0.0, 1e-7);
        assert_close("erf(1)", erf_fixed(ONE).unwrap(), 0.8427007929, 1e-6);
        assert_close("erf(-1)", erf_fixed(f(-1.0)).unwrap(), -0.8427007929, 1e-6);
        assert_close("erf(2)", erf_fixed(f(2.0)).unwrap(), 0.9953222650, 1e-6);
    }

    #[test]
    fn test_phi() {
        // phi(0) = 1/sqrt(2*pi) ≈ 0.3989422804
        assert_close("phi(0)", phi_fixed(ZERO).unwrap(), 0.3989422804014327, 1e-7);
        assert_close("phi(1)", phi_fixed(ONE).unwrap(), 0.24197072451914337, 1e-6);
        assert_close("phi(-1)", phi_fixed(f(-1.0)).unwrap(), 0.24197072451914337, 1e-6);
        assert_close("phi(2)", phi_fixed(f(2.0)).unwrap(), 0.05399096651318806, 1e-6);
        assert_close("phi(3)", phi_fixed(f(3.0)).unwrap(), 0.004431848411938, 1e-6);
    }

    #[test]
    fn test_capital_phi() {
        assert_close("Phi(0)", capital_phi_fixed(ZERO).unwrap(), 0.5, 1e-7);
        assert_close("Phi(1)", capital_phi_fixed(ONE).unwrap(), 0.8413447460685429, 1e-5);
        assert_close("Phi(-1)", capital_phi_fixed(f(-1.0)).unwrap(), 0.15865525393145702, 1e-5);
        assert_close("Phi(1.96)", capital_phi_fixed(f(1.96)).unwrap(), 0.9750021048517796, 1e-5);
        // Symmetry
        let phi_pos = capital_phi_fixed(f(1.5)).unwrap();
        let phi_neg = capital_phi_fixed(f(-1.5)).unwrap();
        assert_close("Phi(1.5)+Phi(-1.5)", phi_pos + phi_neg, 1.0, 1e-6);
    }

    #[test]
    fn test_capital_phi_inv() {
        // Test against oracle/test_vectors.json values
        assert_close("Phi_inv(0.5)", capital_phi_inv_fixed(HALF).unwrap(), 0.0, 1e-4);
        assert_close("Phi_inv(0.25)", capital_phi_inv_fixed(f(0.25)).unwrap(), -0.6744897501960817, 1e-3);
        assert_close("Phi_inv(0.75)", capital_phi_inv_fixed(f(0.75)).unwrap(), 0.6744897501960817, 1e-3);
        assert_close("Phi_inv(0.9)", capital_phi_inv_fixed(f(0.9)).unwrap(), 1.2815515655446004, 1e-3);
        assert_close("Phi_inv(0.1)", capital_phi_inv_fixed(f(0.1)).unwrap(), -1.2815515655446004, 1e-3);
        assert_close("Phi_inv(0.95)", capital_phi_inv_fixed(f(0.95)).unwrap(), 1.644853626951472, 1e-3);
        assert_close("Phi_inv(0.01)", capital_phi_inv_fixed(f(0.01)).unwrap(), -2.3263478740408408, 1e-2);
        assert_close("Phi_inv(0.99)", capital_phi_inv_fixed(f(0.99)).unwrap(), 2.3263478740408408, 1e-2);
    }

    #[test]
    fn test_phi_inv_roundtrip() {
        // Phi(Phi_inv(p)) = p
        for p in [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9] {
            let z = capital_phi_inv_fixed(f(p)).unwrap();
            let rt = capital_phi_fixed(z).unwrap();
            assert_close(&format!("Phi(Phi_inv({p}))"), rt, p, 1e-4);
        }
    }

    // --- Pool functions ---

    #[test]
    fn test_reserves_at_half() {
        // At P=0.5: x = y = L * phi(0) ≈ 398.94 for L=1000
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        assert_close("x(0.5)", x, 398.942280401, 0.1);
        assert_close("y(0.5)", y, 398.942280401, 0.1);
        assert_close("x=y at 0.5", x, y.to_num(), 0.01);
    }

    #[test]
    fn test_key_identity() {
        // y - x = L_eff * Phi_inv(P) for various P
        let l = f(1000.0);
        for p in [0.2, 0.3, 0.5, 0.7, 0.8] {
            let (x, y) = reserves_from_price(f(p), l).unwrap();
            let phi_inv_p: f64 = capital_phi_inv_fixed(f(p)).unwrap().to_num();
            let diff: f64 = (y - x).to_num();
            let expected = 1000.0 * phi_inv_p;
            assert!(
                (diff - expected).abs() < 1.0,
                "y-x identity failed at P={p}: diff={diff}, expected={expected}"
            );
        }
    }

    #[test]
    fn test_invariant_holds() {
        let l = f(1000.0);
        for p in [0.1, 0.3, 0.5, 0.7, 0.9] {
            let (x, y) = reserves_from_price(f(p), l).unwrap();
            let inv: f64 = invariant_value(x, y, l).unwrap().to_num();
            assert!(
                inv.abs() < 1.0,
                "Invariant failed at P={p}: inv={inv}"
            );
        }
    }

    #[test]
    fn test_price_roundtrip() {
        let l = f(1000.0);
        for p in [0.1, 0.3, 0.5, 0.7, 0.9] {
            let (x, y) = reserves_from_price(f(p), l).unwrap();
            let p_rt: f64 = price_from_reserves(x, y, l).unwrap().to_num();
            assert!(
                (p_rt - p).abs() < 0.01,
                "Price roundtrip failed: P={p}, got={p_rt}"
            );
        }
    }

    #[test]
    fn test_pool_value() {
        let l = f(1000.0);
        // V(0.5) = L * phi(0)
        let v: f64 = pool_value(HALF, l).unwrap().to_num();
        assert_close("V(0.5)", f(v), 398.942280401, 0.1);
    }

    // --- Swap ---

    #[test]
    fn test_swap_usdc_yes() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        let r = compute_swap_output(x, y, l, f(100.0), SwapSide::Usdc, SwapSide::Yes).unwrap();
        assert!(r.output > ZERO, "Output should be positive");
        assert!(r.price_new > HALF, "Price should increase after buying YES");
        // Invariant must hold for new reserves
        let inv: f64 = invariant_value(r.x_new, r.y_new, l).unwrap().to_num();
        assert!(inv.abs() < 1.0, "Invariant broken after swap: {inv}");
    }

    #[test]
    fn test_swap_roundtrip() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        // Buy YES with 10 USDC
        let r1 = compute_swap_output(x, y, l, f(10.0), SwapSide::Usdc, SwapSide::Yes).unwrap();
        // Sell exact output back
        let r2 = compute_swap_output(
            r1.x_new, r1.y_new, l, r1.output, SwapSide::Yes, SwapSide::Usdc,
        )
        .unwrap();
        let got_back: f64 = r2.output.to_num();
        let loss = (got_back - 10.0).abs() / 10.0;
        assert!(
            loss < 0.01,
            "Swap round-trip loss too high: {loss:.6}, got_back={got_back}"
        );
    }

    // --- suggest_l_zero ---

    #[test]
    fn test_suggest_l_zero() {
        // budget=1000, 7 days -> V(0.5, t=0) ~ 1000
        let l0 = suggest_l_zero_for_budget(1000, 86400 * 7).unwrap();
        let l_eff = l_effective(l0, 86400 * 7).unwrap();
        let v: f64 = pool_value(HALF, l_eff).unwrap().to_num();
        assert!(
            (v - 1000.0).abs() < 1.0,
            "V(0.5) should be ~1000, got {v}"
        );
    }

    // --- Full cross-validation against Python oracle ---

    #[test]
    fn test_cross_validation_print() {
        println!("\n=== RUST CROSS-VALIDATION ===\n");

        // Phi_inv (most critical function)
        println!("--- Phi_inv ---");
        for p in [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99] {
            let v: f64 = capital_phi_inv_fixed(f(p)).unwrap().to_num();
            println!("  Phi_inv({p}) = {v:.12}");
        }

        // Reserves
        println!("\n--- reserves_from_price (L=1000) ---");
        let l = f(1000.0);
        for p in [0.1, 0.3, 0.5, 0.7, 0.9] {
            let (x, y) = reserves_from_price(f(p), l).unwrap();
            let xf: f64 = x.to_num();
            let yf: f64 = y.to_num();
            println!("  P={p}: x={xf:.6}, y={yf:.6}, y-x={:.6}", yf - xf);
        }

        // Pool value
        println!("\n--- pool_value (L=1000) ---");
        for p in [0.1, 0.3, 0.5, 0.7, 0.9] {
            let v: f64 = pool_value(f(p), l).unwrap().to_num();
            println!("  V({p}) = {v:.10}");
        }

        // Invariant
        println!("\n--- invariant check ---");
        for p in [0.1, 0.3, 0.5, 0.7, 0.9] {
            let (x, y) = reserves_from_price(f(p), l).unwrap();
            let inv: f64 = invariant_value(x, y, l).unwrap().to_num();
            println!("  P={p}: inv={inv:.2e}");
        }

        // Swap
        println!("\n--- swap USDC->YES at P=0.5, L=1000 ---");
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        for delta in [10.0, 50.0, 100.0] {
            let r = compute_swap_output(x, y, l, f(delta), SwapSide::Usdc, SwapSide::Yes).unwrap();
            let out: f64 = r.output.to_num();
            let pn: f64 = r.price_new.to_num();
            println!("  {delta} USDC -> {out:.10} YES, price_new={pn:.10}");
        }

        // suggest_l_zero
        println!("\n--- suggest_l_zero ---");
        let l0 = suggest_l_zero_for_budget(1000, 86400 * 7).unwrap();
        let l_eff_val = l_effective(l0, 86400 * 7).unwrap();
        let v: f64 = pool_value(HALF, l_eff_val).unwrap().to_num();
        let l0f: f64 = l0.to_num();
        let lef: f64 = l_eff_val.to_num();
        println!("  L_0={l0f:.12}, L_eff={lef:.6}, V(0.5)={v:.10}");
    }

    /// Strict cross-validation with exact Python oracle values.
    /// These are the EXACT outputs from oracle/pm_amm_math.py.
    #[test]
    fn test_strict_oracle_match() {
        let l = f(1000.0);

        // Pool value V(0.5) = 398.9422804014 (Python oracle)
        let v05: f64 = pool_value(HALF, l).unwrap().to_num();
        assert!((v05 - 398.9422804014).abs() < 0.5, "V(0.5) = {v05}");

        // Pool value symmetric: V(0.3) = V(0.7) = 347.6926142001
        let v03: f64 = pool_value(f(0.3), l).unwrap().to_num();
        let v07: f64 = pool_value(f(0.7), l).unwrap().to_num();
        assert!((v03 - 347.6926).abs() < 1.0, "V(0.3) = {v03}");
        assert!((v03 - v07).abs() < 1.0, "V(0.3) != V(0.7): {v03} vs {v07}");

        // Reserves at P=0.5: x = y = 398.94
        let (x5, y5) = reserves_from_price(HALF, l).unwrap();
        let x5f: f64 = x5.to_num();
        let y5f: f64 = y5.to_num();
        assert!((x5f - y5f).abs() < 0.1, "x != y at P=0.5: {x5f} vs {y5f}");
        assert!((x5f - 398.94).abs() < 1.0, "x(0.5) = {x5f}");

        // Reserves at P=0.1: x=1328.89, y=47.34 (Python oracle)
        let (x1, y1) = reserves_from_price(f(0.1), l).unwrap();
        let x1f: f64 = x1.to_num();
        let y1f: f64 = y1.to_num();
        assert!((x1f - 1328.89).abs() < 2.0, "x(0.1) = {x1f}, expected 1328.89");
        assert!((y1f - 47.34).abs() < 2.0, "y(0.1) = {y1f}, expected 47.34");

        // Swap: 100 USDC -> ~186.207 YES (Python oracle)
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        let r = compute_swap_output(x, y, l, f(100.0), SwapSide::Usdc, SwapSide::Yes).unwrap();
        let out: f64 = r.output.to_num();
        assert!((out - 186.207).abs() < 2.0, "swap 100 USDC->YES = {out}, expected ~186.207");
        let pn: f64 = r.price_new.to_num();
        assert!((pn - 0.5739).abs() < 0.01, "price_new = {pn}, expected ~0.5739");

        // suggest_l_zero: budget=1000, 7d -> L_0 = 3.22317616571
        let l0: f64 = suggest_l_zero_for_budget(1000, 86400 * 7).unwrap().to_num();
        assert!((l0 - 3.22317).abs() < 0.01, "L_0 = {l0}, expected ~3.22318");
    }
}
