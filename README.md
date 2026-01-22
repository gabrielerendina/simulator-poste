# Poste Tender Simulator

## Overview
Simulatore enterprise-ready di valutazione tecnica ed economica per gare a lotti, completamente configurabile con frontend React e backend FastAPI.

## Struttura progetto
- **backend/**: FastAPI con logging strutturato, health checks, API REST, PDF export
- **frontend/**: React 19+, Tailwind, UI dinamica, i18n (italiano)
- **Database**: SQLite con SQLAlchemy ORM
- **Docker**: Configurazione Docker Compose per deployment

## 🚀 Avvio Rapido (Recommended)

### Avvio Completo (Backend + Frontend)
```bash
./start-all.sh
```
Avvia entrambi i server in parallelo:
- Backend: http://localhost:8000
- Frontend: http://localhost:5173

### Avvio Singolo Server

**Backend solo:**
```bash
./start-backend.sh
```
- Server: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

**Frontend solo:**
```bash
./start-frontend.sh
```
- Server: http://localhost:5173

Gli script gestiscono automaticamente:
- ✅ Installazione dipendenze
- ✅ Virtual environment (Python)
- ✅ Validazione porte
- ✅ Auto-reload in development

## 🔧 Avvio Manuale

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 🏥 Health Checks & Monitoring

Il backend espone 4 endpoint di monitoring:

- `GET /health` - Status completo (database, configurazioni, master data)
- `GET /health/ready` - Readiness probe (Kubernetes)
- `GET /health/live` - Liveness probe
- `GET /metrics` - Metriche sistema (CPU, RAM, threads)

Esempio:
```bash
curl http://localhost:8000/health | jq
```

## 🌍 Configurazione Ambienti

Il sistema supporta 3 ambienti configurabili via variabili:

```bash
# Development (default)
ENVIRONMENT=development

# Staging
ENVIRONMENT=staging FRONTEND_URL=https://staging.example.com

# Production
ENVIRONMENT=production FRONTEND_URL=https://example.com
```

File di configurazione:
- `.env.example` - Template development
- `.env.staging.example` - Template staging
- `.env.production.example` - Template production

### CORS Configuration
- **Development**: Tutti i localhost (3000, 5173, 8080)
- **Staging**: URL staging + localhost per test
- **Production**: Solo URL production specificato in `FRONTEND_URL`

## 📝 Logging

Logging strutturato in JSON per production:
- **Development**: Pretty-print colorato per console
- **Production**: JSON format per aggregatori (Datadog, ELK, etc.)

Livelli: `DEBUG`, `INFO`, `WARN`, `ERROR`

## 🧪 Testing

```bash
cd backend
python -m pytest test_main.py -v
```

Test coverage:
- ✅ 20 test passati (77%)
- ⚠️ Alcuni test da aggiornare per nuove validazioni

## 📦 Dipendenze Principali

**Backend:**
- FastAPI 0.128.0
- SQLAlchemy 2.0.46
- Pydantic 2.12.5
- ReportLab 4.4.9 (PDF export)
- psutil 5.9.8 (metrics)

**Frontend:**
- React 19.2.0
- Vite 7.2.4
- Tailwind CSS 4.1.18
- i18next 25.8.0 (internazionalizzazione)
- Recharts (visualizzazioni)

## 🐳 Docker Deployment

```bash
docker-compose up --build
```

Health check configurato su `/health/ready`

## 📊 Features Enterprise

- ✅ Structured logging (JSON)
- ✅ Health checks (Kubernetes-ready)
- ✅ Environment-based CORS
- ✅ Internationalization (i18n)
- ✅ Database ORM (SQLAlchemy)
- ✅ API validation (Pydantic)
- ✅ PDF export with charts
- ✅ Monte Carlo simulation (500 iterations)

## 📖 Configurazione

Tutte le configurazioni sono persistite nel database SQLite:
- **Lot Configurations**: Parametri gara/lotto, requisiti, pesi
- **Master Data**: Certificazioni globali, etichette requisiti

## ⚡ Performance

- Backend: ~54MB RAM, <1% CPU (idle)
- Frontend: HMR (Hot Module Replacement) in <100ms
- Database: SQLite con indexes ottimizzati

## Autore
Gabriele Rendina
