#!/bin/bash
# Run chaos tests with Toxiproxy

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Starting Chaos Testing Environment...${NC}"

# Function to cleanup on exit
cleanup() {
    echo -e "${YELLOW}Cleaning up chaos infrastructure...${NC}"
    docker-compose -f docker-compose.chaos.yml down
}

# Register cleanup function
trap cleanup EXIT

# Start infrastructure
echo -e "${GREEN}Starting Toxiproxy and services...${NC}"
docker-compose -f docker-compose.chaos.yml up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Check Toxiproxy is running
if curl -s http://localhost:8474/version > /dev/null; then
    echo -e "${GREEN}✓ Toxiproxy is running${NC}"
else
    echo -e "${RED}✗ Toxiproxy is not accessible${NC}"
    exit 1
fi

# Configure application to use proxied connections
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/updog_test"
export REDIS_URL="redis://localhost:6380"

# Run chaos tests
echo -e "${GREEN}Running chaos tests...${NC}"
npm run test:chaos

echo -e "${GREEN}Chaos tests completed successfully!${NC}"