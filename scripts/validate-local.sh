#!/usr/bin/env bash
# Local validation script - run before deployment
set -euo pipefail

echo "🔍 Fund Calculation Local Validation"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILURES=0

# 1. TypeScript compilation
echo -e "\n${YELLOW}1. TypeScript Check${NC}"
if npm run check > /dev/null 2>&1; then
    echo -e "${GREEN}✓ TypeScript compilation successful${NC}"
else
    echo -e "${RED}✗ TypeScript compilation failed${NC}"
    ((FAILURES++))
fi

# 2. Lint check
echo -e "\n${YELLOW}2. Lint Check${NC}"
if npm run lint > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Linting passed${NC}"
else
    echo -e "${RED}✗ Linting failed${NC}"
    ((FAILURES++))
fi

# 3. Memory mode test
echo -e "\n${YELLOW}3. Memory Mode Test${NC}"
if npm run test:memory -- --run --reporter=dot > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Memory mode tests passed${NC}"
else
    echo -e "${RED}✗ Memory mode tests failed${NC}"
    ((FAILURES++))
fi

# 4. Redis leak check
echo -e "\n${YELLOW}4. Redis Leak Check${NC}"
if npm run verify:no-redis > /dev/null 2>&1; then
    echo -e "${GREEN}✓ No Redis leaks in memory mode${NC}"
else
    echo -e "${RED}✗ Redis leak detected${NC}"
    ((FAILURES++))
fi

# 5. Build check
echo -e "\n${YELLOW}5. Production Build${NC}"
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Production build successful${NC}"
    
    # Check bundle size
    if [ -d "dist/public/assets" ]; then
        BUNDLE_SIZE=$(du -sk dist/public/assets | cut -f1)
        if [ "$BUNDLE_SIZE" -lt 500 ]; then
            echo -e "${GREEN}  Bundle size: ${BUNDLE_SIZE}KB (OK)${NC}"
        else
            echo -e "${YELLOW}  Bundle size: ${BUNDLE_SIZE}KB (Large)${NC}"
        fi
    fi
else
    echo -e "${RED}✗ Production build failed${NC}"
    ((FAILURES++))
fi

# 6. Local server test
echo -e "\n${YELLOW}6. Local Server Test${NC}"
# Start server in background
PORT=5001 REDIS_URL=memory:// npm run dev:api > /dev/null 2>&1 &
SERVER_PID=$!
sleep 5

# Test health endpoint
if curl -f http://localhost:5001/healthz > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Server health check passed${NC}"
    
    # Test fund calculation
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:5001/api/funds/calculate \
        -H "Content-Type: application/json" \
        -d '{"fundSize": 100000000}' 2>/dev/null | tail -1)
    
    if [ "$RESPONSE" = "202" ] || [ "$RESPONSE" = "200" ]; then
        echo -e "${GREEN}✓ Fund calculation endpoint working${NC}"
    else
        echo -e "${RED}✗ Fund calculation failed (HTTP $RESPONSE)${NC}"
        ((FAILURES++))
    fi
else
    echo -e "${RED}✗ Server failed to start${NC}"
    ((FAILURES++))
fi

# Kill test server
kill $SERVER_PID 2>/dev/null || true

# 7. Check for required files
echo -e "\n${YELLOW}7. Required Files Check${NC}"
REQUIRED_FILES=(
    ".env.staging.example"
    ".github/workflows/deploy-staging.yml"
    "server/lib/redis/cluster.ts"
    "server/middleware/auth-metrics.ts"
    "tests/k6/k6-baseline.js"
    "monitoring/prometheus-rules.yaml"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file exists${NC}"
    else
        echo -e "${RED}✗ $file missing${NC}"
        ((FAILURES++))
    fi
done

# Summary
echo -e "\n===================================="
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready for deployment.${NC}"
    exit 0
else
    echo -e "${RED}❌ $FAILURES checks failed. Please fix before deploying.${NC}"
    exit 1
fi