# Business Plan Module - Design Document

> **Status**: In Development  
> **Branch**: `feature/business-plan`  
> **Created**: 2026-02-13

---

## 1. Obiettivo

Modulo per la **formulazione del Business Plan di gara Poste**, integrato con il simulatore scoring esistente.

**Scopo**: dato un capitolato Poste, suggerire:
- Mix risorse ottimale
- Pricing per TOW
- Sconto per raggiungere margine target
- Probabilità di vittoria (integrato con Score Simulator)

---

## 2. Concetti Chiave Poste

### 2.1 Servizi a Task

Struttura gerarchica:
```
Progetto
  └── Work Package (WP)
        ├── Obiettivi vincolanti
        ├── Buono di Consegna (avvio)
        └── Type of Work (TOW)
              └── Iniziative (attività standard)
                    └── Deliverable
```

- Work Package vincolato al raggiungimento obiettivi
- Erogazione in affiancamento Poste o con System Integrator
- Team secondo specifiche Tabelle Poste

### 2.2 Servizi a Corpo

- Deliverable fisso, prezzo fisso
- Rischio su fornitore
- Da gestire insieme ai Task

### 2.3 Dati da Capitolato Poste

**Tabella Composizione Team**
| Campo | Descrizione |
|-------|-------------|
| Profilo | Figura professionale richiesta |
| FTE | Full Time Equivalent |
| GG/anno | Giorni anno (1 FTE = 220 GG) |
| % per TOW | Ripartizione effort per TOW |

**Tabelle TOW**
| Campo | Descrizione |
|-------|-------------|
| TOW ID | Identificativo |
| Peso % | Peso su effort complessivo |
| Attività | Attività standard incluse |
| Deliverable | Output richiesti |

---

## 3. Parametri Standard

| Parametro | Valore |
|-----------|--------|
| Giorni/FTE/anno (Poste) | **220** |
| Governance % | Variabile per BP |
| Risk Contingency % | Variabile per BP |
| Riuso/Efficienza % | 0-50%+ (caso per caso) |
| Max Subappalto | 0-20% importo |

---

## 4. Struttura Organizzativa Lutech

### 4.1 Practice

Ogni TOW viene assegnato a una **Practice interna**:

```
LOTTO
  ├── TOW_01 → Practice Data & AI
  ├── TOW_02 → Practice Development
  └── TOW_03 → Practice QA Services
```

**Regole**:
- 1 TOW = 1 Practice (assegnazione esclusiva)
- Ogni Practice ha catalogo profili/tariffe proprio
- Output per Poste: prezzo unitario per TOW

### 4.2 RTI (Raggruppamento Temporaneo Imprese)

Se RTI:
- Calcoli basati solo su **quota Lutech**
- Partner gestiscono autonomamente la loro quota
- Governance Lutech include coordinamento RTI

```
Offerta RTI     = €5.000.000
Quota Lutech    = 70%
Revenue Lutech  = €3.500.000
Costi Lutech    = solo risorse Lutech + governance
Margine Lutech  = (Revenue - Costi) / Revenue
```

---

## 5. Leve di Ottimizzazione

### 5.1 Rettifica Volumi (a monte)

Poste spesso sovrastima FTE. Lutech può rettificare a 3 livelli:

| Livello | Descrizione | Esempio |
|---------|-------------|---------|
| **Globale** | Rettifica su tutto l'effort | -10% complessivo |
| **Per TOW** | Rettifica su TOW specifici | TOW_02: -15% |
| **Per Profilo** | Rettifica su figure specifiche | PM: -50%, Tester: -25% |

### 5.2 Fattore Riuso

Efficienza operativa post-rettifica:
- Riuso asset, know-how, acceleratori
- Range: 0% - 50%+

### 5.3 Mapping Profili

Profili Poste → Mix figure Lutech:
```
Senior Developer (Poste) → 60% Dev Sr + 40% Dev Mid (Lutech)
```

### 5.4 Assegnazione Practice

TOW → Practice con catalogo tariffe specifico

### 5.5 Subappalto

- 0-20% dell'importo di aggiudicazione
- Assegnazione flessibile per TOW

### 5.6 Ottimizzazione Temporale del Mix

Oltre al mapping statico, è possibile definire un **mix di profili interni variabile nel tempo**. Per un profilo richiesto da Poste, si può specificare una combinazione di profili Lutech le cui percentuali cambiano durante la vita del contratto (es. di anno in anno).

Questo permette un'ottimizzazione progressiva dei costi, ad esempio aumentando la percentuale di profili con seniority inferiore man mano che il progetto matura.

**Esempio**: Un "Senior Developer" di Poste può essere mappato come:
- **Anno 1**: 80% Lutech Sr. Developer, 20% Lutech Mid. Developer
- **Anno 2**: 60% Lutech Sr. Developer, 40% Lutech Mid. Developer
- **Anno 3**: 50% Lutech Sr. Developer, 30% Lutech Mid. Developer, 20% Lutech Jr. Developer

---

## 6. Formula Calcolo

### 6.1 Flusso Calcolo Effort

```
FTE_Poste (da capitolato)
    │
    ▼ STEP 1: RETTIFICA VOLUMI
    │
    │ FTE_rett = FTE_Poste × factor_global × factor_tow × factor_profile
    │
    ▼ STEP 2: FATTORE RIUSO
    │
    │ FTE_eff = FTE_rett × (1 - reuse_factor)
    │
    ▼ STEP 3: CONVERSIONE GG
    │
    │ GG = FTE_eff × 220
    │
    ▼ STEP 4: MAPPING + COSTO
    │
    │ Costo = GG × tariffa_lutech_mappata
    │
    ▼ STEP 5: OVERHEAD
    │
    │ Costo_finale = Costo × (1 + governance%) × (1 + risk%)
```

### 6.2 Formula Margine

**Caso Singolo (non RTI)**
```
Revenue = Base × (1 - Sconto)
Costi = Team + Governance + Risk + Subappalto
Margine = (Revenue - Costi) / Revenue
```

**Caso RTI**
```
Revenue_Lutech = Base × (1 - Sconto) × Quota_Lutech
Costi_Lutech = Team_Lutech + Governance + Risk
Margine_Lutech = (Revenue_Lutech - Costi_Lutech) / Revenue_Lutech
```

### 6.3 Esempio Calcolo

```
TOW_02 - Sviluppo

DA CAPITOLATO:
  Senior Dev: 3.0 FTE, Developer: 5.0 FTE, Tester: 2.0 FTE
  TOTALE: 10.0 FTE

RETTIFICA:
  Globale: -10%, TOW_02: -15%, Tester: -25%
  → 7.28 FTE

RIUSO (18%):
  → 5.97 FTE

CONVERSIONE:
  5.97 × 220 = 1.313 GG

SAVING TOTALE: -40.3%
```

---

## 7. Modello Dati

### 7.1 Master Data

```python
class Practice(Base):
    """Practice interna Lutech"""
    __tablename__ = "practices"
    
    id = Column(String, primary_key=True)      # "data_ai"
    label = Column(String)                      # "Data & AI"
    profiles = Column(JSON)                     # Catalogo profili
    # profiles: [{id, label, seniority, daily_rate}]


class ProfileCatalog(Base):
    """Profili globali (cross-practice)"""
    __tablename__ = "profile_catalog"
    
    id = Column(String, primary_key=True)
    label = Column(String)
    seniority = Column(String)                  # jr/mid/sr/expert
    # Il daily_rate definisce il costo standard giornaliero della risorsa interna
    daily_rate = Column(Float)
    practice_id = Column(String, ForeignKey("practices.id"))
```

### 7.2 Business Plan

```python
class BusinessPlanModel(Base):
    """Business Plan per lotto"""
    __tablename__ = "business_plans"
    
    id = Column(Integer, primary_key=True)
    lot_key = Column(String, ForeignKey("lot_configs.name"))
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    
    # Parametri generali
    duration_months = Column(Integer)
    governance_pct = Column(Float, default=0.10)
    risk_contingency_pct = Column(Float, default=0.05)
    
    # Da capitolato Poste (JSON)
    team_composition = Column(JSON)
    # [{profile_id, label, fte, days_year, tow_allocation: {tow_id: pct}}]
    
    tows = Column(JSON)
    # [{tow_id, label, type, weight_pct, activities, deliverables}]
    
    # RETTIFICA VOLUMI (JSON)
    volume_adjustments = Column(JSON)
    # {
    #   "global": 0.90,
    #   "by_tow": {"TOW_02": 0.85},
    #   "by_profile": {"PM": 0.50, "Tester": 0.75}
    # }
    
    # RIUSO
    reuse_factor = Column(Float, default=0.0)
    
    # ASSEGNAZIONE TOW → PRACTICE (JSON)
    tow_assignments = Column(JSON)
    # {"TOW_01": "practice_data", "TOW_02": "practice_dev"}
    
    # MAPPING PROFILI (JSON)
    # Supporta l'ottimizzazione temporale: per ogni profilo Poste, è possibile 
    # definire una lista di "mix" validi per periodi diversi (es. per anno).
    # Se esiste un solo elemento, quel mix è valido per tutta la durata.
    profile_mappings = Column(JSON)
    # {
    #   "Senior Developer": [
    #     {
    #       "period": "Anno 1",
    #       "mix": [
    #         {"lutech_profile": "dev_sr", "pct": 0.8},
    #         {"lutech_profile": "dev_mid", "pct": 0.2}
    #       ]
    #     },
    #     {
    #       "period": "Anno 2+",
    #       "mix": [
    #         {"lutech_profile": "dev_sr", "pct": 0.6},
    #         {"lutech_profile": "dev_mid", "pct": 0.4}
    #       ]
    #     }
    #   ]
    # }
    
    # SUBAPPALTO (JSON)
    subcontract_config = Column(JSON)
    # {"quota_pct": 0.15, "partner": "PartnerX", "tows": ["TOW_03"]}
    
    # OUTPUT CALCOLATI (JSON)
    tow_costs = Column(JSON)           # {tow_id: cost}
    tow_prices = Column(JSON)          # {tow_id: price}
    total_cost = Column(Float)
    total_price = Column(Float)
    margin_pct = Column(Float)
```

---

## 8. API Endpoints

```
# Business Plan CRUD
GET  /api/business-plan/{lot_key}
POST /api/business-plan/{lot_key}
DELETE /api/business-plan/{lot_key}

# Calcoli
GET  /api/business-plan/{lot_key}/calculate?discount=XX
POST /api/business-plan/{lot_key}/calculate
GET  /api/business-plan/{lot_key}/scenarios
GET  /api/business-plan/{lot_key}/find-discount?target_margin=XX

# Master Data
GET  /api/practices
POST /api/practices
GET  /api/practices/{id}/profiles
POST /api/practices/{id}/profiles
```

---

## 9. Servizi Backend

```python
# backend/services/business_plan_service.py

class BusinessPlanService:
    DAYS_PER_FTE = 220
    
    @staticmethod
    def apply_volume_adjustments(bp, team_composition) -> dict:
        """Applica rettifiche volumi (global, per TOW, per profilo)"""
        pass
    
    @staticmethod
    def apply_reuse_factor(effort, reuse_factor) -> float:
        """Applica fattore riuso"""
        return effort * (1 - reuse_factor)
    
    @staticmethod
    def calculate_tow_cost(bp, tow_id) -> float:
        """Calcola costo singolo TOW"""
        pass
    
    @staticmethod
    def calculate_total_cost(bp) -> dict:
        """Calcola costi totali con breakdown"""
        return {
            "team": ...,
            "governance": ...,
            "risk": ...,
            "subcontract": ...,
            "total": ...
        }
    
    @staticmethod
    def calculate_margin(bp, discount_pct, is_rti=False, quota_lutech=1.0) -> dict:
        """Calcola margine (singolo o RTI)"""
        pass
    
    @staticmethod
    def find_discount_for_margin(bp, target_margin) -> float:
        """Trova sconto per raggiungere margine target"""
        pass
    
    @staticmethod
    def generate_scenarios(bp) -> list:
        """Genera 3 scenari: Conservative/Balanced/Aggressive"""
        pass
```

---

## 10. Componenti Frontend

```
frontend/src/features/business-plan/
├── components/
│   ├── TeamCompositionTable.jsx     # Input team da capitolato
│   ├── TowConfigTable.jsx           # Configurazione TOW
│   ├── VolumeAdjustments.jsx        # Slider rettifica volumi
│   ├── PracticeAssignment.jsx       # Assegnazione TOW → Practice
│   ├── ProfileMappingEditor.jsx     # Mapping Poste → Lutech (statico e time-varying)
│   ├── ParametersPanel.jsx          # Governance, Risk, Riuso
│   ├── SubcontractManager.jsx       # Gestione subappalti
│   ├── CostBreakdown.jsx            # Breakdown costi (chart)
│   ├── TowPricingTable.jsx          # Prezzi per TOW
│   ├── MarginSimulator.jsx          # Slider sconto ↔ margine
│   ├── ScenarioCards.jsx            # 3 scenari suggeriti
│   └── PracticeSummary.jsx          # Riepilogo per Practice
├── context/
│   └── BusinessPlanContext.jsx
└── pages/
    └── BusinessPlanPage.jsx
```

---

## 11. Integrazione con Simulator

```
┌─────────────────────────────────────────────────────────────┐
│                    LOT SELECTOR                              │
│                        │                                     │
│          ┌─────────────┴─────────────┐                      │
│          ▼                           ▼                       │
│  ┌───────────────┐          ┌───────────────┐               │
│  │   SIMULATOR   │          │ BUSINESS PLAN │               │
│  │   (Scoring)   │          │   (Costing)   │               │
│  ├───────────────┤          ├───────────────┤               │
│  │ Tech Score    │          │ Rettifica Vol │               │
│  │ Econ Score    │◄────────►│ Costi per TOW │               │
│  │ Monte Carlo   │ discount │ Margine       │               │
│  │ Win Prob      │          │ Practice view │               │
│  └───────────────┘          └───────────────┘               │
│                        │                                     │
│                        ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              UNIFIED DECISION VIEW                     │  │
│  │  Score: 87.5  |  Margine: 21%  |  Win: 68%            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Fasi di Sviluppo

### Fase 1: Foundation + Navigation ✅
- [x] Modelli database (BusinessPlan, Practice, ProfileCatalog)
- [x] Migration automatica (`create_all()`)
- [x] Schemi Pydantic (12 classi)
- [x] CRUD base (BP, Practice, ProfileCatalog + `seed_practices()`)
- [x] BusinessPlanService (volume adj, reuse, margin, scenarios)
- [x] API endpoints (`/api/business-plan/`, `/api/practices/`)
- [x] BusinessPlanContext (lazy fetch, save, calculate)
- [x] BusinessPlanPage (placeholder con 9 sezioni)
- [x] Navigazione: tab header + sidebar button
- [x] i18n: 30+ chiavi it.json

### Fase 2: Master Data
- [ ] UI gestione catalogo Practice/Profili
- [ ] Import/export Excel

### Fase 3: Import Capitolato
- [ ] Parser Excel team composition
- [ ] Parser Excel TOW
- [ ] UI upload

### Fase 4: Configurazione BP ✅
- [x] UI rettifica volumi (3 livelli) - VolumeAdjustments.jsx
- [x] Assegnazione TOW → Practice - TowConfigTable.jsx
- [ ] Profile mapping editor
- [x] Parametri (governance, risk, riuso) - ParametersPanel.jsx

### Fase 5: Calcoli Avanzati (Parziale) ✅
- [ ] `calculate_tow_cost()` completo
- [x] Calcolo costi con breakdown - CostBreakdown.jsx
- [x] Calcolo margine RTI con quote - MarginSimulator.jsx
- [x] Generazione scenari completi - ScenarioCards.jsx
- [x] API `/calculate`, `/scenarios`, `/find-discount`

### Fase 6: UI Completa ✅
- [x] BusinessPlanPage (layout completo con grid responsive)
- [x] TeamCompositionTable (gestione profili e FTE)
- [x] TowConfigTable (configurazione TOW con assegnazione Practice)
- [x] VolumeAdjustments (slider a 3 livelli)
- [x] ParametersPanel (governance, risk, riuso, durata)
- [x] CostBreakdown chart (barre percentuali)
- [x] MarginSimulator (slider sconto ↔ margine, target margin)
- [x] ScenarioCards (3 scenari con applicazione diretta)

### Fase 7: Integrazione
- [ ] Link con Score Simulator
- [ ] Unified Decision View
- [ ] Export BP in report

---

## Componenti Creati (2026-02-13)

```
frontend/src/features/business-plan/
├── components/
│   ├── index.js                    ✅ Export barrel
│   ├── ParametersPanel.jsx         ✅ Governance, Risk, Riuso
│   ├── TeamCompositionTable.jsx    ✅ Profili + FTE + allocazione TOW
│   ├── TowConfigTable.jsx          ✅ Type of Work + Practice
│   ├── VolumeAdjustments.jsx       ✅ Slider 3 livelli
│   ├── MarginSimulator.jsx         ✅ Sconto ↔ Margine
│   ├── CostBreakdown.jsx           ✅ Chart breakdown costi
│   └── ScenarioCards.jsx           ✅ 3 scenari predefiniti
├── context/
│   └── BusinessPlanContext.jsx     ✅ (esistente)
└── pages/
    └── BusinessPlanPage.jsx        ✅ Layout completo
```

---

## 13. Note Implementative

- **RTI**: usa quote già definite in `lot_config.rti_quotas`
- **Costi**: tutti overhead inclusi in tariffe (infra, trasferte, etc.)
- **Governance**: percentuale, include coordinamento RTI se applicabile
- **Subappalto**: max 20% importo aggiudicazione
- **Riuso**: può superare 50% in casi specifici
- **Rettifica volumi**: applicata PRIMA del riuso

---

## 14. Prossimi Passi

1. Creare modelli database
2. Implementare API skeleton
3. UI per import capitolato Excel
4. Calcoli base
5. Integrazione con simulator esistente
