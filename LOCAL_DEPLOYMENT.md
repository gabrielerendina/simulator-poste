# Local Deployment Guide

This guide explains how to run the Simulator Poste application locally using Docker.

## Prerequisites

- **Docker Desktop** installed and running
- **Git** (to clone the repository)
- **Bash** shell (available on macOS/Linux, or use Git Bash on Windows)

## Quick Start

### 1. Start All Services

Run the start-all script to build and start both frontend and backend:

```bash
./start-all.sh
```

This script will:
1. ✓ Check if Docker is running
2. ✓ Check/create `.env` file with default configuration
3. ✓ Build Docker containers (frontend + backend)
4. ✓ Start services in detached mode
5. ✓ Wait for health checks to pass
6. ✓ Display service URLs and useful commands

### 2. Access the Application

Once started, you can access:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### 3. Stop All Services

To stop the application:

```bash
./stop-all.sh
```

This will gracefully stop all containers. You'll be asked if you want to remove database data.

## Manual Docker Compose Commands

If you prefer to use Docker Compose directly:

```bash
# Build containers
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Environment Configuration

The application uses environment variables defined in `.env`:

```bash
# Environment
ENVIRONMENT=development

# OIDC Configuration
OIDC_ISSUER=https://asojzafbi.accounts.ondemand.com
OIDC_CLIENT_ID=c763a5f1-287c-4115-93bc-61e06b1bd7a3
OIDC_AUDIENCE=c763a5f1-287c-4115-93bc-61e06b1bd7a3

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
```

The `.env` file is automatically created by `start-all.sh` if it doesn't exist.

## Troubleshooting

### Docker not running

```
Error: Docker is not running
```

**Solution**: Start Docker Desktop and wait for it to be fully running, then try again.

### Port already in use

```
Error: Bind for 0.0.0.0:5173 failed: port is already allocated
```

**Solution**: Stop any other services using ports 5173 or 8000, or modify `docker-compose.yml` to use different ports.

### Build failures

```
Error: Build failed
```

**Solution**: 
1. Clean Docker cache: `docker system prune -a`
2. Try building manually: `docker-compose build --no-cache`

### Health check timeout

If a service doesn't become healthy:

1. Check logs: `docker-compose logs backend` or `docker-compose logs frontend`
2. Verify the service is running: `docker-compose ps`
3. Restart the service: `docker-compose restart backend`

### Database issues

To reset the database:

```bash
./stop-all.sh
# Choose "yes" when asked to remove database volumes
./start-all.sh
```

## Architecture

The local deployment consists of:

- **Backend**: FastAPI application on port 8000 (SQLite database)
- **Frontend**: React SPA served by nginx on port 5173 (with API proxy to backend)

Both services have health checks configured and the frontend waits for the backend to be healthy before starting.

## Logs

View logs for all services:
```bash
docker-compose logs -f
```

View logs for specific service:
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

## Database

By default, the application uses SQLite stored in `backend/simulator_poste.db`.

The database is seeded with initial data from `backend/lot_configs.json` on first startup.

To reset the database, stop the containers and remove the SQLite file:
```bash
docker-compose down
rm backend/simulator_poste.db
docker-compose up -d
```
