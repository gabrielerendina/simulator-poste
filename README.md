# Simulator Poste - Tender Evaluation System

Enterprise-ready simulator for technical and economic evaluation of multi-lot public tenders. Built with React + FastAPI.

## Features

- **Multi-lot Configuration**: Configure multiple tender lots with different requirements and weights
- **Technical Scoring**: Evaluate proposals based on configurable criteria and sub-criteria
- **Economic Scoring**: Progressive discount formula with alpha exponent
- **Monte Carlo Simulation**: Win probability analysis with 500+ iterations
- **Discount Optimizer**: Find optimal discount for maximum win probability
- **PDF Export**: Generate detailed evaluation reports
- **OIDC Authentication**: Secure access with SAP IAS integration
- **Internationalization**: Italian language support (i18n)

## Project Structure

```
simulator-poste/
├── backend/                    # FastAPI Backend
│   ├── main.py                # API endpoints & business logic
│   ├── services/
│   │   └── scoring_service.py # Scoring calculations
│   ├── models.py              # SQLAlchemy ORM models
│   ├── schemas.py             # Pydantic request/response schemas
│   ├── crud.py                # Database CRUD operations
│   ├── auth.py                # OIDC authentication
│   └── database.py            # SQLite database config
│
├── frontend/                   # React Frontend
│   ├── src/
│   │   ├── App.jsx            # Main application component
│   │   ├── components/        # UI components
│   │   │   ├── Dashboard.jsx  # Score gauges & charts
│   │   │   ├── ConfigPage.jsx # Lot configuration
│   │   │   ├── TechEvaluator.jsx # Technical evaluation
│   │   │   └── Sidebar.jsx    # Navigation & controls
│   │   ├── features/
│   │   │   ├── config/        # Configuration context
│   │   │   └── simulation/    # Simulation context
│   │   └── shared/            # Shared components & hooks
│   └── package.json
│
├── k8s/                       # Kubernetes/Kyma manifests
├── docker-compose.yml         # Local Docker deployment
├── start-all.sh              # Docker-based startup
├── start-backend.sh          # Backend-only startup
└── start-frontend.sh         # Frontend-only startup
```

## Quick Start

### Option 1: Docker (Recommended)

```bash
./start-all.sh
```

This starts both services:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Option 2: Manual Development

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/config` | Get all lot configurations |
| POST | `/config` | Update lot configuration |
| POST | `/config/add` | Add new lot |
| DELETE | `/config/{lot_key}` | Delete lot |
| POST | `/config/state` | Save simulation state |
| GET | `/master-data` | Get master data (certs, labels) |
| POST | `/calculate` | Calculate technical & economic scores |
| POST | `/simulate` | Generate discount simulation curve |
| POST | `/monte-carlo` | Run Monte Carlo win probability |
| POST | `/optimize-discount` | Find optimal discount |
| POST | `/export-pdf` | Generate PDF report |
| GET | `/health` | Health check with DB status |
| GET | `/metrics` | System metrics (CPU, RAM) |

## Scoring Formulas

### Technical Score

```
Raw Score = Σ(criterion_weight × judgment_value) + bonus_points
Technical Score = (Raw Score / Max Raw Score) × Max Tech Score
```

Where judgment values are: 0 (Inadequate), 2 (Partial), 3 (Adequate), 4 (Good), 5 (Excellent)

### Economic Score

```
ratio = (P_base - P_offered) / (P_base - P_actual_best)
Economic Score = Max Econ × (ratio ^ alpha)
```

Where:
- `P_actual_best = min(P_offered, P_competitor)`
- `alpha` controls discount reward curve (default: 0.3)

## Configuration

### Environment Variables

```bash
# Backend
ENVIRONMENT=development|staging|production
OIDC_ISSUER=https://your-ias.accounts.ondemand.com
OIDC_CLIENT_ID=your-client-id
OIDC_AUDIENCE=your-audience
FRONTEND_URL=http://localhost:5173

# Frontend (via Vite)
VITE_API_URL=/api
VITE_OIDC_ISSUER=...
VITE_OIDC_CLIENT_ID=...
```

### Database

SQLite database stored at `backend/simulator_poste.db`. Seeded automatically from `lot_configs.json` on first startup.

## Testing

```bash
# Backend tests
cd backend
pip install -r requirements-test.txt
pytest test_main.py -v

# Frontend tests
cd frontend
npm run test
```

## Deployment

### Kubernetes/Kyma

Manifests in `k8s/` folder:
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/apirule.yaml
```

### Render.com

Configuration in `render.yaml` for automatic deployment.

## Tech Stack

**Backend:**
- FastAPI 0.128.0
- SQLAlchemy 2.0.46
- Pydantic 2.12.5
- NumPy 2.2.6
- ReportLab 4.4.9

**Frontend:**
- React 19.2.0
- Vite 7.2.4
- Tailwind CSS 4.1.18
- Recharts 3.6.0
- i18next 25.7.4
- Axios 1.13.2

## Performance

- Backend: ~54MB RAM, <1% CPU idle
- Frontend: HMR in <100ms
- API: <500ms p95 response time

## Author

Gabriele Rendina

## License

Proprietary - All rights reserved
