#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://staging.yourdomain.com}"
METRICS_KEY="${METRICS_KEY:-}"
HEALTH_KEY="${HEALTH_KEY:-}"
FUND_SIZE="${FUND_SIZE:-100000000}"

echo "== Health checks =="
curl -fsSL "$BASE_URL/healthz" | jq .

if [[ -n "$HEALTH_KEY" ]]; then
  curl -fsSL -H "X-Health-Key: $HEALTH_KEY" "$BASE_URL/readyz" | jq .
else
  curl -fsSL "$BASE_URL/readyz" | jq .
fi

echo "== Metrics check =="
if [[ -n "$METRICS_KEY" ]]; then
  curl -fsSL -H "Authorization: Bearer $METRICS_KEY" "$BASE_URL/metrics" | head -n 20
else
  echo "(skip: METRICS_KEY not set)"
fi

echo "== Fund calculation (async) =="
resp_headers=$(mktemp)
resp=$(curl -sS -D "$resp_headers" -o /dev/null -w "%{http_code}" \
  -H 'Content-Type: application/json' \
  -X POST "$BASE_URL/api/funds/calculate" \
  --data "{\"fundSize\":$FUND_SIZE}")

code="$resp"
loc=$(awk '/^[Ll]ocation:/ {print $2}' "$resp_headers" | tr -d '\r\n')

echo "HTTP: $code"
echo "Location: $loc"

if [[ "$code" == "202" && -n "$loc" ]]; then
  echo "Polling operation..."
  for i in $(seq 1 30); do
    body=$(curl -fsSL "$loc")
    status=$(echo "$body" | jq -r '.status // empty' || true)
    echo "[$i] status=$status"
    if [[ "$status" =~ (succeed|success|complete|done) ]]; then
      echo "✅ Completed"
      exit 0
    fi
    sleep 1
  done
  echo "❌ Timed out"
  exit 1
else
  echo "Non-202 response; body follow-up may be needed."
fi