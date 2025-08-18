#!/bin/bash
# Rollback and Verification Script
# Usage: ./rollback-verify.sh <TARGET_SHA> [MIGRATION_HASH]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/app"
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
READY_URL="${READY_URL:-http://localhost:5000/ready}"
MAX_RETRIES=30
RETRY_DELAY=2

# Arguments
TARGET_SHA=$1
MIGRATION_HASH=$2

if [ -z "$TARGET_SHA" ]; then
    echo -e "${RED}Error: Target SHA is required${NC}"
    echo "Usage: $0 <TARGET_SHA> [MIGRATION_HASH]"
    exit 1
fi

echo -e "${YELLOW}Starting rollback to ${TARGET_SHA}...${NC}"

# 1. Record current state
echo -e "${YELLOW}Recording current state...${NC}"
ROLLBACK_LOG="rollback-$(date +%Y%m%d-%H%M%S).log"
{
    echo "Rollback initiated at: $(date)"
    echo "Current SHA: $(git rev-parse HEAD)"
    echo "Target SHA: ${TARGET_SHA}"
    echo "---"
    curl -s "${HEALTH_URL}" || echo "Health check failed"
    echo "---"
} > "$ROLLBACK_LOG"

# 2. Checkout target SHA
echo -e "${YELLOW}Checking out target SHA...${NC}"
git fetch origin
git checkout "${TARGET_SHA}"

# 3. Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm ci

# 4. Build application
echo -e "${YELLOW}Building application...${NC}"
npm run build

# 5. Database rollback (if migration hash provided)
if [ -n "$MIGRATION_HASH" ]; then
    echo -e "${YELLOW}Rolling back database to migration ${MIGRATION_HASH}...${NC}"
    npm run db:rollback -- --to "${MIGRATION_HASH}" || {
        echo -e "${RED}Database rollback failed!${NC}"
        exit 1
    }
fi

# 6. Clear caches
echo -e "${YELLOW}Clearing caches...${NC}"
if command -v redis-cli &> /dev/null; then
    redis-cli FLUSHDB || echo "Redis flush failed (non-critical)"
fi

# 7. Restart application
echo -e "${YELLOW}Restarting application...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 restart all
elif command -v systemctl &> /dev/null; then
    sudo systemctl restart nodejs-app
elif command -v docker-compose &> /dev/null; then
    docker-compose restart
else
    echo -e "${YELLOW}Manual restart required - no process manager detected${NC}"
fi

# 8. Wait for application to start
echo -e "${YELLOW}Waiting for application to start...${NC}"
sleep 5

# 9. Verify health endpoints
echo -e "${YELLOW}Verifying health endpoints...${NC}"
RETRIES=0
while [ $RETRIES -lt $MAX_RETRIES ]; do
    if curl -f -s "${READY_URL}" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ready endpoint responding${NC}"
        break
    fi
    echo "Waiting for ready endpoint... (${RETRIES}/${MAX_RETRIES})"
    sleep $RETRY_DELAY
    RETRIES=$((RETRIES + 1))
done

if [ $RETRIES -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ Ready endpoint failed to respond${NC}"
    exit 1
fi

# 10. Run smoke tests
echo -e "${YELLOW}Running smoke tests...${NC}"
if [ -f "tests/smoke/wizard.spec.ts" ]; then
    npm run test:smoke || {
        echo -e "${RED}✗ Smoke tests failed${NC}"
        exit 1
    }
    echo -e "${GREEN}✓ Smoke tests passed${NC}"
else
    echo -e "${YELLOW}No smoke tests found, skipping...${NC}"
fi

# 11. Verify all health checks
echo -e "${YELLOW}Final health verification...${NC}"
HEALTH_RESPONSE=$(curl -s "${HEALTH_URL}")
if echo "$HEALTH_RESPONSE" | grep -q "\"status\":\"healthy\""; then
    echo -e "${GREEN}✓ Application health check passed${NC}"
else
    echo -e "${RED}✗ Application health check failed${NC}"
    echo "$HEALTH_RESPONSE"
    exit 1
fi

# 12. Check circuit breakers
echo -e "${YELLOW}Checking circuit breakers...${NC}"
BREAKER_STATUS=$(curl -s "http://localhost:5000/api/circuit-breaker/status" 2>/dev/null || echo "{}")
if echo "$BREAKER_STATUS" | grep -q "\"state\":\"OPEN\""; then
    echo -e "${YELLOW}⚠ Warning: Some circuit breakers are OPEN${NC}"
    echo "$BREAKER_STATUS"
else
    echo -e "${GREEN}✓ All circuit breakers are CLOSED${NC}"
fi

# 13. Final summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Rollback completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Target SHA: ${TARGET_SHA}"
echo "Rollback log: ${ROLLBACK_LOG}"
echo ""
echo -e "${YELLOW}Post-rollback checklist:${NC}"
echo "[ ] Monitor error rates for 10 minutes"
echo "[ ] Verify critical user flows"
echo "[ ] Update incident status in Slack"
echo "[ ] Document rollback reason"
echo ""
echo -e "${YELLOW}To monitor:${NC}"
echo "  curl ${HEALTH_URL}"
echo "  curl ${READY_URL}"
echo "  tail -f logs/app.log"

# Append completion to log
{
    echo "---"
    echo "Rollback completed at: $(date)"
    echo "Final health status:"
    curl -s "${HEALTH_URL}"
} >> "$ROLLBACK_LOG"

exit 0