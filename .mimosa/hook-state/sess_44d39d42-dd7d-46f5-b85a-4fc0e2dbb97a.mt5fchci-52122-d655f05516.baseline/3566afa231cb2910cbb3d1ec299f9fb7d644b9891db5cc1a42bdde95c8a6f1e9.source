#!/usr/bin/env bash
# -------------------------------------------------------------
# Graduated stress test - tests with increasing concurrency
# -------------------------------------------------------------
set -euo pipefail

# Create stress results directory with date namespace
DATE=$(date +%F)
mkdir -p ".stress/$DATE"

echo "🚀 Starting graduated stress test..."
echo "Target: http://localhost:3000/api/funds"

for C in 2 4 8 16 32; do
  echo "🔬 Testing with concurrency $C..."
  
  # Run autocannon with JSON output
  if command -v autocannon &> /dev/null; then
    autocannon -c $C -d 30 -j http://localhost:3000/api/funds \
      > ".stress/$DATE/stress-c$C.json"
    
    # Extract key metrics for quick view
    P95=$(jq '.latency.p95' ".stress/$DATE/stress-c$C.json")
    RPS=$(jq '.requests.average' ".stress/$DATE/stress-c$C.json")
    echo "   ✓ P95: ${P95}ms, RPS: ${RPS}"
  else
    echo "⚠️  autocannon not found. Install with: npm install -g autocannon"
    exit 1
  fi
done

echo "✅ Stress test complete. Results in .stress/$DATE/"
