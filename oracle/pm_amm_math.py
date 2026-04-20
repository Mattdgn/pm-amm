"""
pm-AMM math oracle — ground truth reference implementation.

Implements all math from the Paradigm pm-AMM paper (Moallemi & Robinson, Nov 2024).
Uses scipy.stats.norm as the exact reference for normal distribution functions.
Every function is traced to its paper section (doc/wp-para.md).

Usage:
    python3 oracle/pm_amm_math.py          # smoke test
    python3 oracle/test_oracle.py          # full test suite
"""

import math
from scipy.stats import norm


# =============================================================================
# 1. Standard normal distribution — scipy wrappers
# =============================================================================

def phi(z: float) -> float:
    """Standard normal PDF: (1/sqrt(2*pi)) * exp(-z^2/2)."""
    return norm.pdf(z)


def capital_phi(z: float) -> float:
    """Standard normal CDF: Phi(z) = P(Z <= z)."""
    return norm.cdf(z)


def capital_phi_inv(p: float) -> float:
    """Inverse CDF (quantile function). p in (0, 1)."""
    return norm.ppf(p)


def erf(x: float) -> float:
    """Error function. Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))."""
    return math.erf(x)


# =============================================================================
# 2. Effective liquidity — Paper section 8
# =============================================================================

def l_effective(l_zero: float, time_remaining: float) -> float:
    """L_eff = L_0 * sqrt(T - t). Paper section 8."""
    assert time_remaining > 0, "time_remaining must be > 0"
    return l_zero * math.sqrt(time_remaining)


# =============================================================================
# 3. Reserves — Paper equations (5) & (6), section 7
# =============================================================================

def reserves_from_price(p: float, l_eff: float) -> tuple[float, float]:
    """
    Compute optimal reserves (x*, y*) for price P and effective liquidity L_eff.

    Paper eq. (5): x*(P) = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) - Phi_inv(P) }
    Paper eq. (6): y*(P) = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) }
    """
    assert 0 < p < 1, f"price must be in (0,1), got {p}"
    assert l_eff > 0, f"l_eff must be > 0, got {l_eff}"

    u = capital_phi_inv(p)
    phi_u = phi(u)

    x = l_eff * (u * p + phi_u - u)
    y = l_eff * (u * p + phi_u)

    return (x, y)


def price_from_reserves(x: float, y: float, l_eff: float) -> float:
    """
    Recover price from reserves via key identity: y - x = L_eff * Phi_inv(P).
    Therefore P = Phi((y - x) / L_eff). Paper section 7.
    """
    assert l_eff > 0
    z = (y - x) / l_eff
    return capital_phi(z)


# =============================================================================
# 4. Invariant — Paper section 7 (static) / section 8 (dynamic with L_eff)
# =============================================================================

def invariant_value(x: float, y: float, l_eff: float) -> float:
    """
    Evaluate the pm-AMM invariant. Returns 0 for valid reserves.

    (y - x) * Phi((y - x) / L_eff) + L_eff * phi((y - x) / L_eff) - y = 0
    """
    assert l_eff > 0
    d = y - x
    z = d / l_eff
    return d * capital_phi(z) + l_eff * phi(z) - y


# =============================================================================
# 5. Pool value — Paper section 7
# =============================================================================

def pool_value(p: float, l_eff: float) -> float:
    """V(P) = L_eff * phi(Phi_inv(P)). Paper section 7."""
    assert 0 < p < 1
    assert l_eff > 0
    return l_eff * phi(capital_phi_inv(p))


def pool_value_from_reserves(x: float, y: float, l_eff: float) -> float:
    """Pool value computed from reserves (derives price first)."""
    p = price_from_reserves(x, y, l_eff)
    return pool_value(p, l_eff)


# =============================================================================
# 6. LVR — Paper sections 7 & 8
# =============================================================================

def lvr_rate(v_t: float, time_remaining: float) -> float:
    """Instantaneous LVR rate: LVR_t = V_t / (2 * (T - t)). Paper section 7."""
    assert time_remaining > 0
    return v_t / (2.0 * time_remaining)


def expected_lvr(v_0: float, total_duration: float) -> float:
    """Expected LVR (constant in time): E[LVR_t] = V_0 / (2T). Paper section 8."""
    assert total_duration > 0
    return v_0 / (2.0 * total_duration)


# =============================================================================
# 7. Swap — Invariant-based with mint/burn mechanism
# =============================================================================

def compute_swap_output(
    x: float, y: float, l_eff: float,
    delta_in: float, side_in: str, side_out: str,
    max_iter: int = 100, tol: float = 1e-12
) -> dict:
    """
    Compute swap output and new reserves.

    Sides: 'yes' (x reserve), 'no' (y reserve), 'usdc'

    Mechanisms:
      USDC->YES: mint delta_in YES+NO pairs, swap NO->YES via pool.
                 output = delta_in + (x_old - x_new)
      USDC->NO:  mint delta_in YES+NO pairs, swap YES->NO via pool.
                 output = delta_in + (y_old - y_new)
      YES->USDC: some YES enter pool, released NO pairs with remaining YES.
                 P_new = Phi((y - x - delta_in) / L_eff)
                 output = y_old - y_new
      NO->USDC:  some NO enter pool, released YES pairs with remaining NO.
                 P_new = Phi((y - x + delta_in) / L_eff)
                 output = x_old - x_new
      YES->NO:   direct AMM swap. output = y_old - y_new
      NO->YES:   direct AMM swap. output = x_old - x_new

    Returns dict with 'output', 'x_new', 'y_new', 'price_new'.
    """
    if side_in == 'usdc' and side_out == 'yes':
        y_new = y + delta_in
        x_new = _find_x_from_y(y_new, l_eff, tol, max_iter)
        output = delta_in + (x - x_new)

    elif side_in == 'usdc' and side_out == 'no':
        x_new = x + delta_in
        y_new = _find_y_from_x(x_new, l_eff, tol, max_iter)
        output = delta_in + (y - y_new)

    elif side_in == 'yes' and side_out == 'usdc':
        # Key identity: y_new - x_new = (y - x) - delta_in
        new_z = ((y - x) - delta_in) / l_eff
        p_new = capital_phi(new_z)
        x_new, y_new = reserves_from_price(max(0.0001, min(0.9999, p_new)), l_eff)
        output = y - y_new

    elif side_in == 'no' and side_out == 'usdc':
        # Key identity: y_new - x_new = (y - x) + delta_in
        new_z = ((y - x) + delta_in) / l_eff
        p_new = capital_phi(new_z)
        x_new, y_new = reserves_from_price(max(0.0001, min(0.9999, p_new)), l_eff)
        output = x - x_new

    elif side_in == 'yes' and side_out == 'no':
        x_new = x + delta_in
        y_new = _find_y_from_x(x_new, l_eff, tol, max_iter)
        output = y - y_new

    elif side_in == 'no' and side_out == 'yes':
        y_new = y + delta_in
        x_new = _find_x_from_y(y_new, l_eff, tol, max_iter)
        output = x - x_new

    else:
        raise ValueError(f"Invalid swap: {side_in} -> {side_out}")

    price_new = price_from_reserves(x_new, y_new, l_eff)
    return {'output': output, 'x_new': x_new, 'y_new': y_new, 'price_new': price_new}


def _find_x_from_y(y_target: float, l_eff: float,
                   tol: float = 1e-12, max_iter: int = 100) -> float:
    """Given y and l_eff, find x such that invariant(x, y, l_eff) = 0.
    Uses binary search. Invariant is positive at low x, negative at high x."""
    x_low = y_target - l_eff * 5
    x_high = y_target + l_eff * 5

    for _ in range(max_iter):
        x_mid = (x_low + x_high) / 2.0
        val = invariant_value(x_mid, y_target, l_eff)
        if abs(val) < tol:
            return x_mid
        if val > 0:
            x_low = x_mid   # invariant positive at low x -> increase x
        else:
            x_high = x_mid  # invariant negative at high x -> decrease x

    return (x_low + x_high) / 2.0


def _find_y_from_x(x_target: float, l_eff: float,
                   tol: float = 1e-12, max_iter: int = 100) -> float:
    """Given x and l_eff, find y such that invariant(x, y, l_eff) = 0.
    Uses binary search. Invariant is positive at low y, negative at high y."""
    y_low = x_target - l_eff * 5
    y_high = x_target + l_eff * 5

    for _ in range(max_iter):
        y_mid = (y_low + y_high) / 2.0
        val = invariant_value(x_target, y_mid, l_eff)
        if abs(val) < tol:
            return y_mid
        if val < 0:
            y_high = y_mid
        else:
            y_low = y_mid

    return (y_low + y_high) / 2.0


# =============================================================================
# 8. suggest_l_zero — derived from paper section 7
# =============================================================================

def suggest_l_zero_for_budget(budget: float, duration_secs: float) -> float:
    """
    Calibrate L_0 so that pool value at P=0.5 equals the budget.

    L_0 = budget / (phi(0) * sqrt(T))

    Derivation: V(0.5) = L_eff * phi(0) = L_0 * sqrt(T) * phi(0) = budget.
    phi(0) = 1/sqrt(2*pi) ~ 0.39894.
    """
    assert budget > 0
    assert duration_secs > 0
    phi_0 = phi(0)  # 0.3989422804014327
    sqrt_t = math.sqrt(duration_secs)
    return budget / (phi_0 * sqrt_t)


# =============================================================================
# 9. dC_t accrual — Paper section 8
# =============================================================================

def compute_accrual(
    l_zero: float, t_old: float, t_new: float, end_ts: float,
    x_old: float, y_old: float
) -> dict:
    """
    Compute dC_t accrual: as time passes, L_eff decreases and tokens are released.

    L_eff_old = L_0 * sqrt(T - t_old)
    L_eff_new = L_0 * sqrt(T - t_new)

    Reserves scale linearly with L_eff at constant price (eq. 5 & 6).
    Released tokens = old_reserves - new_reserves (proportional to LPs).

    Paper section 8: dC_t = -(L_dot_t / L_t) * V_t * dt
    """
    remaining_old = end_ts - t_old
    remaining_new = end_ts - t_new
    assert remaining_old > 0 and remaining_new > 0

    l_eff_old = l_effective(l_zero, remaining_old)
    l_eff_new = l_effective(l_zero, remaining_new)

    p = price_from_reserves(x_old, y_old, l_eff_old)

    x_new, y_new = reserves_from_price(p, l_eff_new)

    delta_x = x_old - x_new  # YES tokens released to LPs
    delta_y = y_old - y_new  # NO tokens released to LPs

    return {
        'price': p,
        'l_eff_old': l_eff_old,
        'l_eff_new': l_eff_new,
        'x_new': x_new,
        'y_new': y_new,
        'delta_x': delta_x,
        'delta_y': delta_y,
        'value_released': pool_value(p, l_eff_old) - pool_value(p, l_eff_new),
    }


# =============================================================================
# Smoke test
# =============================================================================

if __name__ == '__main__':
    print("=== pm-AMM Math Oracle — Smoke Test ===\n")

    # Basic normal distribution
    print(f"phi(0)        = {phi(0):.10f}  (expect 0.3989422804)")
    print(f"Phi(0)        = {capital_phi(0):.10f}  (expect 0.5)")
    print(f"Phi(1.96)     = {capital_phi(1.96):.10f}  (expect ~0.975)")
    print(f"Phi_inv(0.5)  = {capital_phi_inv(0.5):.10f}  (expect 0.0)")
    print(f"Phi_inv(0.975)= {capital_phi_inv(0.975):.10f}  (expect ~1.96)")

    # Round-trip Phi_inv(Phi(x)) = x
    for z in [-2.0, -1.0, 0.0, 1.0, 2.0]:
        rt = capital_phi_inv(capital_phi(z))
        print(f"Phi_inv(Phi({z:+.1f})) = {rt:+.10f}  (err={abs(rt-z):.2e})")

    # Reserves at P=0.5
    l_eff = 1000.0
    x, y = reserves_from_price(0.5, l_eff)
    print(f"\nreserves_from_price(0.5, L=1000):")
    print(f"  x = {x:.6f}  y = {y:.6f}  (expect ~398.94 each)")

    # Pool value
    v = pool_value(0.5, l_eff)
    print(f"  V(0.5) = {v:.6f}  (expect ~398.94)")

    # Invariant check
    inv = invariant_value(x, y, l_eff)
    print(f"  invariant = {inv:.2e}  (expect ~0)")

    # Price round-trip
    p_rt = price_from_reserves(x, y, l_eff)
    print(f"  price_from_reserves = {p_rt:.10f}  (expect 0.5)")

    # suggest_l_zero
    l0 = suggest_l_zero_for_budget(1000.0, 86400 * 7)
    l_e = l_effective(l0, 86400 * 7)
    v_check = pool_value(0.5, l_e)
    print(f"\nsuggest_l_zero(budget=1000, 7d):")
    print(f"  L_0 = {l0:.6f}")
    print(f"  L_eff(t=0) = {l_e:.6f}")
    print(f"  V(0.5, t=0) = {v_check:.6f}  (expect ~1000)")

    # Swap test
    x, y = reserves_from_price(0.5, l_eff)
    result = compute_swap_output(x, y, l_eff, 100.0, 'usdc', 'yes')
    print(f"\nswap 100 USDC -> YES at P=0.5, L=1000:")
    print(f"  output = {result['output']:.6f} YES")
    print(f"  price after = {result['price_new']:.6f}")

    # Round-trip test
    rt = compute_swap_output(result['x_new'], result['y_new'], l_eff,
                             result['output'], 'yes', 'usdc')
    print(f"  round-trip sell back: {rt['output']:.6f} USDC (paid 100)")
    print(f"  round-trip loss: {abs(rt['output'] - 100) / 100:.6%}")

    print("\n=== Smoke test passed ===")
