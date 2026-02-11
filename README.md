# Simulator Poste - Tender Evaluation System

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)
![Python](https://img.shields.io/badge/python-3.12+-green.svg)
![React](https://img.shields.io/badge/react-19.x-61dafb.svg)

Sistema enterprise per la simulazione e valutazione di gare d'appalto pubbliche multi-lotto. Calcola punteggi tecnici ed economici, esegue analisi Monte Carlo per probabilità di vittoria, e genera report PDF professionali.

## Indice

- [Caratteristiche](#caratteristiche)
- [Architettura](#architettura)
- [Quick Start](#quick-start)
- [Documentazione](#documentazione)
- [Testing](#testing)
- [Deployment](#deployment)
- [Tech Stack](#tech-stack)

## Caratteristiche

| Funzionalità | Descrizione |
| --- | --- |
| **Configurazione Multi-lotto** | Gestione di più lotti di gara con requisiti e pesi differenti |
| **Scoring Tecnico** | Valutazione basata su criteri configurabili con pesi interni |
| **Scoring Economico** | Formula di interpolazione con esponente alpha progressivo |
| **Monte Carlo Simulation** | Analisi probabilità di vittoria con 500+ iterazioni |
| **Discount Optimizer** | Suggerisce lo sconto ottimale per massimizzare la probabilità di vittoria |
| **Export PDF** | Report professionali con grafici e analisi strategica |
| **Autenticazione OIDC** | Integrazione sicura con SAP Identity Authentication Service |
| **Internazionalizzazione** | Supporto lingua italiana (i18n) |
| **Verifica Certificazioni OCR** | Riconoscimento automatico certificazioni PDF con OCR |

## Architettura

```text
simulator-poste/
├── backend/                      # FastAPI Backend (Python 3.12+)
│   ├── main.py                   # Endpoint API e logica di business
│   ├── services/
│   │   ├── scoring_service.py    # Calcolo punteggi (estratto per testabilità)
│   │   └── cert_verification_service.py  # Verifica OCR certificazioni
│   ├── vendor_defaults.py        # Configurazioni vendor centralizzate
│   ├── models.py                 # Modelli SQLAlchemy ORM
│   ├── schemas.py                # Schemi Pydantic per validazione
│   ├── crud.py                   # Operazioni CRUD database
│   ├── auth.py                   # Middleware autenticazione OIDC
│   ├── database.py               # Configurazione SQLite
│   ├── pdf_generator.py          # Generatore report PDF
│   └── logging_config.py         # Logging strutturato
│
├── frontend/                     # React Frontend (Vite)
│   ├── src/
│   │   ├── App.jsx               # Componente principale applicazione
│   │   ├── components/           # Componenti UI
│   │   │   ├── Dashboard.jsx     # Gauge, grafici, analisi strategica
│   │   │   ├── ConfigPage.jsx    # Configurazione lotti e requisiti
│   │   │   ├── TechEvaluator.jsx # Valutazione tecnica interattiva
│   │   │   ├── MasterDataConfig.jsx # Configurazione vendor OCR
│   │   │   ├── CertVerificationPage.jsx # Verifica certificazioni
│   │   │   └── Sidebar.jsx       # Navigazione e controlli sconto
│   │   ├── features/
│   │   │   ├── config/           # Context configurazione
│   │   │   └── simulation/       # Context simulazione
│   │   ├── shared/               # Componenti condivisi (Gauge, Toast)
│   │   └── locales/              # File traduzioni (it.json)
│   └── package.json
│
├── k8s/                          # Manifesti Kubernetes/Kyma
├── docs/                         # Documentazione dettagliata
│   ├── api.md                    # Reference API completa
│   ├── user-guide.md             # Guida utente
│   └── technical.md              # Documentazione tecnica
│
├── docker-compose.yml            # Deployment Docker locale
└── render.yaml                   # Configurazione Render.com
```

## Quick Start

### Opzione 1: Docker (Consigliato)

```bash
# Avvia frontend e backend con Docker
./start-all.sh

# Oppure con docker-compose direttamente
docker-compose up --build
```

Servizi disponibili:

- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:8000`
- **API Docs (Swagger)**: `http://localhost:8000/docs`

### Opzione 2: Sviluppo Manuale

**Backend:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

### Variabili d'Ambiente

```bash
# Backend
ENVIRONMENT=development|staging|production
OIDC_ISSUER=https://your-ias.accounts.ondemand.com
OIDC_CLIENT_ID=your-client-id
OIDC_AUDIENCE=your-audience
FRONTEND_URL=http://localhost:5173

# Frontend (.env)
VITE_API_URL=/api
VITE_OIDC_ISSUER=...
VITE_OIDC_CLIENT_ID=...
```

## Documentazione

| Documento | Descrizione |
| --- | --- |
| [API Reference](docs/api.md) | Documentazione completa di tutti gli endpoint REST |
| [Guida Utente](docs/user-guide.md) | Come utilizzare l'applicazione passo-passo |
| [Documentazione Tecnica](docs/technical.md) | Architettura, formule, schema database |

### Endpoint Principali

| Metodo | Endpoint | Descrizione |
| --- | --- | --- |
| GET | `/api/config` | Recupera tutte le configurazioni lotto |
| POST | `/api/calculate` | Calcola punteggi tecnici ed economici |
| POST | `/api/simulate` | Genera curva simulazione sconto |
| POST | `/api/monte-carlo` | Esegue simulazione Monte Carlo |
| POST | `/api/optimize-discount` | Trova lo sconto ottimale |
| POST | `/api/export-pdf` | Genera report PDF |
| GET | `/health` | Health check con stato database |
| POST | `/api/verify-certificate` | Verifica singolo certificato PDF via OCR |
| POST | `/api/verify-certificates` | Verifica batch certificati (SSE streaming) |

### Formule di Scoring

**Punteggio Economico:**

```text
ratio = (P_base - P_offerto) / (P_base - P_migliore_effettivo)
Punteggio_Economico = Max_Econ × (ratio ^ alpha)
```

**Punteggio Professionale (Certificazioni):**

```text
Punteggio = (2 × R) + (R × C)
```

Dove: R = risorse, C = certificazioni (C ≤ R)

## Testing

```bash
# Test backend
cd backend
pip install -r requirements-test.txt
pytest test_main.py -v

# Test con coverage
pytest --cov=. --cov-report=html

# Test specifici
pytest test_main.py::TestEconomicScore -v
pytest test_main.py::TestProfScore -v
```

**Test Suite:**

- 13 test unitari
- Coverage formule di scoring
- Test endpoint API

## Deployment

### Kubernetes/Kyma (SAP BTP)

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml    # Da template
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/apirule.yaml
```

### Render.com

Il file `render.yaml` contiene la configurazione Blueprint per deployment automatico.

### Docker Compose (Production)

```bash
./start-prod.sh
```

## Tech Stack

### Backend

| Tecnologia | Versione | Scopo |
| --- | --- | --- |
| FastAPI | 0.128.0 | Framework API REST |
| SQLAlchemy | 2.0.46 | ORM database |
| Pydantic | 2.12.5 | Validazione dati |
| NumPy | 2.2.6 | Calcoli numerici, Monte Carlo |
| ReportLab | 4.4.9 | Generazione PDF |
| python-jose | 3.3.0 | Validazione JWT |
| pytesseract | 0.3.13 | OCR per certificazioni |

### Frontend

| Tecnologia | Versione | Scopo |
| --- | --- | --- |
| React | 19.2.0 | Framework UI |
| Vite | 7.2.4 | Build tool |
| Tailwind CSS | 4.1.18 | Styling |
| Recharts | 3.6.0 | Grafici |
| i18next | 25.7.4 | Internazionalizzazione |
| Axios | 1.13.2 | HTTP client |

### Database

- **SQLite** in sviluppo/staging
- Migrabile a PostgreSQL per produzione

## Performance

| Metrica | Valore |
| --- | --- |
| RAM Backend | ~54MB |
| CPU Idle | <1% |
| API Response (p95) | <500ms |
| Frontend HMR | <100ms |
| Monte Carlo (500 iter) | <200ms |

## Autore

Gabriele Rendina

## Licenza

Proprietario - Tutti i diritti riservati
