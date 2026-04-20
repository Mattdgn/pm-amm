"""
Oracle de vérité — pm-AMM math (Paradigm paper, Moallemi & Robinson 2024).

Utilise scipy.stats.norm comme référence exacte.
Chaque fonction est tracée à sa section du paper (doc/wp-para.md).

Usage:
    python3 oracle/pm_amm_math.py          # smoke test
    python3 oracle/test_oracle.py          # full test suite
    python3 oracle/generate_test_vectors.py # export JSON for Rust
"""

import math
from scipy.stats import norm


# =============================================================================
# 1. Distribution normale standard — scipy wrappers
# =============================================================================

def phi(z: float) -> float:
    """PDF normale standard: (1/sqrt(2*pi)) * exp(-z^2/2)."""
    return norm.pdf(z)


def capital_phi(z: float) -> float:
    """CDF normale standard: Phi(z) = P(Z <= z)."""
    return norm.cdf(z)


def capital_phi_inv(p: float) -> float:
    """Inverse CDF (quantile function). p in (0, 1)."""
    return norm.ppf(p)


def erf(x: float) -> float:
    """Error function. Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))."""
    return math.erf(x)


# =============================================================================
# 2. Liquidity — Section 8
# =============================================================================

def l_effective(l_zero: float, time_remaining: float) -> float:
    """L_eff = L_0 * sqrt(T - t). Paper section 8."""
    assert time_remaining > 0, "time_remaining must be > 0"
    return l_zero * math.sqrt(time_remaining)


# =============================================================================
# 3. Reserves — Equations (5) & (6), Section 7
# =============================================================================

def reserves_from_price(p: float, l_eff: float) -> tuple[float, float]:
    """
    Compute optimal reserves (x*, y*) for price P and liquidity L_eff.

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
    Recover price from reserves using identity: y - x = L_eff * Phi_inv(P).
    Therefore P = Phi((y - x) / L_eff). Paper section 7.
    """
    assert l_eff > 0
    z = (y - x) / l_eff
    return capital_phi(z)


# =============================================================================
# 4. Invariant — Section 8 (dynamic version)
# =============================================================================

def invariant_value(x: float, y: float, l_eff: float) -> float:
    """
    Evaluate the pm-AMM invariant. Should be 0 for valid reserves.

    (y - x) * Phi((y - x) / L_eff) + L_eff * phi((y - x) / L_eff) - y = 0
    """
    assert l_eff > 0
    d = y - x
    z = d / l_eff
    return d * capital_phi(z) + l_eff * phi(z) - y


# =============================================================================
# 5. Pool value — Section 7
# =============================================================================

def pool_value(p: float, l_eff: float) -> float:
    """
    V(P) = L_eff * phi(Phi_inv(P)). Paper section 7.
    """
    assert 0 < p < 1
    assert l_eff > 0
    return l_eff * phi(capital_phi_inv(p))


def pool_value_from_reserves(x: float, y: float, l_eff: float) -> float:
    """Pool value computed from reserves (derive price first)."""
    p = price_from_reserves(x, y, l_eff)
    return pool_value(p, l_eff)


# =============================================================================
# 6. LVR — Section 7 & 8
# =============================================================================

def lvr_rate(v_t: float, time_remaining: float) -> float:
    """
    Instantaneous LVR rate: LVR_t = V_t / (2 * (T - t)). Paper section 7.
    """
    assert time_remaining > 0
    return v_t / (2.0 * time_remaining)


def expected_lvr(v_0: float, total_duration: float) -> float:
    """
    Expected LVR (constant): E[LVR_t] = V_0 / (2T). Paper section 8.
    """
    assert total_duration > 0
    return v_0 / (2.0 * total_duration)


# =============================================================================
# 7. Swap — Binary search on invariant
# =============================================================================

def compute_swap_output(
    x: float, y: float, l_eff: float,
    delta_in: float, side_in: str, side_out: str,
    max_iter: int = 100, tol: float = 1e-12
) -> dict:
    """
    Compute swap output and new reserves.

    Sides: 'yes' (x), 'no' (y), 'usdc'

    Mechanisms:
      USDC→YES: mint pairs, swap NO→YES. output = delta_in + (x - x_new)
      USDC→NO:  mint pairs, swap YES→NO. output = delta_in + (y - y_new)
      YES→USDC: split YES into pool + pairing. P_new = Phi((y-x-delta)/L)
      NO→USDC:  split NO into pool + pairing. P_new = Phi((y-x+delta)/L)
      YES→NO:   direct AMM swap. output = y - y_new
      NO→YES:   direct AMM swap. output = x - x_new

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
        # P_new = Phi((y - x - delta_in) / L_eff)
        new_z = ((y - x) - delta_in) / l_eff
        p_new = capital_phi(new_z)
        x_new, y_new = reserves_from_price(max(0.0001, min(0.9999, p_new)), l_eff)
        output = y - y_new

    elif side_in == 'no' and side_out == 'usdc':
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
    """Given y and l_eff, find x such that invariant(x, y, l_eff) = 0."""
    # From invariant: x must satisfy
    # (y-x)*Phi((y-x)/L) + L*phi((y-x)/L) - y = 0
    # x is bounded: for p->0, x->-inf; for p->1, x-> y
    # Use Newton's method starting from a reasonable guess
    p_guess = 0.5
    x, _ = reserves_from_price(p_guess, l_eff)
    # Adjust: we know y, find x
    # Binary search: invariant(x_low) > 0, invariant(x_high) < 0
    x_low = y_target - l_eff * 5  # p ~ 1
    x_high = y_target + l_eff * 5  # p ~ 0

    for _ in range(max_iter):
        x_mid = (x_low + x_high) / 2.0
        val = invariant_value(x_mid, y_target, l_eff)
        if abs(val) < tol:
            return x_mid
        if val > 0:
            x_low = x_mid   # inv positive at low x → increase x
        else:
            x_high = x_mid  # inv negative at high x → decrease x

    return (x_low + x_high) / 2.0


def _find_y_from_x(x_target: float, l_eff: float,
                   tol: float = 1e-12, max_iter: int = 100) -> float:
    """Given x and l_eff, find y such that invariant(x, y, l_eff) = 0."""
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
# 8. suggest_l_zero — Section 7
# =============================================================================

def suggest_l_zero_for_budget(budget: float, duration_secs: float) -> float:
    """
    L_0 = budget / (phi(0) * sqrt(T))

    At P=0.5, V(0.5) = L_eff * phi(0) = L_0 * sqrt(T) * phi(0) = budget.
    phi(0) = 1/sqrt(2*pi) ≈ 0.39894.
    """
    assert budget > 0
    assert duration_secs > 0
    phi_0 = phi(0)  # 0.3989422804014327
    sqrt_t = math.sqrt(duration_secs)
    return budget / (phi_0 * sqrt_t)


# =============================================================================
# 9. dC_t accrual — Section 8
# =============================================================================

def compute_accrual(
    l_zero: float, t_old: float, t_new: float, end_ts: float,
    x_old: float, y_old: float
) -> dict:
    """
    Compute dC_t accrual: when L_eff decreases, tokens are released.

    L_eff_old = L_0 * sqrt(T - t_old)
    L_eff_new = L_0 * sqrt(T - t_new)

    New reserves at same price but lower L_eff.
    Released tokens = old_reserves - new_reserves.
    """
    remaining_old = end_ts - t_old
    remaining_new = end_ts - t_new
    assert remaining_old > 0 and remaining_new > 0

    l_eff_old = l_effective(l_zero, remaining_old)
    l_eff_new = l_effective(l_zero, remaining_new)

    p = price_from_reserves(x_old, y_old, l_eff_old)

    x_new, y_new = reserves_from_price(p, l_eff_new)

    delta_x = x_old - x_new  # YES released
    delta_y = y_old - y_new  # NO released

    return {
        'price': p,
        'l_eff_old': l_eff_old,
        'l_eff_new': l_eff_new,
        'x_new': x_new,
        'y_new': y_new,
        'delta_x': delta_x,  # YES tokens released to LPs
        'delta_y': delta_y,  # NO tokens released to LPs
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
