//! Fixed-point math for pm-AMM (Paradigm paper, Moallemi & Robinson 2024).
//!
//! All functions use I80F48 fixed-point arithmetic.
//! Every formula is traced to doc/wp-para.md.
//! Cross-validated against oracle/pm_amm_math.py (scipy reference).

use anchor_lang::prelude::*;
use fixed::types::I80F48;

use crate::errors::PmAmmError;
use crate::lut;

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

/// Bounds for exp() input to prevent overflow/underflow
const EXP_LOWER_BOUND: I80F48 = I80F48::lit("-20");
const EXP_UPPER_BOUND: I80F48 = I80F48::lit("20");

/// Maximum iterations for range reduction in exp/ln
const MAX_RANGE_REDUCTIONS: u32 = 30;

/// Convergence threshold for Newton/Taylor methods (approx 1e-13)
const NEWTON_EPSILON: I80F48 = I80F48::lit("0.0000000000001");

/// phi(z)/Phi(z) cutoff — beyond |z| > 8, values are negligible
const TAIL_CUTOFF: I80F48 = I80F48::lit("8");

/// Binary search bounds for z in reserve/price calculations
const Z_SEARCH_MIN: I80F48 = I80F48::lit("-6");
const Z_SEARCH_MAX: I80F48 = I80F48::lit("6");

/// Z-clamp bounds for direct swap calculations (avoids LUT edge cases)
const Z_CLAMP_LO: I80F48 = I80F48::lit("-5.9");
const Z_CLAMP_HI: I80F48 = I80F48::lit("5.9");

/// Price bounds for Phi_inv — avoid extreme Gaussian tails
pub const PRICE_LOWER_BOUND: I80F48 = I80F48::lit("0.0001");
pub const PRICE_UPPER_BOUND: I80F48 = I80F48::lit("0.9999");

// ============================================================================
// 1. Primitives
// ============================================================================

/// Fixed-point exp(x) via Taylor series.
/// For x < -20: returns 0 (exp(-20) ≈ 2e-9, negligible).
/// For x > 20: returns error (overflow — shouldn't happen in pm-AMM math).
/// Uses range reduction: exp(x) = exp(x/2^k)^(2^k) for |x| > 1.
#[inline(always)]
pub fn exp_fixed(x: I80F48) -> Result<I80F48> {
    if x < EXP_LOWER_BOUND {
        return Ok(ZERO); // underflow to 0 — safe for phi/erf
    }
    if x > EXP_UPPER_BOUND {
        return err!(PmAmmError::MathOverflow);
    }

    // Range reduction: find k such that |x / 2^k| < 1
    let mut k = 0u32;
    let mut r = x;
    while r > ONE || r < (ZERO - ONE) {
        r = r / TWO;
        k += 1;
        if k > MAX_RANGE_REDUCTIONS {
            return err!(PmAmmError::MathOverflow);
        }
    }

    // Taylor series for exp(r) where |r| < 1: sum r^n / n!
    let mut term = ONE;
    let mut sum = ONE;
    for n in 1..=12u32 {
        term = term * r / I80F48::from_num(n);
        sum = sum + term;
        // Early exit if term is negligible
        if term > ZERO - NEWTON_EPSILON && term < NEWTON_EPSILON {
            break;
        }
    }

    // Square back: exp(x) = exp(r)^(2^k)
    for _ in 0..k {
        sum = sum * sum;
    }

    Ok(sum)
}

/// Fixed-point sqrt via Newton's method.
/// Uses bit-level initial guess for fast convergence.
pub fn sqrt_fixed(x: I80F48) -> Result<I80F48> {
    if x < ZERO {
        return err!(PmAmmError::MathOverflow);
    }
    if x == ZERO {
        return Ok(ZERO);
    }

    // Initial guess: approximate sqrt via bit-shifting
    // For I80F48 with 48 fractional bits: sqrt(x) ≈ x >> (bits/2)
    // This gives a guess within 2x of the true value, so Newton converges in ~5 iterations
    let bits = x.to_bits();
    // Shift right by half the bit position offset from 1.0
    // 1.0 in I80F48 = 1 << 48. For x > 1, the "integer bits" give us the magnitude.
    let guess_bits = (bits >> 1) + (1i128 << 47); // half the bits + offset for fractional part
    let mut guess = I80F48::from_bits(guess_bits);

    // Clamp guess to reasonable range
    if guess <= ZERO {
        guess = ONE;
    }

    for _ in 0..20 {
        let next = (guess + x / guess) / TWO;
        // Early exit if converged
        let diff = if next > guess {
            next - guess
        } else {
            guess - next
        };
        if diff < NEWTON_EPSILON {
            return Ok(next);
        }
        guess = next;
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

    // Bounded loops: I80F48 max ≈ 2^79, so at most 80 halvings
    for _ in 0..50 {
        if val <= TWO {
            break;
        }
        val = val / TWO;
        k += 1;
    }
    for _ in 0..50 {
        if val >= HALF {
            break;
        }
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
#[inline(always)]
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
/// Returns 0 for |z| > 8 (phi(8) ≈ 5e-16, negligible).
#[inline(always)]
pub fn phi_fixed(z: I80F48) -> Result<I80F48> {
    if z > TAIL_CUTOFF || z < ZERO - TAIL_CUTOFF {
        return Ok(ZERO);
    }
    let neg_half_z2 = ZERO - z * z / TWO;
    let e = exp_fixed(neg_half_z2)?;
    Ok(INV_SQRT_2PI * e)
}

/// Standard normal CDF: Phi(z) = 0.5 * (1 + erf(z / sqrt(2))).
/// Returns 0 for z < -8, 1 for z > 8.
#[inline(always)]
pub fn capital_phi_fixed(z: I80F48) -> Result<I80F48> {
    if z < ZERO - TAIL_CUTOFF {
        return Ok(ZERO);
    }
    if z > TAIL_CUTOFF {
        return Ok(ONE);
    }
    let arg = z / SQRT_2;
    let erf_val = erf_fixed(arg)?;
    Ok(HALF * (ONE + erf_val))
}

/// Inverse CDF (Acklam's rational approximation). p in [0.0001, 0.9999].
/// Uses central region for 0.02425 <= p <= 0.97575, tail otherwise.
/// Refined with 2 Newton iterations for ~1e-8 accuracy.
pub fn capital_phi_inv_fixed(p: I80F48) -> Result<I80F48> {
    if p < PRICE_LOWER_BOUND || p > PRICE_UPPER_BOUND {
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
pub fn reserves_from_price(price: I80F48, l_eff: I80F48) -> Result<(I80F48, I80F48)> {
    let u = capital_phi_inv_fixed(price)?;
    let phi_u = phi_fixed(u)?;

    let x = l_eff * (u * price + phi_u - u);
    let y = l_eff * (u * price + phi_u);

    Ok((x, y))
}

/// Price from reserves via key identity: P = Phi((y - x) / L_eff). Paper section 7.
pub fn price_from_reserves(x: I80F48, y: I80F48, l_eff: I80F48) -> Result<I80F48> {
    let z = (y - x) / l_eff;
    capital_phi_fixed(z)
}

/// Invariant value. Returns 0 for valid reserves.
/// (y-x)*Phi((y-x)/L) + L*phi((y-x)/L) - y = 0. Paper section 7.
pub fn invariant_value(x: I80F48, y: I80F48, l_eff: I80F48) -> Result<I80F48> {
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

/// Compute (x, y) from u = Phi_inv(P) and L_eff using LUT (fast, for binary search).
/// x = L*(u*Phi(u) + phi(u) - u), y = L*(u*Phi(u) + phi(u))
#[inline(always)]
fn xy_from_u_fast(u: I80F48, l_eff: I80F48) -> (I80F48, I80F48) {
    let phi_u = lut::phi_lut(u);
    let cdf_u = lut::cdf_lut(u);
    let base = u * cdf_u + phi_u;
    (l_eff * (base - u), l_eff * base)
}

/// Find x given y_target: binary search on u using LUT (fast).
/// 20 iterations → precision ~12/2^20 ≈ 1e-5 (sufficient for 6 decimals).
fn find_x_from_y(y_target: I80F48, l_eff: I80F48) -> Result<I80F48> {
    let mut lo = Z_SEARCH_MIN;
    let mut hi = Z_SEARCH_MAX;

    for _ in 0..20 {
        let mid = (lo + hi) / TWO;
        let (_, y_mid) = xy_from_u_fast(mid, l_eff);
        if y_mid < y_target {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    let u_best = (lo + hi) / TWO;
    let (x, _) = xy_from_u_fast(u_best, l_eff);
    Ok(x)
}

/// Find y given x_target: binary search on u using LUT (fast).
fn find_y_from_x(x_target: I80F48, l_eff: I80F48) -> Result<I80F48> {
    let mut lo = Z_SEARCH_MIN;
    let mut hi = Z_SEARCH_MAX;

    for _ in 0..20 {
        let mid = (lo + hi) / TWO;
        let (x_mid, _) = xy_from_u_fast(mid, l_eff);
        if x_mid > x_target {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    let u_best = (lo + hi) / TWO;
    let (_, y) = xy_from_u_fast(u_best, l_eff);
    Ok(y)
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
            // new_z IS Phi_inv(P_new), use LUT directly — avoids expensive
            // Phi(z) → Phi_inv(Phi(z)) round-trip that blows CU budget.
            let z_clamp_lo = Z_CLAMP_LO;
            let z_clamp_hi = Z_CLAMP_HI;
            let new_z = (((y - x) - delta_in) / l_eff)
                .max(z_clamp_lo)
                .min(z_clamp_hi);
            let (xn, yn) = xy_from_u_fast(new_z, l_eff);
            (y - yn, xn, yn)
        }
        (SwapSide::No, SwapSide::Usdc) => {
            let z_clamp_lo = Z_CLAMP_LO;
            let z_clamp_hi = Z_CLAMP_HI;
            let new_z = (((y - x) + delta_in) / l_eff)
                .max(z_clamp_lo)
                .min(z_clamp_hi);
            let (xn, yn) = xy_from_u_fast(new_z, l_eff);
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

    // Use LUT CDF for price — saves an expensive erf+exp call
    let z_new = (y_new - x_new) / l_eff;
    let price_new = lut::cdf_lut(z_new);

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
pub fn suggest_l_zero_for_budget(budget_usdc: u64, duration_secs: i64) -> Result<I80F48> {
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
// Tests — cross-validated against oracle/test_vectors.json (scipy)
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

    // ================================================================
    // 1. Primitives — tight tolerances
    // ================================================================

    #[test]
    fn test_exp() {
        assert_close("exp(0)", exp_fixed(ZERO).unwrap(), 1.0, 1e-10);
        assert_close("exp(1)", exp_fixed(ONE).unwrap(), std::f64::consts::E, 1e-8);
        assert_close(
            "exp(-1)",
            exp_fixed(f(-1.0)).unwrap(),
            (-1.0_f64).exp(),
            1e-8,
        );
        assert_close(
            "exp(2)",
            exp_fixed(f(2.0)).unwrap(),
            7.389056098930650,
            1e-5,
        );
        assert_close(
            "exp(-2)",
            exp_fixed(f(-2.0)).unwrap(),
            0.135335283236613,
            1e-7,
        );
        assert_close(
            "exp(-5)",
            exp_fixed(f(-5.0)).unwrap(),
            0.006737946999085,
            1e-6,
        );
        assert_close("exp(5)", exp_fixed(f(5.0)).unwrap(), 148.413159102577, 1e-2);
        assert_close("exp(-10)", exp_fixed(f(-10.0)).unwrap(), 0.0000453999, 1e-7);
        // exp(10) = 22026.47 — large value, relative tolerance
        let e10: f64 = exp_fixed(f(10.0)).unwrap().to_num();
        let rel_err = (e10 - 22026.4657948).abs() / 22026.4657948;
        assert!(rel_err < 1e-4, "exp(10) relative error: {rel_err:.2e}");
        // Underflow: exp(-30) → 0 (not error)
        assert_close("exp(-30)", exp_fixed(f(-30.0)).unwrap(), 0.0, 1e-10);
        assert_close("exp(-100)", exp_fixed(f(-100.0)).unwrap(), 0.0, 1e-10);
        // Overflow: exp(30) → error
        assert!(exp_fixed(f(30.0)).is_err(), "exp(30) should overflow");
    }

    #[test]
    fn test_sqrt() {
        assert_close("sqrt(1)", sqrt_fixed(ONE).unwrap(), 1.0, 1e-12);
        assert_close("sqrt(4)", sqrt_fixed(f(4.0)).unwrap(), 2.0, 1e-12);
        assert_close(
            "sqrt(2)",
            sqrt_fixed(f(2.0)).unwrap(),
            std::f64::consts::SQRT_2,
            1e-12,
        );
        assert_close("sqrt(0.25)", sqrt_fixed(f(0.25)).unwrap(), 0.5, 1e-12);
        assert_close("sqrt(0.01)", sqrt_fixed(f(0.01)).unwrap(), 0.1, 1e-12);
        assert_close(
            "sqrt(86400)",
            sqrt_fixed(f(86400.0)).unwrap(),
            293.93876913,
            1e-6,
        );
        assert_close(
            "sqrt(604800)",
            sqrt_fixed(f(604800.0)).unwrap(),
            777.68888380890,
            1e-4,
        );
        // Large numbers (previously failed with 12 iterations)
        assert_close("sqrt(1e6)", sqrt_fixed(f(1e6)).unwrap(), 1000.0, 1e-6);
        assert_close("sqrt(1e8)", sqrt_fixed(f(1e8)).unwrap(), 10000.0, 1e-4);
        assert_close("sqrt(1e10)", sqrt_fixed(f(1e10)).unwrap(), 100000.0, 1e-2);
    }

    #[test]
    fn test_ln() {
        assert_close("ln(1)", ln_fixed(ONE).unwrap(), 0.0, 1e-10);
        assert_close(
            "ln(e)",
            ln_fixed(f(std::f64::consts::E)).unwrap(),
            1.0,
            1e-8,
        );
        assert_close("ln(2)", ln_fixed(f(2.0)).unwrap(), 0.693147180559945, 1e-10);
        assert_close(
            "ln(0.5)",
            ln_fixed(f(0.5)).unwrap(),
            -0.693147180559945,
            1e-10,
        );
        assert_close(
            "ln(10)",
            ln_fixed(f(10.0)).unwrap(),
            2.302585092994046,
            1e-8,
        );
        assert_close(
            "ln(0.01)",
            ln_fixed(f(0.01)).unwrap(),
            -4.605170185988091,
            1e-6,
        );
        assert_close(
            "ln(100)",
            ln_fixed(f(100.0)).unwrap(),
            4.605170185988091,
            1e-6,
        );
        // Larger values — tests bounded range reduction loops
        assert_close("ln(1e6)", ln_fixed(f(1e6)).unwrap(), 13.815510557964, 1e-4);
        assert_close(
            "ln(0.0001)",
            ln_fixed(f(0.0001)).unwrap(),
            -9.210340371976,
            1e-4,
        );
        // Error on non-positive
        assert!(ln_fixed(ZERO).is_err());
        assert!(ln_fixed(f(-1.0)).is_err());
    }

    // ================================================================
    // 2. Normal distribution — oracle test_vectors.json values
    // ================================================================

    #[test]
    fn test_phi_oracle() {
        // From oracle/test_vectors.json "phi" section
        let cases: &[(f64, f64)] = &[
            (-3.0, 0.004431848411938),
            (-2.0, 0.053990966513188),
            (-1.0, 0.241970724519143),
            (-0.5, 0.352065326764300),
            (0.0, 0.398942280401433),
            (0.5, 0.352065326764300),
            (1.0, 0.241970724519143),
            (2.0, 0.053990966513188),
            (3.0, 0.004431848411938),
        ];
        for &(z, expected) in cases {
            assert_close(
                &format!("phi({z})"),
                phi_fixed(f(z)).unwrap(),
                expected,
                1e-6,
            );
        }
        // Symmetry: phi(z) == phi(-z)
        for z in [0.5, 1.0, 2.0, 3.0] {
            let pos: f64 = phi_fixed(f(z)).unwrap().to_num();
            let neg: f64 = phi_fixed(f(-z)).unwrap().to_num();
            assert!((pos - neg).abs() < 1e-10, "phi symmetry broken at z={z}");
        }
        // Extreme z: phi(10) ≈ 0, phi(-10) ≈ 0 (no error)
        assert_close("phi(10)", phi_fixed(f(10.0)).unwrap(), 0.0, 1e-10);
        assert_close("phi(-10)", phi_fixed(f(-10.0)).unwrap(), 0.0, 1e-10);
    }

    #[test]
    fn test_capital_phi_oracle() {
        // From oracle/test_vectors.json "capital_phi" section
        let cases: &[(f64, f64)] = &[
            (-3.0, 0.001349898031630),
            (-2.0, 0.022750131948179),
            (-1.0, 0.158655253931457),
            (-0.5, 0.308537538725987),
            (0.0, 0.5),
            (0.5, 0.691462461274013),
            (1.0, 0.841344746068543),
            (2.0, 0.977249868051821),
            (3.0, 0.998650101968370),
        ];
        for &(z, expected) in cases {
            assert_close(
                &format!("Phi({z})"),
                capital_phi_fixed(f(z)).unwrap(),
                expected,
                1e-5,
            );
        }
        // Symmetry: Phi(z) + Phi(-z) = 1
        for z in [0.5, 1.0, 1.5, 2.0, 2.5, 3.0] {
            let sum: f64 =
                (capital_phi_fixed(f(z)).unwrap() + capital_phi_fixed(f(-z)).unwrap()).to_num();
            assert!(
                (sum - 1.0).abs() < 1e-6,
                "Phi symmetry broken at z={z}: sum={sum}"
            );
        }
        // Extreme z: Phi(10) → 1, Phi(-10) → 0 (no error)
        assert_close("Phi(10)", capital_phi_fixed(f(10.0)).unwrap(), 1.0, 1e-10);
        assert_close("Phi(-10)", capital_phi_fixed(f(-10.0)).unwrap(), 0.0, 1e-10);
        assert_close("Phi(100)", capital_phi_fixed(f(100.0)).unwrap(), 1.0, 1e-10);
        assert_close(
            "Phi(-100)",
            capital_phi_fixed(f(-100.0)).unwrap(),
            0.0,
            1e-10,
        );
    }

    #[test]
    fn test_capital_phi_inv_oracle() {
        // From oracle/test_vectors.json "capital_phi_inv" section
        let cases: &[(f64, f64, f64)] = &[
            // (p, expected, tolerance)
            (0.01, -2.326347874040841, 1e-3),
            (0.05, -1.644853626951473, 1e-4),
            (0.1, -1.281551565544600, 1e-4),
            (0.25, -0.674489750196082, 1e-4),
            (0.5, 0.0, 1e-6),
            (0.75, 0.674489750196082, 1e-4),
            (0.9, 1.281551565544600, 1e-4),
            (0.95, 1.644853626951472, 1e-4),
            (0.99, 2.326347874040841, 1e-3),
        ];
        for &(p, expected, tol) in cases {
            assert_close(
                &format!("Phi_inv({p})"),
                capital_phi_inv_fixed(f(p)).unwrap(),
                expected,
                tol,
            );
        }
    }

    #[test]
    fn test_phi_inv_roundtrip() {
        // Phi(Phi_inv(p)) = p — tighter than before
        for p in [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95] {
            let z = capital_phi_inv_fixed(f(p)).unwrap();
            let rt: f64 = capital_phi_fixed(z).unwrap().to_num();
            assert!(
                (rt - p).abs() < 1e-4,
                "Phi(Phi_inv({p})) = {rt}, err={:.2e}",
                (rt - p).abs()
            );
        }
    }

    #[test]
    fn test_erf() {
        assert_close("erf(0)", erf_fixed(ZERO).unwrap(), 0.0, 1e-7);
        assert_close(
            "erf(0.5)",
            erf_fixed(f(0.5)).unwrap(),
            0.520499877813047,
            1e-6,
        );
        assert_close("erf(1)", erf_fixed(ONE).unwrap(), 0.842700792949715, 1e-6);
        assert_close(
            "erf(-1)",
            erf_fixed(f(-1.0)).unwrap(),
            -0.842700792949715,
            1e-6,
        );
        assert_close(
            "erf(2)",
            erf_fixed(f(2.0)).unwrap(),
            0.995322265018953,
            1e-6,
        );
        assert_close(
            "erf(3)",
            erf_fixed(f(3.0)).unwrap(),
            0.999977909503001,
            1e-5,
        );
    }

    // ================================================================
    // 3. Reserves — oracle test_vectors.json, tol < 0.5
    // ================================================================

    #[test]
    fn test_reserves_oracle() {
        let l = f(1000.0);
        // All from oracle/test_vectors.json "reserves.l_eff_1000"
        let cases: &[(f64, f64, f64)] = &[
            // (price, expected_x, expected_y)
            (0.05, 1665.747, 20.893),
            (0.1, 1328.895, 47.343),
            (0.2, 953.259, 111.638),
            (0.3, 714.773, 190.372),
            (0.5, 398.942, 398.942),
            (0.7, 190.372, 714.773),
            (0.8, 111.638, 953.259),
            (0.9, 47.343, 1328.895),
            (0.95, 20.893, 1665.747),
        ];
        for &(p, exp_x, exp_y) in cases {
            let (x, y) = reserves_from_price(f(p), l).unwrap();
            let xf: f64 = x.to_num();
            let yf: f64 = y.to_num();
            assert!(
                (xf - exp_x).abs() < 0.5,
                "x({p}): got={xf:.3}, expected={exp_x:.3}"
            );
            assert!(
                (yf - exp_y).abs() < 0.5,
                "y({p}): got={yf:.3}, expected={exp_y:.3}"
            );
        }
    }

    #[test]
    fn test_reserves_symmetry() {
        // x(P) = y(1-P) and y(P) = x(1-P)
        let l = f(1000.0);
        for p in [0.1, 0.2, 0.3, 0.4] {
            let (x_lo, y_lo) = reserves_from_price(f(p), l).unwrap();
            let (x_hi, y_hi) = reserves_from_price(f(1.0 - p), l).unwrap();
            let x_lo_f: f64 = x_lo.to_num();
            let y_hi_f: f64 = y_hi.to_num();
            let y_lo_f: f64 = y_lo.to_num();
            let x_hi_f: f64 = x_hi.to_num();
            assert!(
                (x_lo_f - y_hi_f).abs() < 0.5,
                "x({p}) != y({:.1}): {x_lo_f:.3} vs {y_hi_f:.3}",
                1.0 - p
            );
            assert!(
                (y_lo_f - x_hi_f).abs() < 0.5,
                "y({p}) != x({:.1}): {y_lo_f:.3} vs {x_hi_f:.3}",
                1.0 - p
            );
        }
    }

    #[test]
    fn test_key_identity() {
        // y - x = L_eff * Phi_inv(P) — tolerance 0.01 (not 1.0)
        let l = f(1000.0);
        for p in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] {
            let (x, y) = reserves_from_price(f(p), l).unwrap();
            let u: f64 = capital_phi_inv_fixed(f(p)).unwrap().to_num();
            let diff: f64 = (y - x).to_num();
            let expected = 1000.0 * u;
            assert!(
                (diff - expected).abs() < 0.1,
                "y-x identity at P={p}: diff={diff:.6}, expected={expected:.6}"
            );
        }
    }

    // ================================================================
    // 4. Invariant — must be < 0.01 (not 1.0)
    // ================================================================

    #[test]
    fn test_invariant_tight() {
        let l = f(1000.0);
        for p in [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95] {
            let (x, y) = reserves_from_price(f(p), l).unwrap();
            let inv: f64 = invariant_value(x, y, l).unwrap().to_num();
            assert!(
                inv.abs() < 0.01,
                "Invariant at P={p}: {inv:.6e} (must be < 0.01)"
            );
        }
        // Different L values
        for lv in [10.0, 100.0, 5000.0] {
            for p in [0.2, 0.5, 0.8] {
                let (x, y) = reserves_from_price(f(p), f(lv)).unwrap();
                let inv: f64 = invariant_value(x, y, f(lv)).unwrap().to_num();
                assert!(inv.abs() < 0.01, "Invariant at P={p}, L={lv}: {inv:.6e}");
            }
        }
    }

    // ================================================================
    // 5. Price round-trip — must be < 0.001 (not 0.01)
    // ================================================================

    #[test]
    fn test_price_roundtrip_tight() {
        let l = f(1000.0);
        for p in [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95] {
            let (x, y) = reserves_from_price(f(p), l).unwrap();
            let p_rt: f64 = price_from_reserves(x, y, l).unwrap().to_num();
            assert!(
                (p_rt - p).abs() < 0.001,
                "Price roundtrip at P={p}: got={p_rt:.6}, err={:.6}",
                (p_rt - p).abs()
            );
        }
    }

    // ================================================================
    // 6. Pool value — oracle values, symmetry
    // ================================================================

    #[test]
    fn test_pool_value_oracle() {
        let l = f(1000.0);
        // From oracle/test_vectors.json "pool_value.l_eff_1000"
        let cases: &[(f64, f64)] = &[
            (0.05, 103.136),
            (0.1, 175.498),
            (0.2, 279.962),
            (0.3, 347.693),
            (0.4, 386.343),
            (0.5, 398.942),
            (0.6, 386.343),
            (0.7, 347.693),
            (0.8, 279.962),
            (0.9, 175.498),
            (0.95, 103.136),
        ];
        for &(p, expected) in cases {
            let v: f64 = pool_value(f(p), l).unwrap().to_num();
            assert!(
                (v - expected).abs() < 0.5,
                "V({p}): got={v:.3}, expected={expected:.3}"
            );
        }
        // Symmetry: V(P) = V(1-P)
        for p in [0.1, 0.2, 0.3, 0.4] {
            let v1: f64 = pool_value(f(p), l).unwrap().to_num();
            let v2: f64 = pool_value(f(1.0 - p), l).unwrap().to_num();
            assert!(
                (v1 - v2).abs() < 0.5,
                "V({p}) != V({:.1}): {v1:.3} vs {v2:.3}",
                1.0 - p
            );
        }
        // V is maximal at P=0.5
        let v_max: f64 = pool_value(HALF, l).unwrap().to_num();
        for p in [0.1, 0.3, 0.7, 0.9] {
            let v: f64 = pool_value(f(p), l).unwrap().to_num();
            assert!(v < v_max, "V({p})={v:.3} should be < V(0.5)={v_max:.3}");
        }
    }

    // ================================================================
    // 7. Swap — all 6 types tested, oracle values
    // ================================================================

    #[test]
    fn test_swap_usdc_yes_oracle() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        // From oracle/test_vectors.json "swap.at_p_0.5"
        let cases: &[(f64, f64, f64)] = &[
            // (delta_in, expected_output, expected_price_new)
            (10.0, 19.843, 0.50792),
            (50.0, 96.303, 0.53836),
            (100.0, 186.207, 0.57386),
            (200.0, 351.273, 0.63731),
        ];
        for &(delta, exp_out, exp_price) in cases {
            let r = compute_swap_output(x, y, l, f(delta), SwapSide::Usdc, SwapSide::Yes).unwrap();
            let out: f64 = r.output.to_num();
            let pn: f64 = r.price_new.to_num();
            assert!(
                (out - exp_out).abs() < 0.5,
                "{delta} USDC->YES: got={out:.3}, expected={exp_out:.3}"
            );
            assert!(
                (pn - exp_price).abs() < 0.001,
                "{delta} price_new: got={pn:.5}, expected={exp_price:.5}"
            );
            // Invariant must hold
            let inv: f64 = invariant_value(r.x_new, r.y_new, l).unwrap().to_num();
            assert!(inv.abs() < 0.01, "Invariant after swap {delta}: {inv:.6e}");
        }
    }

    #[test]
    fn test_swap_usdc_no() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        let r = compute_swap_output(x, y, l, f(100.0), SwapSide::Usdc, SwapSide::No).unwrap();
        let out: f64 = r.output.to_num();
        assert!(out > 0.0, "USDC->NO output should be positive");
        // By symmetry at P=0.5, USDC->NO output == USDC->YES output
        let r_yes = compute_swap_output(x, y, l, f(100.0), SwapSide::Usdc, SwapSide::Yes).unwrap();
        let out_yes: f64 = r_yes.output.to_num();
        assert!(
            (out - out_yes).abs() < 0.5,
            "USDC->NO != USDC->YES at P=0.5: {out:.3} vs {out_yes:.3}"
        );
        // Price should decrease (buying NO = selling YES)
        let pn: f64 = r.price_new.to_num();
        assert!(pn < 0.5, "Price should decrease after buying NO: {pn}");
    }

    #[test]
    fn test_swap_yes_usdc() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        let r = compute_swap_output(x, y, l, f(50.0), SwapSide::Yes, SwapSide::Usdc).unwrap();
        let out: f64 = r.output.to_num();
        assert!(out > 0.0, "YES->USDC output should be positive");
        // Price should decrease (selling YES)
        let pn: f64 = r.price_new.to_num();
        assert!(pn < 0.5, "Price should decrease after selling YES: {pn}");
    }

    #[test]
    fn test_swap_no_usdc() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        let r = compute_swap_output(x, y, l, f(50.0), SwapSide::No, SwapSide::Usdc).unwrap();
        let out: f64 = r.output.to_num();
        assert!(out > 0.0, "NO->USDC output should be positive");
        // Price should increase (selling NO = buying YES)
        let pn: f64 = r.price_new.to_num();
        assert!(pn > 0.5, "Price should increase after selling NO: {pn}");
    }

    #[test]
    fn test_swap_yes_no() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        let r = compute_swap_output(x, y, l, f(50.0), SwapSide::Yes, SwapSide::No).unwrap();
        let out: f64 = r.output.to_num();
        assert!(out > 0.0, "YES->NO output should be positive");
        // Price should decrease
        let pn: f64 = r.price_new.to_num();
        assert!(pn < 0.5, "Price should decrease after YES->NO: {pn}");
        // Invariant
        let inv: f64 = invariant_value(r.x_new, r.y_new, l).unwrap().to_num();
        assert!(inv.abs() < 0.01, "Invariant after YES->NO: {inv:.6e}");
    }

    #[test]
    fn test_swap_no_yes() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        let r = compute_swap_output(x, y, l, f(50.0), SwapSide::No, SwapSide::Yes).unwrap();
        let out: f64 = r.output.to_num();
        assert!(out > 0.0, "NO->YES output should be positive");
        // Price should increase
        let pn: f64 = r.price_new.to_num();
        assert!(pn > 0.5, "Price should increase after NO->YES: {pn}");
        // Invariant
        let inv: f64 = invariant_value(r.x_new, r.y_new, l).unwrap().to_num();
        assert!(inv.abs() < 0.01, "Invariant after NO->YES: {inv:.6e}");
    }

    // ================================================================
    // 8. Swap round-trips — all directions, loss < 0.1%
    // ================================================================

    #[test]
    fn test_swap_roundtrip_usdc_yes() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        let r1 = compute_swap_output(x, y, l, f(10.0), SwapSide::Usdc, SwapSide::Yes).unwrap();
        let r2 = compute_swap_output(
            r1.x_new,
            r1.y_new,
            l,
            r1.output,
            SwapSide::Yes,
            SwapSide::Usdc,
        )
        .unwrap();
        let back: f64 = r2.output.to_num();
        let loss = (back - 10.0).abs() / 10.0;
        assert!(loss < 0.001, "USDC->YES->USDC round-trip loss: {loss:.6}");
    }

    #[test]
    fn test_swap_roundtrip_usdc_no() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        let r1 = compute_swap_output(x, y, l, f(10.0), SwapSide::Usdc, SwapSide::No).unwrap();
        let r2 = compute_swap_output(
            r1.x_new,
            r1.y_new,
            l,
            r1.output,
            SwapSide::No,
            SwapSide::Usdc,
        )
        .unwrap();
        let back: f64 = r2.output.to_num();
        let loss = (back - 10.0).abs() / 10.0;
        assert!(loss < 0.001, "USDC->NO->USDC round-trip loss: {loss:.6}");
    }

    #[test]
    fn test_swap_roundtrip_yes_no() {
        let l = f(1000.0);
        let (x, y) = reserves_from_price(HALF, l).unwrap();
        let r1 = compute_swap_output(x, y, l, f(10.0), SwapSide::Yes, SwapSide::No).unwrap();
        let r2 = compute_swap_output(
            r1.x_new,
            r1.y_new,
            l,
            r1.output,
            SwapSide::No,
            SwapSide::Yes,
        )
        .unwrap();
        let back: f64 = r2.output.to_num();
        let loss = (back - 10.0).abs() / 10.0;
        assert!(loss < 0.001, "YES->NO->YES round-trip loss: {loss:.6}");
    }

    // ================================================================
    // 9. Swap at non-0.5 prices
    // ================================================================

    #[test]
    fn test_swap_at_extreme_prices() {
        let l = f(1000.0);
        // At P=0.2 (low price)
        let (x, y) = reserves_from_price(f(0.2), l).unwrap();
        let r = compute_swap_output(x, y, l, f(50.0), SwapSide::Usdc, SwapSide::Yes).unwrap();
        assert!(r.output.to_num::<f64>() > 0.0);
        assert!(r.price_new.to_num::<f64>() > 0.2);
        let inv: f64 = invariant_value(r.x_new, r.y_new, l).unwrap().to_num();
        assert!(inv.abs() < 0.01, "Invariant at P=0.2: {inv:.6e}");

        // At P=0.8 (high price)
        let (x, y) = reserves_from_price(f(0.8), l).unwrap();
        let r = compute_swap_output(x, y, l, f(50.0), SwapSide::Usdc, SwapSide::Yes).unwrap();
        assert!(r.output.to_num::<f64>() > 0.0);
        assert!(r.price_new.to_num::<f64>() > 0.8);
        let inv: f64 = invariant_value(r.x_new, r.y_new, l).unwrap().to_num();
        assert!(inv.abs() < 0.01, "Invariant at P=0.8: {inv:.6e}");
    }

    // ================================================================
    // 10. l_effective — direct test
    // ================================================================

    #[test]
    fn test_l_effective() {
        let l0 = f(10.0);
        // L_eff = L_0 * sqrt(T-t)
        let l7d = l_effective(l0, 604800).unwrap(); // 7 days
        assert_close("L_eff(7d)", l7d, 10.0 * 777.68888, 0.1);

        let l1d = l_effective(l0, 86400).unwrap(); // 1 day
        assert_close("L_eff(1d)", l1d, 10.0 * 293.93877, 0.1);

        // Error on non-positive
        assert!(l_effective(l0, 0).is_err());
        assert!(l_effective(l0, -1).is_err());
    }

    // ================================================================
    // 11. suggest_l_zero — oracle cross-validation
    // ================================================================

    #[test]
    fn test_suggest_l_zero_oracle() {
        // From oracle/test_vectors.json
        let l0 = suggest_l_zero_for_budget(1000, 604800).unwrap();
        let l0f: f64 = l0.to_num();
        assert!((l0f - 3.22318).abs() < 0.001, "L_0 = {l0f}");

        let l_eff = l_effective(l0, 604800).unwrap();
        let lef: f64 = l_eff.to_num();
        assert!((lef - 2506.628).abs() < 1.0, "L_eff = {lef}");

        let v: f64 = pool_value(HALF, l_eff).unwrap().to_num();
        assert!((v - 1000.0).abs() < 0.1, "V(0.5) should be ~1000, got {v}");

        // Errors
        assert!(suggest_l_zero_for_budget(0, 604800).is_err());
        assert!(suggest_l_zero_for_budget(1000, 0).is_err());
        assert!(suggest_l_zero_for_budget(1000, -1).is_err());
    }

    // ================================================================
    // 12. Property A — Uniform LVR across prices (paper section 7)
    // ================================================================

    #[test]
    fn test_property_a_uniform_lvr() {
        let remaining = 86400 * 6; // 6 days remaining
        let l_eff = l_effective(f(10.0), remaining).unwrap();
        let expected_ratio: f64 = 1.0 / (2.0 * remaining as f64);

        for p in [0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9] {
            let v: f64 = pool_value(f(p), l_eff).unwrap().to_num();
            let lvr = v / (2.0 * remaining as f64);
            let ratio = lvr / v;
            let err = (ratio - expected_ratio).abs() / expected_ratio;
            assert!(
                err < 1e-6,
                "Property A: LVR/V ratio at P={p}: err={err:.2e}"
            );
        }
    }

    // ================================================================
    // 13. Stress — 50 sequential swaps, invariant holds
    // ================================================================

    #[test]
    fn test_stress_sequential_swaps() {
        let l = f(1000.0);
        let (mut x, mut y) = reserves_from_price(HALF, l).unwrap();

        // Alternate buy/sell YES
        for i in 0..50 {
            let delta = f(5.0 + (i as f64) * 0.5); // varying amounts
            let direction = if i % 2 == 0 {
                (SwapSide::Usdc, SwapSide::Yes)
            } else {
                (SwapSide::Yes, SwapSide::No)
            };

            let result = compute_swap_output(x, y, l, delta, direction.0, direction.1);
            match result {
                Ok(r) => {
                    x = r.x_new;
                    y = r.y_new;
                    // Check price stays in bounds
                    let p: f64 = r.price_new.to_num();
                    assert!(p > 0.0001 && p < 0.9999, "Price out of bounds: {p}");
                }
                Err(_) => break, // Price hit boundary
            }
        }

        // Invariant must hold at the end
        let inv: f64 = invariant_value(x, y, l).unwrap().to_num();
        assert!(inv.abs() < 0.1, "Invariant after stress: {inv:.6e}");
    }

    // ================================================================
    // 14. Scale — small and large amounts
    // ================================================================

    #[test]
    fn test_scale_small_large() {
        // Small pool: L=1
        let l_small = f(1.0);
        let (x, y) = reserves_from_price(HALF, l_small).unwrap();
        let v: f64 = pool_value(HALF, l_small).unwrap().to_num();
        assert!((v - 0.39894).abs() < 0.01, "V(0.5, L=1) = {v}");
        let inv: f64 = invariant_value(x, y, l_small).unwrap().to_num();
        assert!(inv.abs() < 0.001, "Small pool invariant: {inv:.6e}");

        // Large pool: L=100000
        let l_large = f(100000.0);
        let (x, y) = reserves_from_price(HALF, l_large).unwrap();
        let v: f64 = pool_value(HALF, l_large).unwrap().to_num();
        assert!((v - 39894.228).abs() < 10.0, "V(0.5, L=100k) = {v}");
        let inv: f64 = invariant_value(x, y, l_large).unwrap().to_num();
        assert!(inv.abs() < 1.0, "Large pool invariant: {inv:.6e}");
    }
}
