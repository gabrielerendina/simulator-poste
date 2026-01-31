#!/bin/bash

# ============================================================================
# Simulator Poste - Stop Services Script
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Simulator Poste - Stopping Services                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if containers are running
if ! docker-compose ps | grep -q "Up"; then
    echo -e "${YELLOW}No running containers found${NC}"
    exit 0
fi

# Show current status
echo -e "${YELLOW}Current container status:${NC}"
docker-compose ps
echo ""

# Ask for confirmation
read -p "Do you want to stop all services? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cancelled${NC}"
    exit 0
fi

# Stop services
echo -e "${YELLOW}Stopping services...${NC}"
if docker-compose down; then
    echo -e "${GREEN}✓ All services stopped${NC}"
else
    echo -e "${RED}✗ Failed to stop services${NC}"
    exit 1
fi

# Ask if user wants to remove volumes (database data)
echo ""
read -p "Do you also want to remove database data? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose down -v
    echo -e "${GREEN}✓ Database volumes removed${NC}"
fi

echo ""
echo -e "${GREEN}Services stopped successfully${NC}"
