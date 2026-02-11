# Documentazione Tecnica - Simulator Poste

Documentazione tecnica dettagliata dell'architettura, formule di scoring, e implementazione del sistema.

---

## 📋 Indice

1. [Architettura di Sistema](#1-architettura-di-sistema)
2. [Database Schema](#2-database-schema)
3. [Formule di Scoring](#3-formule-di-scoring)
4. [Autenticazione OIDC](#4-autenticazione-oidc)
5. [Simulazione Monte Carlo](#5-simulazione-monte-carlo)
6. [Ottimizzatore Sconto](#6-ottimizzatore-sconto)
7. [Generazione PDF](#7-generazione-pdf)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Deployment](#9-deployment)
10. [Security Considerations](#10-security-considerations)

---

## 1. Architettura di Sistema

### 1.1 Overview

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  React Frontend │────►│  FastAPI        │────►│  SQLite DB      │
│  (Vite)         │     │  Backend        │     │                 │
│                 │◄────│                 │◄────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  SAP IAS        │     │  PDF Generator  │
│  (OIDC/OAuth2)  │     │  (ReportLab)    │
└─────────────────┘     └─────────────────┘
```

### 1.2 Stack Tecnologico

#### Backend

| Componente | Tecnologia | Versione | Ruolo |
| --- | --- | --- | --- |
| Framework | FastAPI | 0.128.0 | API REST, OpenAPI docs |
| ORM | SQLAlchemy | 2.0.46 | Gestione database |
| Validazione | Pydantic | 2.12.5 | Schema request/response |
| Matematica | NumPy | 2.2.6 | Monte Carlo, calcoli |
| PDF | ReportLab | 4.4.9 | Generazione report |
| JWT | python-jose | 3.3.0 | Validazione token |
| Server | Uvicorn | 0.34.0 | ASGI server |

#### Frontend

| Componente | Tecnologia | Versione | Ruolo |
| --- | --- | --- | --- |
| Framework | React | 19.2.0 | UI components |
| Build | Vite | 7.2.4 | Dev server, bundling |
| Styling | Tailwind CSS | 4.1.18 | Utility-first CSS |
| Grafici | Recharts | 3.6.0 | Charts & gauges |
| i18n | i18next | 25.7.4 | Internazionalizzazione |
| HTTP | Axios | 1.13.2 | API client |

### 1.3 Flusso Dati

```text
User Input → React State → API Call → FastAPI Endpoint → Business Logic → Database → Response → React State → UI Update
```

**Context Pattern (Frontend):**

- `ConfigContext`: Gestisce configurazione lotti, master data
- `SimulationContext`: Gestisce stato simulazione, input tecnici, risultati

---

## 2. Database Schema

### 2.1 Modello ER

```text
┌─────────────────────────┐
│     LotConfigModel      │
├─────────────────────────┤
│ PK name: String(255)    │
│    base_amount: Float   │
│    max_tech_score: Float│
│    max_econ_score: Float│
│    max_raw_score: Float │
│    alpha: Float         │
│    economic_formula: Str│
│    company_certs: JSON  │
│    reqs: JSON           │
│    state: JSON          │
└─────────────────────────┘

┌─────────────────────────┐
│     MasterDataModel     │
├─────────────────────────┤
│ PK id: String(1)        │
│    company_certs: JSON  │
│    prof_certs: JSON     │
│    requirement_labels:  │
│                   JSON  │
│    economic_formulas:   │
│                   JSON  │
└─────────────────────────┘
```

### 2.2 Struttura JSON Fields

#### company_certs (LotConfig)

```json
[
  {
    "label": "ISO 9001",
    "points": 2.0,
    "gara_weight": 1.0
  }
]
```

#### reqs (LotConfig)

```json
[
  {
    "id": "REQ_01",
    "label": "Certificazioni Professionali",
    "type": "resource",
    "max_points": 35.0,
    "gara_weight": 10.0,
    "prof_R": 5,
    "prof_C": 5,
    "max_res": 5,
    "max_certs": 5,
    "selected_prof_certs": ["AWS", "Azure"]
  },
  {
    "id": "REQ_02",
    "label": "Referenza Aziendale",
    "type": "reference",
    "max_points": 25.0,
    "gara_weight": 8.0,
    "sub_reqs": [
      {"id": "a", "label": "Complessità", "weight": 1.5, "max_value": 5}
    ],
    "criteria": [],
    "attestazione_score": 3.0,
    "custom_metrics": [
      {"id": "M1", "label": "Volumi", "min_score": 0, "max_score": 5}
    ]
  }
]
```

#### state (LotConfig)

```json
{
  "my_discount": 35.0,
  "competitor_discount": 30.0,
  "competitor_tech_score": 55.0,
  "competitor_econ_discount": 28.0,
  "tech_inputs": {
    "REQ_01": {"r_val": 4, "c_val": 3}
  },
  "company_certs": {
    "ISO 9001": true
  }
}
```

### 2.3 Seeding Iniziale

Al primo avvio, `crud.seed_initial_data()`:

1. Carica `lot_configs.json` e `master_data.json`
2. Per ogni lotto, verifica se esiste già nel DB
3. Se non esiste, lo crea
4. Non sovrascrive lotti esistenti (preserva modifiche utente)

---

## 3. Formule di Scoring

### 3.1 Punteggio Economico

**Formula Interpolazione con Alpha:**

$$P_{econ} = P_{max} \times \left( \frac{P_{base} - P_{offerto}}{P_{base} - P_{migliore}} \right)^\alpha$$

Dove:

- $P_{base}$ = Importo base della gara
- $P_{offerto}$ = Prezzo della nostra offerta
- $P_{migliore}$ = min($P_{offerto}$, $P_{competitore}$) → prezzo migliore effettivo
- $\alpha$ = Esponente (default: 0.3)
- $P_{max}$ = Punteggio massimo economico (default: 40)

**Implementazione:**

```python
def calculate_economic_score(p_base, p_offered, p_best_competitor, alpha=0.3, max_econ=40.0):
    if p_offered > p_base:
        return 0.0
    
    actual_best = min(p_offered, p_best_competitor)
    denom = p_base - actual_best
    
    if denom <= 0:
        return 0.0
    
    num = p_base - p_offered
    ratio = max(0.0, min(1.0, num / denom))
    
    return max_econ * (ratio ** alpha)
```

**Casi limite:**

- Se $P_{offerto} > P_{base}$: ritorna 0
- Se $P_{offerto} = P_{migliore}$: ritorna $P_{max}$
- Se $P_{offerto} = P_{base}$: ritorna 0

### 3.2 Punteggio Professionale (Certificazioni)

**Formula:**

$$P = (2 \times R) + (R \times C)$$

Dove:

- $R$ = min(risorse proposte, max_res)
- $C$ = min(certificazioni totali, max_certs, R)

**Vincoli:**

- $C \leq R$ (non puoi avere più certificazioni che risorse)
- Risultato cappato a `max_points`

**Implementazione:**

```python
def calculate_prof_score(R, C, max_res, max_points, max_certs=5):
    R = min(R, max_res)
    C = min(C, max_certs)
    
    if R < C:
        C = R
    
    score = (2 * R) + (R * C)
    return min(score, max_points)
```

**Esempi:**

| R | C | Score |
| --- | --- | --- |
| 5 | 5 | 35 |
| 4 | 3 | 20 |
| 3 | 3 | 15 |
| 3 | 5 | 15 (C clampato a 3) |

### 3.3 Punteggio Reference/Project

**Formula Raw:**

$$Raw = \sum_{i}(peso\_interno_i \times valore_i) + attestazione + custom\_metrics$$

**Formula Pesata (Gara Points):**

$$Pesato = \frac{Raw}{Max\_Raw} \times gara\_weight$$

Dove:

- $valore_i$ = 0, 2, 3, 4, 5 (giudizio discrezionale)
- $peso\_interno$ = weight del criterio
- $attestazione$ = punti se attestazione_active
- $Max\_Raw$ = somma teorica massima

### 3.4 Punteggio Tecnico Totale

$$Tech\_Score = \sum_{cat} Category\_Score$$

Dove le categorie sono:

- `category_company_certs`: Certificazioni aziendali (pesate)
- `category_resource`: Certificazioni professionali (pesate)
- `category_reference`: Referenze aziendali (pesate)
- `category_project`: Progetti tecnici (pesati)

### 3.5 Calcolo Max Points Dinamico

Per ogni requisito, `calculate_max_points_for_req()`:

**Resource:**

```python
max_points = (2 * max_res) + (max_res * max_certs)
```

**Reference/Project:**

```python
max_points = sum(weight * max_value for each criterion) + attestazione_score + sum(custom_metric.max_score)
```

---

## 4. Autenticazione OIDC

### 4.1 Flusso

```text
┌────────┐     ┌────────┐     ┌────────┐
│Frontend│     │Backend │     │SAP IAS │
└───┬────┘     └───┬────┘     └───┬────┘
    │              │              │
    │──Auth Flow──►│              │
    │              │──Get Token──►│
    │              │◄──JWT Token──│
    │◄─────────────│              │
    │              │              │
    │─API Request─►│              │
    │ + Bearer JWT │              │
    │              │──Validate───►│
    │              │◄───JWKS──────│
    │◄──Response───│              │
```

### 4.2 Configurazione

**Variabili Ambiente:**

```bash
OIDC_ISSUER=https://tenant.accounts.ondemand.com
OIDC_CLIENT_ID=your-client-id
OIDC_AUDIENCE=your-client-id  # default = client_id
ENVIRONMENT=development|staging|production
```

### 4.3 Middleware

`OIDCMiddleware` intercetta ogni richiesta:

1. **OPTIONS**: Bypass (CORS preflight)
2. **Public Paths**: Bypass (`/health`, `/docs`, `/api/config`, `/api/master-data`)
3. **No Client ID + Production**: Errore 503 (fail-fast)
4. **No Client ID + Dev**: Bypass con utente mock
5. **Token Present**: Valida JWT

### 4.4 Validazione Token

```python
def _validate_token(self, token):
    # 1. Estrai header per 'kid'
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    
    # 2. Recupera JWKS e trova chiave
    jwks = self.config.get_jwks()
    key = find_key_by_kid(jwks, kid)
    
    # 3. Decodifica e valida
    decoded = jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience=self.config.audience,
        issuer=self.config.issuer,
        options={"verify_exp": True, ...}
    )
    
    return decoded
```

---

## 5. Simulazione Monte Carlo

### 5.1 Algoritmo

```python
def monte_carlo_simulation(data):
    wins = 0
    my_scores = []
    comp_scores = []
    
    for _ in range(iterations):
        # 1. Genera sconto competitor casuale
        c_disc = np.random.normal(mean, std)
        c_disc = clamp(c_disc, 0, 100)
        
        # 2. Genera tech score competitor casuale
        comp_tech = np.random.normal(tech_mean, tech_std)
        comp_tech = clamp(comp_tech, 0, max_tech)
        
        # 3. Calcola prezzi
        p_comp = base_amount * (1 - c_disc/100)
        p_mine = base_amount * (1 - my_disc/100)
        p_best = min(p_comp, p_mine)
        
        # 4. Calcola punteggi economici (entrambi contro best)
        my_econ = calculate_economic_score(base, p_mine, p_best)
        comp_econ = calculate_economic_score(base, p_comp, p_best)
        
        # 5. Totali
        my_total = my_tech + my_econ
        comp_total = comp_tech + comp_econ
        
        if my_total > comp_total:
            wins += 1
        
        my_scores.append(my_total)
        comp_scores.append(comp_total)
    
    return {
        "win_probability": wins / iterations * 100,
        "avg_total_score": np.mean(my_scores),
        ...
    }
```

### 5.2 Distribuzione Normale

Parametri default:

- `competitor_discount_std`: 3.5% (varianza tipica mercato)
- `competitor_tech_score_std`: 3.0 punti (varianza tipica)

### 5.3 Best Price Dinamico

**Importante:** Il "best price" viene ricalcolato in ogni iterazione considerando TUTTE le offerte, non solo la nostra vs competitor fisso.

---

## 6. Ottimizzatore Sconto

### 6.1 Algoritmo

```python
def optimize_discount(data):
    # 1. Trova minimum discount per battere competitor
    min_discount_to_beat = None
    
    for test_disc in range(0, 71):
        p_test = base * (1 - test_disc/100)
        p_actual_best = min(p_test, p_market_best)
        
        # Ricalcola ENTRAMBI contro actual_best
        my_econ = calc_econ(base, p_test, p_actual_best)
        my_total = my_tech + my_econ
        
        comp_econ = calc_econ(base, p_comp, p_actual_best)
        comp_total = comp_tech + comp_econ
        
        if my_total > comp_total:
            min_discount_to_beat = test_disc
            break
    
    # 2. Genera 4 scenari
    if can_beat:
        scenarios = [
            min_discount,
            min_discount + 5,
            min_discount + 10,
            min_discount + 15
        ]
    else:
        # Ancora basati su best_offer_discount
        scenarios = [best_offer, best_offer+2, best_offer+5, best_offer+8]
    
    # 3. Per ogni scenario, run mini Monte Carlo (200 iter)
    for scenario in scenarios:
        run_simulation(scenario)
```

### 6.2 Scenari

| Nome | Strategia | Target Probabilità |
| --- | --- | --- |
| Conservativo | Minimo necessario | 70-80% |
| Bilanciato | +5% safety margin | 80-90% |
| Aggressivo | +10% margin | 90-95% |
| Max | +15% margin | 95%+ |

---

## 7. Generazione PDF

### 7.1 Stack

- **ReportLab**: Libreria PDF low-level
- **Matplotlib**: Generazione grafici (salvati in memory buffer)

### 7.2 Struttura Report

```text
Page 1: Header + Summary
├── Logo
├── Titolo Gara
├── Data
├── Gauge grafici (3x)
└── Confronto competitor

Page 2: Dettaglio Tecnico
├── Certificazioni Aziendali (tabella)
├── Certificazioni Professionali
├── Referenze
└── Progetti

Page 3: Analisi Monte Carlo
├── Istogramma distribuzione
├── Statistiche (mean, min, max)
└── Probabilità vittoria

Page 4: Raccomandazioni
├── Sconto ottimale
└── Scenari alternativi
```

### 7.3 Generazione Grafici

```python
def generate_histogram():
    fig, ax = plt.subplots()
    ax.hist(score_distribution, bins=50)
    ax.axvline(competitor_total, color='r')
    
    buf = io.BytesIO()
    fig.savefig(buf, format='png')
    buf.seek(0)
    
    return buf
```

---

## 8. Frontend Architecture

### 8.1 State Management

**Context API Pattern:**

```text
App
├── ConfigProvider
│   └── config, masterData, setConfig
└── SimulationProvider
    └── selectedLot, myDiscount, results, setTechInput
```

### 8.2 Componenti Principali

```text
src/
├── App.jsx              # Router, providers, layout
├── components/
│   ├── Dashboard.jsx    # Gauges, charts, optimizer
│   ├── TechEvaluator.jsx# Input tecnici
│   ├── ConfigPage.jsx   # Configurazione admin
│   └── Sidebar.jsx      # Navigazione e controlli
├── features/
│   ├── config/
│   │   ├── components/
│   │   │   ├── LotSelector.jsx
│   │   │   └── CompanyCertsEditor.jsx
│   │   └── context/
│   │       └── ConfigContext.jsx
│   └── simulation/
│       ├── components/
│       │   ├── ScoreGauges.jsx
│       │   └── SimulationChart.jsx
│       └── context/
│           └── SimulationContext.jsx
└── shared/
    ├── components/ui/
    │   ├── Gauge.jsx
    │   ├── Skeleton.jsx
    │   └── Toast.jsx
    └── hooks/
        └── useToast.js
```

### 8.3 Data Flow

```text
User Interaction
      │
      ▼
Context Action (e.g., setTechInput)
      │
      ▼
useEffect → API Call (/api/calculate)
      │
      ▼
Update results in Context
      │
      ▼
Re-render Dashboard con nuovi valori
```

### 8.4 Debouncing

Le chiamate API sono debounced per performance:

```javascript
useEffect(() => {
    const timer = setTimeout(() => {
        runCalculation();
    }, 1000);
    return () => clearTimeout(timer);
}, [dependencies]);
```

---

## 9. Deployment

### 9.1 Docker

**Backend Dockerfile:**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Frontend Dockerfile:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build
CMD ["npx", "serve", "-s", "dist", "-l", "5173"]
```

### 9.2 Kubernetes/Kyma

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: simulator-poste

# backend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: simulator-backend
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: backend
        image: gcr.io/project/simulator-backend:latest
        env:
        - name: ENVIRONMENT
          value: "production"
        - name: OIDC_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: oidc-secrets
              key: client-id
```

### 9.3 Render.com

```yaml
# render.yaml
services:
  - type: web
    name: simulator-backend
    runtime: python
    buildCommand: pip install -r backend/requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: ENVIRONMENT
        value: production
```

---

## 10. Security Considerations

### 10.1 Autenticazione

- **Production**: OIDC obbligatorio (503 se non configurato)
- **Development**: Bypass con warning nei log
- **JWT Validation**: Firma RS256, exp, nbf, iat, aud, iss

### 10.2 CORS

- **Production**: Solo `FRONTEND_URL` specificato
- **Staging**: Frontend + localhost
- **Development**: Multiple localhost origins

### 10.3 Rate Limiting

Non implementato nativamente. Raccomandato:

- API Gateway (Kong, NGINX)
- CloudFlare
- WAF

### 10.4 Input Validation

- **Pydantic**: Validazione automatica di tutti i DTO
- **Field Constraints**: `ge=0`, `le=100`, `gt=0`
- **Payload Size**: Max 10MB (middleware)

### 10.5 SQL Injection

- **SQLAlchemy ORM**: Query parametrizzate automatiche
- **No raw SQL**: Tranne health check (`SELECT 1`)

### 10.6 Secrets Management

- **Environment Variables**: Tutti i secrets via env
- **No hardcoding**: Issuer, client_id, database URL
- **Kubernetes Secrets**: Per deployment cloud

### 10.7 Logging

- **Structured Logging**: JSON format in produzione
- **No Sensitive Data**: Token, password mai loggati
- **Request Tracing**: URL, method, exception_type

---

## Appendice: Troubleshooting

### Database corrotto

```bash
cd backend
rm simulator_poste.db
python -c "from database import engine; from models import Base; Base.metadata.create_all(bind=engine)"
uvicorn main:app
```

### OIDC discovery fallisce

Verifica:

1. `OIDC_ISSUER` è raggiungibile
2. `/.well-known/openid-configuration` risponde
3. Certificate chain valida

### Monte Carlo lento

Riduci iterazioni:

```json
{"iterations": 100}
```

O aumenta timeout lato client.

### PDF non si genera

Verifica:

1. `matplotlib` installato
2. Backend usato con `Agg` (no GUI)
3. Font disponibili

---

## Changelog

### v1.0.0 (2026-02-10)

- Release iniziale
- Scoring tecnico/economico
- Monte Carlo simulation
- Discount optimizer
- PDF export
- OIDC authentication
