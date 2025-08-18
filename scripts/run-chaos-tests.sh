#!/usr/bin/env bash
# Run engine chaos tests; starts/stops toxiproxy compose if available.
set -Eeuo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${YELLOW}==> Chaos Testing Suite${NC}"

# Engine fault configuration
RATE="${ENGINE_FAULT_RATE:-0.5}"
SEED="${ENGINE_FAULT_SEED:-42}"

# Function to cleanup on exit
cleanup() {
    if [ -f "./docker-compose.chaos.yml" ]; then
        echo -e "${YELLOW}Cleaning up chaos infrastructure...${NC}"
        docker-compose -f docker-compose.chaos.yml down >/dev/null 2>&1 || true
    fi
}

# Register cleanup function
trap cleanup EXIT

# Start Toxiproxy if available
if [ -f "./docker-compose.chaos.yml" ]; then
    echo -e "${YELLOW}Starting toxiproxy stack...${NC}"
    docker-compose -f docker-compose.chaos.yml up -d >/dev/null 2>&1 || true
    sleep 5
    
    # Configure proxied connections
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/updog_test"
    export REDIS_URL="redis://localhost:6380"
fi

echo -e "${YELLOW}Running tests with ENGINE_FAULT_RATE=${RATE}, ENGINE_FAULT_SEED=${SEED}${NC}"

# Run engine fault tests
echo -e "${GREEN}Testing engine fault injection...${NC}"
ENGINE_FAULT_RATE="${RATE}" ENGINE_FAULT_SEED="${SEED}" npm run test:chaos:wasm

# Run network chaos tests if Toxiproxy is available
if [ -f "./docker-compose.chaos.yml" ] && curl -s http://localhost:8474/version > /dev/null 2>&1; then
    echo -e "${GREEN}Testing network chaos...${NC}"
    npm run test:chaos:pg
fi

echo -e "${GREEN}✓ Chaos tests complete${NC}"
echo -e "${YELLOW}Hint:${NC} Adjust ENGINE_FAULT_RATE=0.2..0.8 for sensitivity."