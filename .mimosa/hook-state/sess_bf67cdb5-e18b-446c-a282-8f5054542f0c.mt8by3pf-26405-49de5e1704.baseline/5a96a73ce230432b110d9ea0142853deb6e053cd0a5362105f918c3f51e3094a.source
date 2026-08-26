#!/bin/bash

# Guardian canary health check with proper timeout handling
# Exit codes:
#   0 - Success
#   1 - Health check failed  
#   124 - Timeout (prevented with --max-time)

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
MAX_TIME=8  # 8 seconds per request
RETRY_COUNT=2
RETRY_DELAY=2

echo "🛡️ Guardian Canary Check"
echo "========================"
echo "Target: $BASE_URL"
echo ""

# Function to check endpoint
check_endpoint() {
    local endpoint=$1
    local description=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $description... "
    
    # Use curl with explicit timeout and retry
    local http_code
    http_code=$(curl -f -s -o /dev/null -w "%{http_code}" \
            --max-time $MAX_TIME \
            --retry $RETRY_COUNT \
            --retry-delay $RETRY_DELAY \
            "$BASE_URL$endpoint" 2>/dev/null || echo "000")
    
    if [[ "$http_code" =~ $expected_status ]]; then
        echo "✅"
        return 0
    else
        echo "❌ (HTTP $http_code)"
        return 1
    fi
}

# Track failures
FAILURES=0

# Check health endpoint
if ! check_endpoint "/healthz" "Health endpoint"; then
    FAILURES=$((FAILURES + 1))
fi

# Check API status (optional)
if ! check_endpoint "/api/v1/status" "API status" "200|204"; then
    echo "  └─ API status endpoint not critical for canary"
fi

# Check detailed health if available
echo -n "Checking detailed health... "
HEALTH_RESPONSE=$(curl -sS -f --max-time 5 "$BASE_URL/health/detailed-json" 2>/dev/null || echo '{"status":"unknown"}')

# Extract metrics if available (using grep instead of jq for compatibility)
if echo "$HEALTH_RESPONSE" | grep -q '"status"'; then
    echo "✅"
    echo "  └─ Response: ${HEALTH_RESPONSE:0:100}..."
else
    echo "⚠️ (no detailed metrics)"
fi

# Summary
echo ""
echo "------------------------"
if [ $FAILURES -eq 0 ]; then
    echo "✅ Guardian canary: PASS"
    exit 0
else
    echo "❌ Guardian canary: FAILED ($FAILURES critical checks failed)"
    exit 1
fi