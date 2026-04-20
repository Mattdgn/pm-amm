"""
Tests exhaustifs de l'oracle pm-AMM.

Vérifie toutes les propriétés mathématiques du paper Paradigm.
Génère les vecteurs de test JSON pour cross-validation Rust.
"""

import json
import math
import sys
from pm_amm_math import (
    phi, capital_phi, capital_phi_inv, erf,
    l_effective, reserves_from_price, price_from_reserves,
    invariant_value, pool_value, pool_value_from_reserves,
    lvr_rate, expected_lvr, compute_swap_output,
    suggest_l_zero_for_budget, compute_accrual,
)

PASS = 0
FAIL = 0


def check(name: str, got: float, expected: float, tol: float = 1e-10):
    global PASS, FAIL
    err = abs(got - expected)
    ok = err < tol
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print(f"  FAIL {name}: got={got:.15f}, expected={expected:.15f}, err={err:.2e}")


def check_near_zero(name: str, got: float, tol: float = 1e-10):
    check(name, got, 0.0, tol)


# =============================================================================
# Test vectors output
# =============================================================================
test_vectors = {}


def record(section: str, key: str, value):
    if section not in test_vectors:
        test_vectors[section] = {}
    test_vectors[section][key] = value


# =============================================================================
# 1. Normal distribution fundamentals
# =============================================================================
def test_normal():
    print("--- Normal distribution ---")

    # phi(z) = PDF
    check("phi(0)", phi(0), 0.3989422804014327)
    check("phi(1)", phi(1), 0.24197072451914337)
    check("phi(-1)", phi(-1), 0.24197072451914337)  # symmetric
    check("phi(2)", phi(2), 0.05399096651318806)
    check("phi(3)", phi(3), 0.004431848411938008)

    # Phi(z) = CDF
    check("Phi(0)", capital_phi(0), 0.5)
    check("Phi(1.96)", capital_phi(1.96), 0.9750021048517796)
    check("Phi(-1.96)", capital_phi(-1.96), 0.024997895148220428)
    check("Phi(1)", capital_phi(1), 0.8413447460685429)
    check("Phi(-1)", capital_phi(-1), 0.15865525393145702)

    # Symmetry: Phi(z) + Phi(-z) = 1
    for z in [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]:
        check(f"Phi({z})+Phi({-z})=1", capital_phi(z) + capital_phi(-z), 1.0)

    # Phi_inv round-trip
    for p in [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]:
        rt = capital_phi(capital_phi_inv(p))
        check(f"Phi(Phi_inv({p}))", rt, p)

    for z in [-3.0, -2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.0]:
        rt = capital_phi_inv(capital_phi(z))
        check(f"Phi_inv(Phi({z}))", rt, z)

    # Record test vectors
    for z in [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3]:
        record("phi", str(z), phi(z))
        record("capital_phi", str(z), capital_phi(z))
    for p in [0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.999]:
        record("capital_phi_inv", str(p), capital_phi_inv(p))


# =============================================================================
# 2. Reserves — eq. (5) & (6)
# =============================================================================
def test_reserves():
    print("--- Reserves (eq. 5 & 6) ---")

    l_eff = 1000.0

    # At P=0.5: x = y (by symmetry, Phi_inv(0.5)=0)
    x, y = reserves_from_price(0.5, l_eff)
    check("x(0.5)=y(0.5)", x, y)
    check("x(0.5)=L*phi(0)", x, l_eff * phi(0))

    # Identity: y - x = L_eff * Phi_inv(P)
    for p in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
        x, y = reserves_from_price(p, l_eff)
        expected_diff = l_eff * capital_phi_inv(p)
        check(f"y-x=L*Phi_inv({p})", y - x, expected_diff)

    # Record vectors
    reserves_vectors = []
    for p in [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]:
        x, y = reserves_from_price(p, l_eff)
        reserves_vectors.append({
            "price": p, "l_eff": l_eff,
            "x": x, "y": y, "y_minus_x": y - x
        })
    record("reserves", "l_eff_1000", reserves_vectors)


# =============================================================================
# 3. Invariant
# =============================================================================
def test_invariant():
    print("--- Invariant ---")

    l_eff = 1000.0
    for p in [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]:
        x, y = reserves_from_price(p, l_eff)
        inv = invariant_value(x, y, l_eff)
        check_near_zero(f"inv(P={p})", inv)

    # Different L_eff values
    for l in [100.0, 500.0, 2000.0, 10000.0]:
        for p in [0.2, 0.5, 0.8]:
            x, y = reserves_from_price(p, l)
            inv = invariant_value(x, y, l)
            check_near_zero(f"inv(P={p},L={l})", inv)


# =============================================================================
# 4. Price round-trip
# =============================================================================
def test_price_roundtrip():
    print("--- Price round-trip ---")

    l_eff = 1000.0
    for p in [0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99]:
        x, y = reserves_from_price(p, l_eff)
        p_rt = price_from_reserves(x, y, l_eff)
        check(f"price_rt(P={p})", p_rt, p)


# =============================================================================
# 5. Pool value — Section 7
# =============================================================================
def test_pool_value():
    print("--- Pool value (section 7) ---")

    l_eff = 1000.0

    # V(0.5) = L * phi(0) = L * 0.39894...
    v = pool_value(0.5, l_eff)
    check("V(0.5)=L*phi(0)", v, l_eff * phi(0))

    # V should be maximal at P=0.5 (concavity)
    v_max = pool_value(0.5, l_eff)
    for p in [0.1, 0.3, 0.7, 0.9]:
        v_p = pool_value(p, l_eff)
        assert v_p < v_max, f"V({p}) = {v_p} should be < V(0.5) = {v_max}"

    # V from reserves should match V direct
    for p in [0.1, 0.3, 0.5, 0.7, 0.9]:
        x, y = reserves_from_price(p, l_eff)
        v_direct = pool_value(p, l_eff)
        v_reserves = pool_value_from_reserves(x, y, l_eff)
        check(f"V_reserves(P={p})=V_direct", v_reserves, v_direct)

    # Record vectors
    pv_vectors = []
    for p in [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]:
        pv_vectors.append({"price": p, "l_eff": l_eff, "pool_value": pool_value(p, l_eff)})
    record("pool_value", "l_eff_1000", pv_vectors)


# =============================================================================
# 6. LVR — Sections 7 & 8
# =============================================================================
def test_lvr():
    print("--- LVR (sections 7 & 8) ---")

    l_zero = 10.0
    total_duration = 86400 * 7  # 7 days

    # At t=0: V(0.5) = L_eff * phi(0)
    l_eff_0 = l_effective(l_zero, total_duration)
    v_0 = pool_value(0.5, l_eff_0)

    # E[LVR] = V_0 / (2T) — constant
    e_lvr = expected_lvr(v_0, total_duration)

    # LVR at t=0: V_0 / (2*T)
    lvr_0 = lvr_rate(v_0, total_duration)
    check("E[LVR]=LVR(t=0)", e_lvr, lvr_0)

    # E[LVR] constant uses EXPECTED pool value V_bar_t = V_0 * (T-t)/T
    # (section 8: dynamic pm-AMM makes V_bar linear in time remaining)
    for frac in [0.0, 0.25, 0.5, 0.75]:
        t = frac * total_duration
        remaining = total_duration - t
        v_bar_t = v_0 * remaining / total_duration  # expected pool value
        lvr_t = lvr_rate(v_bar_t, remaining)
        check(f"E[LVR](t={frac}T)=V_0/(2T)", lvr_t, e_lvr, tol=1e-6)

    record("lvr", "v_0", v_0)
    record("lvr", "e_lvr", e_lvr)


# =============================================================================
# 7. Swap
# =============================================================================
def test_swap():
    print("--- Swap ---")

    l_eff = 1000.0
    x, y = reserves_from_price(0.5, l_eff)

    # USDC → YES
    r = compute_swap_output(x, y, l_eff, 100.0, 'usdc', 'yes')
    assert r['output'] > 0, f"Swap output should be positive, got {r['output']}"
    assert r['price_new'] > 0.5, f"Price should increase after buying YES"
    inv_after = invariant_value(r['x_new'], r['y_new'], l_eff)
    check_near_zero("inv_after_swap_usdc_yes", inv_after, tol=1e-8)

    # USDC → NO (by symmetry at P=0.5, output should be same)
    r_no = compute_swap_output(x, y, l_eff, 100.0, 'usdc', 'no')
    check("swap_symmetry_0.5", r['output'], r_no['output'], tol=1e-6)

    # YES → USDC (sell)
    r_sell = compute_swap_output(x, y, l_eff, 50.0, 'yes', 'usdc')
    assert r_sell['output'] > 0, "Sell output should be positive"

    # Swap round-trip: buy YES, then sell exact same YES back
    r1 = compute_swap_output(x, y, l_eff, 10.0, 'usdc', 'yes')
    r2 = compute_swap_output(r1['x_new'], r1['y_new'], l_eff,
                             r1['output'], 'yes', 'usdc')
    loss_pct = abs(r2['output'] - 10.0) / 10.0
    assert loss_pct < 0.001, f"Swap round-trip loss {loss_pct:.4%} > 0.1%"
    print(f"  Swap round-trip loss: {loss_pct:.6%}")

    # Verify pool returns to original state after round-trip
    check("rt_x_restored", r2['x_new'], x, tol=1e-6)
    check("rt_y_restored", r2['y_new'], y, tol=1e-6)

    # Record vectors
    swap_vectors = []
    for delta in [10, 50, 100, 200]:
        r = compute_swap_output(x, y, l_eff, float(delta), 'usdc', 'yes')
        swap_vectors.append({
            "x": x, "y": y, "l_eff": l_eff,
            "delta_in": delta, "side_in": "usdc", "side_out": "yes",
            "output": r['output'],
            "x_new": r['x_new'], "y_new": r['y_new'],
            "price_new": r['price_new'],
        })
    record("swap", "at_p_0.5", swap_vectors)


# =============================================================================
# 8. suggest_l_zero
# =============================================================================
def test_suggest_l_zero():
    print("--- suggest_l_zero ---")

    # Budget 1000, 7 days → V(0.5, t=0) should be ~1000
    budget = 1000.0
    duration = 86400.0 * 7
    l0 = suggest_l_zero_for_budget(budget, duration)
    l_eff_0 = l_effective(l0, duration)
    v_0 = pool_value(0.5, l_eff_0)
    check("V(0.5)=budget", v_0, budget, tol=1e-6)

    # Budget 10000, 30 days
    l0_2 = suggest_l_zero_for_budget(10000.0, 86400.0 * 30)
    l_eff_2 = l_effective(l0_2, 86400.0 * 30)
    v_2 = pool_value(0.5, l_eff_2)
    check("V(0.5)=10000", v_2, 10000.0, tol=1e-4)

    # Daily LVR = budget / (2 * duration_days)
    daily_lvr = expected_lvr(budget, duration) * 86400.0
    expected_daily = budget / (2.0 * 7.0)
    check("daily_lvr", daily_lvr, expected_daily, tol=1e-6)

    record("suggest_l_zero", "budget_1000_7d", {
        "budget": budget, "duration_secs": duration,
        "l_zero": l0, "l_eff_0": l_eff_0, "v_0": v_0,
        "daily_lvr": daily_lvr
    })


# =============================================================================
# 9. Accrual (dC_t)
# =============================================================================
def test_accrual():
    print("--- Accrual (dC_t, section 8) ---")

    l_zero = 10.0
    end_ts = 86400.0 * 7
    t_old = 0.0
    t_new = 86400.0  # 1 day later

    l_eff_0 = l_effective(l_zero, end_ts - t_old)
    x0, y0 = reserves_from_price(0.5, l_eff_0)

    result = compute_accrual(l_zero, t_old, t_new, end_ts, x0, y0)

    # Tokens should be released (positive)
    assert result['delta_x'] > 0, "YES tokens should be released"
    assert result['delta_y'] > 0, "NO tokens should be released"

    # At P=0.5, delta_x == delta_y (symmetry)
    check("accrual_symmetry", result['delta_x'], result['delta_y'], tol=1e-6)

    # New reserves should satisfy invariant
    inv = invariant_value(result['x_new'], result['y_new'], result['l_eff_new'])
    check_near_zero("inv_after_accrual", inv)

    # Value released should be positive
    assert result['value_released'] > 0

    # At fixed P=0.5 (deterministic, no LVR), total released = V_0
    # The W_T = W_0/2 property is over EXPECTED price paths (Sprint 9 Monte Carlo)
    l_zero = 10.0
    end_ts = 86400.0 * 7
    l_eff_init = l_effective(l_zero, end_ts)
    x_cur, y_cur = reserves_from_price(0.5, l_eff_init)
    w_0 = pool_value(0.5, l_eff_init)
    total_released_value = 0.0

    steps = 100
    dt = (end_ts - 1.0) / steps
    for i in range(steps):
        t_old = i * dt
        t_new = (i + 1) * dt
        accrual = compute_accrual(l_zero, t_old, t_new, end_ts, x_cur, y_cur)
        total_released_value += accrual['value_released']
        x_cur = accrual['x_new']
        y_cur = accrual['y_new']

    remaining_value = pool_value_from_reserves(
        x_cur, y_cur, l_effective(l_zero, end_ts - steps * dt))
    total_wealth = remaining_value + total_released_value
    # At fixed P, no LVR, so W_T = W_0 (all value returned to LPs)
    check("W_T_deterministic=W_0", total_wealth, w_0, tol=w_0 * 0.02)
    print(f"  W_0 = {w_0:.6f}, W_T = {total_wealth:.6f}, ratio = {total_wealth/w_0:.4f}")

    record("accrual", "1day_at_p_0.5", {
        "l_zero": l_zero, "end_ts": end_ts,
        "delta_x": result['delta_x'], "delta_y": result['delta_y'],
        "value_released": result['value_released'],
    })


# =============================================================================
# 10. Edge cases
# =============================================================================
def test_edge_cases():
    print("--- Edge cases ---")

    l_eff = 1000.0

    # Extreme prices
    for p in [0.001, 0.01, 0.99, 0.999]:
        x, y = reserves_from_price(p, l_eff)
        inv = invariant_value(x, y, l_eff)
        check_near_zero(f"inv_extreme(P={p})", inv, tol=1e-6)
        p_rt = price_from_reserves(x, y, l_eff)
        check(f"price_rt_extreme(P={p})", p_rt, p, tol=1e-6)

    # Very small L
    x, y = reserves_from_price(0.5, 1.0)
    check("V(0.5,L=1)", pool_value(0.5, 1.0), phi(0))

    # Very large L
    x, y = reserves_from_price(0.5, 1e6)
    check("V(0.5,L=1e6)", pool_value(0.5, 1e6), 1e6 * phi(0), tol=1e-4)


# =============================================================================
# Main
# =============================================================================
if __name__ == '__main__':
    print("=== pm-AMM Math Oracle — Full Test Suite ===\n")

    test_normal()
    test_reserves()
    test_invariant()
    test_price_roundtrip()
    test_pool_value()
    test_lvr()
    test_swap()
    test_suggest_l_zero()
    test_accrual()
    test_edge_cases()

    print(f"\n=== Results: {PASS} passed, {FAIL} failed ===")

    # Export test vectors
    with open('oracle/test_vectors.json', 'w') as f:
        json.dump(test_vectors, f, indent=2)
    print(f"Test vectors written to oracle/test_vectors.json")

    sys.exit(1 if FAIL > 0 else 0)
