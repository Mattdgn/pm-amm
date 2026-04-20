# pm-AMM: A Uniform AMM for Prediction Markets

**Auteurs** : Ciamac Moallemi, Dan Robinson (Paradigm)
**Date** : 5 novembre 2024
**Source** : https://www.paradigm.xyz/2024/11/pm-amm
**Ref LVR** : Milionis et al. — https://arxiv.org/abs/2208.06046

---

## Table des matieres

1. Introduction
2. Contributions
3. Background (Prediction markets, LVR et uniformite)
4. Prior work
5. Model
6. Uniform AMMs
7. Static pm-AMM
8. Dynamic pm-AMM
9. Conclusion

---

## 1. Introduction

Nouveau AMM customise pour les prediction markets : le **pm-AMM**.

Les AMMs existants sont un mauvais fit pour les outcome tokens (qui resolvent a $1 ou $0) :
- La volatilite depend de la probabilite courante et du temps restant
- Les LPs perdent essentiellement toute leur valeur a l'expiration

Question fondamentale : etant donne un modele d'actif, quel AMM est optimal ? Reponse proposee via le concept de **loss-vs-rebalancing (LVR)**.

---

## 2. Contributions

### Gaussian Score Dynamics

Modele pour les prix des outcome tokens. Adapte aux prediction markets sur un random walk (score de basket, marge electorale, prix d'actif vs strike).

### Static pm-AMM invariant

```
(y - x) * Phi((y - x) / L) + L * phi((y - x) / L) - y = 0
```

Ou :
- `x` = reserves de l'outcome token YES
- `y` = reserves de l'outcome token NO
- `L` = parametre de liquidite (scaling)
- `phi` = PDF de la loi normale standard
- `Phi` = CDF de la loi normale standard

### Dynamic pm-AMM invariant (depend du temps)

```
(y - x) * Phi((y - x) / (L * sqrt(T - t))) + L * sqrt(T - t) * phi((y - x) / (L * sqrt(T - t))) - y = 0
```

Le dynamic pm-AMM reduit sa liquidite au fil du temps pour que l'E[LVR] reste constant.

---

## 3. Background

### 3.1 Prediction markets

Les outcome tokens ont une volatilite qui depend de :
- La probabilite courante de l'evenement
- Le temps restant avant expiration

Plus le score est proche de l'egalite et moins il reste de temps, plus les tokens sont volatils.

Exemples de fit Gaussian score dynamics :
- Match de basket (random walk = difference de score)
- Election presidentielle (random walk = marge de votes)
- Prix d'un actif vs strike (random walk = log prix - strike)

**Hypothese simplificatrice** : le prix de l'outcome token = probabilite que l'evenement se realise. Ignore les preferences de risque et de temps.

### 3.2 Loss-vs-rebalancing (LVR) et uniformite

**LVR** = taux auquel l'AMM perd de l'argent a cause de l'arbitrage. Les prix de l'AMM deviennent stale quand de nouvelles informations arrivent, et les arbitrageurs exploitent ces prix desavantages.

Sans frais de trading, LVR = perte d'un LP qui delta-hedge sa position.

On ne peut pas eliminer le LVR (sauf en supprimant tout trading). Mais on peut le rendre **uniforme** : le pourcentage de pool value perdu ne depend pas du prix courant.

**Definition — Uniform AMM** : AMM dont le LVR attendu est une fraction constante de la pool value, independamment du prix courant.

Pour geometric Brownian motion → le seul AMM uniforme est le geometric mean market maker (Uniswap/Balancer) : `x^theta * y^(1-theta) = L`.

Mais cet AMM n'est PAS uniforme pour les Gaussian score dynamics. Le LMSR non plus.

---

## 4. Prior work

- **LMSR** (Hanson) : `2^(-x/L) + 2^(-y/L) = 1` — originellement concu pour les prediction markets
- **StableSwap** (Curve) : concentre la liquidite a un prix, mais sans modele de prix
- **YieldSpace** : pour les zero-coupon bonds, mais modele de prix incomplet
- **Goyal et al.** : maximise la liquidite active attendue (direction opposee a l'approche LVR)

---

## 5. Model

### Automated market making

AMM qui trade deux actifs : `x` (paie $1 si evenement) et `y` (paie $1 sinon). Invariant `f(x, y) = L`.

**Pool value function** (eq. 1) :

```
V(P) = minimize Px + (1-P)y
        subject to f(x, y) = L
```

C'est la valeur du pool quand le prix de `x` est `P`. Le prix de `y` est `1 - P`.

**Exemple 1 — CPMM** : `f(x,y) = sqrt(xy)` → `V(P) = 2L * sqrt(P * (1-P))`

**Exemple 2 — LMSR** : `2^(-x/L) + 2^(-y/L) = 1` → `V(P) = -L * {P * log2(P) + (1-P) * log2(1-P)}`

### Lemma 1

Pour tout prix `P >= 0` :
1. `V'(P) = x*(P) - y*(P)`
2. `V''(P) = x*'(P) - y*'(P) <= 0` (concavite)

### Gaussian score dynamics

Processus de score `Z_t` = mouvement brownien avec volatilite `sigma` :

```
dZ_t = sigma * dB_t
```

Prix a l'instant `t` :

```
P_t = Phi(Z_t / (sigma * sqrt(T - t)))
```

Dynamique du prix (par Ito) :

```
dP_t = phi(Phi_inv(P_t)) / sqrt(T - t) * dB_t
```

**Observation critique** : la dynamique du prix `P_t` ne depend PAS de `sigma`. Le `sigma` n'affecte que la conversion score→prix, pas la dynamique du prix elle-meme.

---

## 6. Uniform AMMs

### Loss-versus-rebalancing

Pool value evolue selon (eq. 2) :

```
dV_t = (1/2) * phi(Phi_inv(P_t))^2 / (T-t) * V''(P_t) * dt
       + (x*(P_t) - y*(P_t)) * dP_t
```

- Premier terme : drift negatif = LVR (perte aux arbitrageurs)
- Deuxieme terme : martingale (risque de marche)

**Taux instantane de LVR** (eq. 3) :

```
LVR_t = -(1/2) * phi(Phi_inv(P_t))^2 / (T-t) * V''(P_t) >= 0
```

### Derivation du uniform AMM

Pour que `LVR_t = alpha * V_t` avec `alpha = beta / (T-t)` :

```
LVR_t = beta * V_t / (T - t)
```

Ce qui donne l'ODE (eq. 4) :

```
phi(Phi_inv(P))^2 * V''(P) + 2 * beta * V(P) = 0
```

---

## 7. Static pm-AMM

### Pool definition

Changement de variable `u = Phi_inv(P)`. Avec **`beta = 1/2`**, la solution satisfait l'ODE et la concavite :

```
V(P) = L * phi(Phi_inv(P))                                    — pool value
```

**Reserves** (eq. 5 & 6) :

```
x*(P) = L * { Phi_inv(P) * P + phi(Phi_inv(P)) - Phi_inv(P) }    — eq. (5)
y*(P) = L * { Phi_inv(P) * P + phi(Phi_inv(P)) }                  — eq. (6)
```

**Identite cle** :

```
y*(P) - x*(P) = L * Phi_inv(P)
```

**Invariant** (substitution dans eq. 5) :

```
(y - x) * Phi((y - x) / L) + L * phi((y - x) / L) - y = 0
```

### Proprietes du static pm-AMM

**LVR uniforme en prix** :

```
LVR_t = V_t / (2 * (T - t))
```

**Pool value attendue** :

```
dV_bar/dt = -V_bar / (2 * (T - t))
```

Solution :

```
V_bar_t = V_0 * sqrt((T - t) / T)
```

La pool value decroit selon la racine carree du temps restant.

---

## 8. Dynamic pm-AMM

### Probleme du static

Le static pm-AMM a un LVR uniforme en *prix* mais qui augmente dans le *temps* (inversement proportionnel a `T - t`).

### Dynamic liquidity

On permet aux LPs de retirer de la liquidite au fil du temps :

```
V(P, t) = L_t * phi(Phi_inv(P))
```

Evolution du pool value (eq. 7, par Ito) :

```
dV_t = (L_dot_t / L_t - 1 / (2*(T-t))) * V_t * dt
       + (x*(P_t) - y*(P_t)) * dP_t
```

### Processus de retrait dC_t

`C_t` = valeur cumulative en dollars de la liquidite retiree.

```
dC_t = -(L_dot_t / L_t) * V_t * dt
```

### Wealth totale des LPs

```
W_t = V_t + C_t     (pool value + liquidite retiree)
```

Evolution :

```
dW_t = -1 / (2*(T-t)) * V_t * dt + (x*(P_t) - y*(P_t)) * dP_t
```

Wealth attendue (eq. 8) :

```
W_bar_t = W_0 - integral_0_t [ V_bar_s / (2*(T-s)) ] ds
```

### Choix `L_t = L_0 * sqrt(T - t)` → Constant LVR

C'est le **dynamic pm-AMM**. Pool value attendue :

```
dV_bar/dt = -V_bar / (T - t)
```

Solution :

```
V_bar_t = V_0 * (T - t) / T                   — decroit LINEAIREMENT
```

Taux de LVR :

```
LVR_t = V_t / (2 * (T - t))
```

**LVR attendu CONSTANT** :

```
E[LVR_t] = V_bar_t / (2 * (T - t)) = V_0 / (2T)     — CONSTANT dans le temps
```

### Wealth finale attendue

```
W_bar_T = W_0 - integral_0_T [ V_0 / (2T) ] dt = W_0 - V_0/2 = W_0/2
```

**La moitie de la wealth initiale est perdue a l'expiration.**

---

## 9. Conclusion

Le pm-AMM est utile pour les prediction markets sous Gaussian score dynamics. La methodologie des uniform AMMs est applicable a d'autres types d'actifs (bonds, options, stablecoins, derivatives).

---

## Resume des equations cles pour l'implementation

| # | Equation | Ref paper |
|---|----------|-----------|
| 1 | `L_eff = L_0 * sqrt(T - t)` | Section 8, constant LVR |
| 2 | `V(P) = L_eff * phi(Phi_inv(P))` | Section 7, pool value |
| 3 | `x*(P) = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) - Phi_inv(P) }` | Eq. (5) |
| 4 | `y*(P) = L_eff * { Phi_inv(P)*P + phi(Phi_inv(P)) }` | Eq. (6) |
| 5 | `y - x = L_eff * Phi_inv(P)` | Identite cle |
| 6 | `(y-x)*Phi((y-x)/L_eff) + L_eff*phi((y-x)/L_eff) - y = 0` | Invariant dynamic |
| 7 | `LVR_t = V_t / (2*(T-t))` | Section 7 |
| 8 | `E[LVR_t] = V_0 / (2T)` | Section 8 |
| 9 | `dC_t = -(L_dot_t / L_t) * V_t * dt` | Section 8, retrait LP |
| 10 | `W_t = V_t + C_t` | Section 8, wealth LP |
| 11 | `E[W_T] = W_0 / 2` | Section 8, wealth finale |
| 12 | `beta = 1/2` | Section 7, ODE solution |

### Fonctions mathematiques requises

- `phi(z) = (1/sqrt(2*pi)) * exp(-z^2/2)` — PDF normale standard
- `Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))` — CDF normale standard
- `Phi_inv(p)` — inverse CDF (Acklam ou equivalent)
- `erf(x)` — error function (Abramowitz & Stegun 7.1.26)
