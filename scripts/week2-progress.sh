#!/usr/bin/env bash
set -euo pipefail

ART_DIR="artifacts/week2"
mkdir -p "$ART_DIR"

TS_OUT="$ART_DIR/tsc.progress.out"
TS_ERRORS=0

if npm run check:server >"$TS_OUT" 2>&1; then
  TS_ERRORS=$(grep -c "error TS" "$TS_OUT" || true)
else
  TS_ERRORS=$(grep -c "error TS" "$TS_OUT" || true)
fi

STAMP="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
LAST_COMMIT="$(git log -1 --oneline || echo "no-commit")"
echo "$STAMP | $TS_ERRORS errors remaining | $LAST_COMMIT" | tee -a "$ART_DIR/progress.log"

echo
echo "Progress updated -> $ART_DIR/progress.log"
echo "Last tsc output -> $TS_OUT"

exit 0
