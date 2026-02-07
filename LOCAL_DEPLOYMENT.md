# Local Deployment Guide

Run the Simulator Poste application locally using Docker or manual setup.

## Prerequisites

- **Docker Desktop** (for Docker deployment)
- **Python 3.12+** (for manual backend)
- **Node.js 20+** (for manual frontend)
- **Git**

## Quick Start with Docker

### Start All Services

```bash
./start-all.sh
```

This script will:
1. Check if Docker is running
2. Create `.env` file with defaults if missing
3. Build Docker containers
4. Start frontend and backend
5. Wait for health checks
6. Display URLs and useful commands

### Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### Stop All Services

```bash
./stop-all.sh
```

## Manual Development Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Or use the script:
```bash
./start-backend.sh
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Or use the script:
```bash
./start-frontend.sh
```

## Environment Configuration

Create a `.env` file in the project root:

```bash
# Environment
ENVIRONMENT=development

# OIDC Configuration (SAP IAS)
OIDC_ISSUER=https://your-tenant.accounts.ondemand.com
OIDC_CLIENT_ID=your-client-id
OIDC_AUDIENCE=your-audience

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
```

The `.env` file is automatically created by `start-all.sh` with default values.

## Docker Compose Commands

```bash
# Build containers
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# View backend logs only
docker-compose logs -f backend

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Database

The application uses SQLite stored at `backend/simulator_poste.db`.

Initial data is seeded from:
- `backend/lot_configs.json` - Lot configurations
- `backend/master_data.json` - Master data (certificates, labels)

### Reset Database

```bash
docker-compose down
rm backend/simulator_poste.db
docker-compose up -d
```

## Troubleshooting

### Docker not running

```
Error: Docker is not running
```
Start Docker Desktop and wait for it to be fully running.

### Port already in use

```
Error: Bind for 0.0.0.0:5173 failed: port is already allocated
```
Stop other services using ports 5173 or 8000:
```bash
lsof -ti:5173,8000 | xargs kill -9
```

### Health check timeout

Check container logs:
```bash
docker-compose logs backend
docker-compose logs frontend
```

### Build failures

Clean Docker cache and rebuild:
```bash
docker system prune -a
docker-compose build --no-cache
```

## Architecture

```
┌─────────────────┐      ┌─────────────────┐
│   Frontend      │      │   Backend       │
│   (React/Vite)  │─────▶│   (FastAPI)     │
│   Port 5173     │      │   Port 8000     │
└─────────────────┘      └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │   SQLite DB     │
                         │ simulator_poste │
                         └─────────────────┘
```

Both services have health checks configured. The frontend waits for the backend to be healthy before starting in Docker mode.
