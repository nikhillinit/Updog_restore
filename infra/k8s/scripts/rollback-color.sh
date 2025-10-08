#!/usr/bin/env bash
set -euo pipefail
CURRENT=$(kubectl get svc updog -o jsonpath='{.spec.selector.color}')
TARGET=$([ "$CURRENT" == "green" ] && echo "blue" || echo "green")
kubectl patch service updog -p "{\"spec\":{\"selector\":{\"app\":\"updog\",\"color\":\"${TARGET}\"}}}"
echo "Rolled back to ${TARGET}."
