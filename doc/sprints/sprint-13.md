# Sprint 13 — Polish + README + demo

**Duree estimee** : 6h
**Output** : Submission-ready pour hackathon $PREDICT
**Dependances** : Sprint 12
**Reference** : `doc/wp-para.md` — toutes les equations du README doivent etre verifiees contre le paper

## Contexte
Derniere passe : README defensible, demo video, cleanup code, submission Spark complete.

## Taches

### README.md (EN)
- [ ] **Pitch 3 lignes** : "First production pm-AMM on Solana. 100% fidelity to Paradigm's paper. Uniform LVR in price and time."
- [ ] **Section Math** :
  - Invariant dynamic avec formule LaTeX
  - 3 proprietes theoriques (uniform LVR, constant E[LVR], W_T = W_0/2)
  - Reference paper Paradigm
- [ ] **Section "The dC_t mechanism — why this is different"** :
  - Explication pedagogique : LPs recoivent un flux continu de tokens YES+NO
  - Schema timeline : deposit → accrual continu → claim → redeem/trade
  - Test conservation visualise (graph theorique vs observe)
- [ ] **Section "Properties verified on-chain"** :
  - Lister 3 proprietes avec tests et tolerances mesurees
- [ ] **Section "Robustness beyond the Gaussian model"** :
  - Resultats test D (jump) et E (MC) avec ecarts observes
  - Discussion : "For events with potential jumps, expect LVR 30-50% higher than theoretical"
- [ ] **Section "Composability"** :
  - Interface CPI : swap, deposit, suggest_l_zero
  - Exemple code : vault auto-LP
- [ ] **Section "Known limitations"** : oracle admin-only, binary only, 0% fees
- [ ] **Section "Roadmap"** : oracle, multi-outcome, fees, hedging

### Diagrammes
- [ ] Archi systeme (mermaid dans README)
- [ ] Flow dC_t timeline (mermaid)
- [ ] Conservation test results (graph embarque ou screenshot)

### Demo video (2-3 min)
- [ ] Script video :
  - Hook 10s : "Paradigm published pm-AMM 18 months ago. Nobody shipped it. I did, in 72h, with 100% fidelity."
  - Math 30s : invariant + 3 proprietes
  - dC_t demo 60s : create → LP 1000 → warp 2 days → claim YES+NO → redeem_pair
  - Swap + resolve 30s
  - Composability suggest_l_zero 15s
  - Robustness tests 15s
  - CTA 10s
- [ ] Enregistrer la demo

### Cleanup
- [ ] Supprimer tous les `console.log` de debug
- [ ] Verifier : aucun `unwrap` unsafe en Rust
- [ ] Commentaires sur math non-evidente uniquement
- [ ] `.gitignore` complet (target, node_modules, .env, .anchor)

### Submission
- [ ] Repo public propre
- [ ] Tweet thread draft (degen/builder tone)
- [ ] Devis Spark dans README : $9k ($6k USDG + $3k $PREDICT), milestones

## Definition of Done
- Submission Spark complete : repo + video + devis + property verification report
- README defensible avec math et resultats de tests
- Code propre, zero warnings, zero debug artifacts
