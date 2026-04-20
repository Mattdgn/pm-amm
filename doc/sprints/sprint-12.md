# Sprint 12 — UI complete (trade + LP + residuels)

**Duree estimee** : 7h
**Output** : Interface complete avec tous les flows utilisateur
**Dependances** : Sprint 11

## Contexte
UI complete avec trade, LP management, et surtout le widget de residuels YES+NO qui vend le produit.

## Taches

### TradePanel.tsx
- [ ] Toggle YES/NO direction
- [ ] Input USDC amount
- [ ] Preview output (calcul local via pmMath.ts) avec prix effectif et slippage estime
- [ ] Bouton "Trade" → appelle instruction `swap`
- [ ] Affichage confirmation avec tokens recus

### LpPanel.tsx
- [ ] **Deposit** :
  - Input USDC amount
  - Champ "Estimated sigma (annualized %)" optionnel
  - Appel `suggest_l_zero` si market sans LP → affiche "Suggested L_0=X, pool value=Y, daily LVR=Z"
  - Bouton "Deposit Liquidity" → appelle `deposit_liquidity`
- [ ] **Withdraw** :
  - Slider % de shares a retirer
  - Preview tokens YES+NO recuperes (calcul local)
  - Bouton "Withdraw" → appelle `withdraw_liquidity`
- [ ] Affichage : shares, collateral deposite, share % du pool

### ResidualsWidget.tsx (composant phare)
- [ ] Grosse carte mise en avant sur la page LP
- [ ] Affiche `pending_yes` et `pending_no` en live (polling 3s via useLpResiduals)
- [ ] Affiche valeur USDC equivalente : `pending_yes * P + pending_no * (1-P)`
- [ ] Bouton "Claim YES+NO" → appelle `claim_lp_residuals`
- [ ] Apres claim, propose 2 actions :
  - "Redeem as pairs" (si user a YES et NO) → `redeem_pair(min(yes, no))`
  - "Sell on pool" → redirige vers TradePanel preconfigure
- [ ] Graph Recharts : courbe `total_yes_distributed + total_no_distributed` dans le temps

### MarketChart.tsx
- [ ] Courbe prix YES dans le temps (historique via fetch events ou polling)
- [ ] Shaded area montrant `L_eff` decroissant (visualisation du dC_t)

### PositionCard.tsx
- [ ] Affiche balance YES + NO de l'user
- [ ] Si resolved : bouton "Claim Winnings" → appelle `claim_winnings`

### RedeemPairPanel.tsx
- [ ] Affiche paires redeemables : `min(user.yes, user.no)`
- [ ] Bouton "Redeem N pairs for N USDC" → appelle `redeem_pair`

### Etat resolved
- [ ] Si market resolved : masquer trade/LP panels
- [ ] Afficher banner "Resolved: [YES/NO] won"
- [ ] Bouton claim winnings visible
- [ ] redeem_pair reste accessible

## Definition of Done
- Flow complet demonstrable en 3 min
- Flow cle : LP → wait → claim YES+NO residuals → redeem_pair for USDC
- Tous les composants responsifs et fonctionnels
- Pas d'erreur console en usage normal
