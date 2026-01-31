#!/bin/bash

# ============================================================================
# Simulator Poste - Local Deployment Script
# ============================================================================
# This script starts the entire application stack locally using Docker Compose
# ============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Simulator Poste - Local Deployment                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# 1. Check Docker is running
# ============================================================================
echo -e "${YELLOW}[1/5] Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Error: Docker is not running${NC}"
    echo -e "${YELLOW}Please start Docker Desktop and try again${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

# ============================================================================
# 2. Check for .env file
# ============================================================================
echo -e "${YELLOW}[2/5] Checking environment configuration...${NC}"
if [ ! -f .env ]; then
    echo -e "${RED}✗ Warning: .env file not found${NC}"
    echo -e "${YELLOW}Creating .env file with default values...${NC}"
    cat > .env << 'ENVEOF'
# Environment
ENVIRONMENT=development

# OIDC Configuration
OIDC_ISSUER=https://asojzafbi.accounts.ondemand.com
OIDC_CLIENT_ID=c763a5f1-287c-4115-93bc-61e06b1bd7a3
OIDC_AUDIENCE=c763a5f1-287c-4115-93bc-61e06b1bd7a3

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
ENVEOF
    echo -e "${GREEN}✓ Created .env file${NC}"
else
    echo -e "${GREEN}✓ Environment file exists${NC}"
fi
echo ""

# ============================================================================
# 3. Build containers
# ============================================================================
echo -e "${YELLOW}[3/5] Building Docker containers...${NC}"
echo -e "${BLUE}This may take a few minutes on first run${NC}"

if docker-compose build --parallel; then
    echo -e "${GREEN}✓ Containers built successfully${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
echo ""

# ============================================================================
# 4. Start services
# ============================================================================
echo -e "${YELLOW}[4/5] Starting services...${NC}"

# Stop any existing containers
docker-compose down > /dev/null 2>&1 || true

# Start services in detached mode
if docker-compose up -d; then
    echo -e "${GREEN}✓ Services started${NC}"
else
    echo -e "${RED}✗ Failed to start services${NC}"
    exit 1
fi
echo ""

# ============================================================================
# 5. Wait for services to be healthy
# ============================================================================
echo -e "${YELLOW}[5/5] Waiting for services to be ready...${NC}"

# Wait for backend health check
echo -n "   Backend: "
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker-compose exec -T backend curl -f http://localhost:8000/health/ready > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ready${NC}"
        break
    fi
    echo -n "."
    sleep 2
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}✗ Backend health check timeout${NC}"
    echo -e "${YELLOW}Check logs with: docker-compose logs backend${NC}"
fi

# Wait for frontend
echo -n "   Frontend: "
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -f http://localhost:5173 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ready${NC}"
        break
    fi
    echo -n "."
    sleep 2
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}✗ Frontend health check timeout${NC}"
    echo -e "${YELLOW}Check logs with: docker-compose logs frontend${NC}"
fi

echo ""

# ============================================================================
# Display status and URLs
# ============================================================================
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Application Started Successfully              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Services:${NC}"
echo -e "  Frontend:  ${GREEN}http://localhost:5173${NC}"
echo -e "  Backend:   ${GREEN}http://localhost:8000${NC}"
echo -e "  API Docs:  ${GREEN}http://localhost:8000/docs${NC}"
echo ""
echo -e "${BLUE}Container Status:${NC}"
docker-compose ps
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo -e "  View logs:         ${YELLOW}docker-compose logs -f${NC}"
echo -e "  View backend logs: ${YELLOW}docker-compose logs -f backend${NC}"
echo -e "  Stop services:     ${YELLOW}docker-compose down${NC}"
echo -e "  Restart services:  ${YELLOW}docker-compose restart${NC}"
echo ""

# Ask if user wants to follow logs
read -p "Do you want to follow the logs? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose logs -f
fi
