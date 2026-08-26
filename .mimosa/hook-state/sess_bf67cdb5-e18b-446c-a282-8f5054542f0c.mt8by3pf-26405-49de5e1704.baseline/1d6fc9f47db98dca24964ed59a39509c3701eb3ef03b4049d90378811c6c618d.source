#!/usr/bin/env bash
# Simple helper to toggle Redis connectivity via ToxiProxy.
# Requires: docker-compose.toxiproxy.yml running; toxiproxy admin on :8474
set -euo pipefail

ADMIN=http://localhost:8474
PROXY=redis

cmd=${1:-status}

case "$cmd" in
  status)
    curl -fsSL "$ADMIN/proxies" | jq
    ;;
  break)
    # Add 3s latency + 30% packet loss
    curl -fsSL -XPOST "$ADMIN/proxies/$PROXY/toxics" \
      -H 'Content-Type: application/json' \
      -d '{"type":"latency","attributes":{"latency":3000,"jitter":1000},"stream":"downstream"}' | jq
    curl -fsSL -XPOST "$ADMIN/proxies/$PROXY/toxics" \
      -H 'Content-Type: application/json' \
      -d '{"type":"limit_data","attributes":{"rate":1024},"stream":"downstream"}' | jq
    ;;
  heal)
    # Remove all toxics
    ids=$(curl -fsSL "$ADMIN/proxies/$PROXY/toxics" | jq -r '.[].name')
    for t in $ids; do
      curl -fsSL -XDELETE "$ADMIN/proxies/$PROXY/toxics/$t" >/dev/null
    done
    echo "Healed."
    ;;
  *)
    echo "Usage: $0 {status|break|heal}"
    exit 1
    ;;
esac