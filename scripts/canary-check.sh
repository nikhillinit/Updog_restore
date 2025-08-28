#!/bin/bash
# Canary health check - validates P95 latency and error rates
# Requires: curl, jq, bc
# Exit codes: 0=healthy, 1=unhealthy, 42=insufficient samples (non-blocking)

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
P95_THRESHOLD_MS="${P95_THRESHOLD_MS:-2000}"
ERROR_RATE_THRESHOLD="${ERROR_RATE_THRESHOLD:-0.05}"
MIN_SAMPLES="${MIN_SAMPLES:-50}"
ITERATIONS="${ITERATIONS:-20}"  # 3 paths × 20 = 60 samples

# Test endpoints
ENDPOINTS=(
  "/api/health"
  "/api/funds"
  "/api/portfolio/summary"
)

echo "🏥 Starting canary health check (${MIN_SAMPLES} samples required)"

# Collect performance samples
latencies=()
error_count=0
total_requests=0

for i in $(seq 1 "$ITERATIONS"); do
  for endpoint in "${ENDPOINTS[@]}"; do
    start_time=$(date +%s%3N)
    
    if curl -s -f --max-time 10 "$BASE_URL$endpoint" > /dev/null 2>&1; then
      end_time=$(date +%s%3N)
      latency=$((end_time - start_time))
      latencies+=($latency)
    else
      ((error_count++))
    fi
    
    ((total_requests++))
    
    # Small delay to avoid overwhelming the server
    sleep 0.1
  done
done

echo "📊 Collected $total_requests samples (${#latencies[@]} successful, $error_count errors)"

# Check minimum sample requirement
if [ "$total_requests" -lt "$MIN_SAMPLES" ]; then
  echo "⚠️  Insufficient samples ($total_requests < $MIN_SAMPLES) - non-blocking"
  exit 42
fi

# Calculate P95 latency
if [ ${#latencies[@]} -eq 0 ]; then
  echo "❌ No successful requests - all requests failed"
  exit 1
fi

# Sort latencies for percentile calculation
IFS=$'\n' sorted_latencies=($(sort -n <<<"${latencies[*]}"))
p95_index=$(( (${#latencies[@]} * 95 + 99) / 100 - 1 ))
p95_latency=${sorted_latencies[$p95_index]}

# Calculate error rate
error_rate=$(echo "scale=4; $error_count / $total_requests" | bc -l)

echo "📈 P95 latency: ${p95_latency}ms (threshold: ${P95_THRESHOLD_MS}ms)"
echo "📈 Error rate: $error_rate (threshold: $ERROR_RATE_THRESHOLD)"

# Evaluate health
if [ "$p95_latency" -gt "$P95_THRESHOLD_MS" ]; then
  echo "❌ P95 latency exceeded threshold"
  exit 1
fi

if [ "$(echo "$error_rate > $ERROR_RATE_THRESHOLD" | bc -l)" -eq 1 ]; then
  echo "❌ Error rate exceeded threshold"
  exit 1
fi

echo "✅ Canary health: PASS"
exit 0
