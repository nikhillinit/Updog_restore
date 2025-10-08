#!/usr/bin/env bash
set -euo pipefail
COLOR=${1:-green}
kubectl patch service updog -p "{\"spec\":{\"selector\":{\"app\":\"updog\",\"color\":\"${COLOR}\"}}}"
echo "Traffic switched to ${COLOR}."
