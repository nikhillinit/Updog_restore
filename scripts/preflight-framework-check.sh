#!/usr/bin/env bash
set -euo pipefail
echo "Scanning server/ for framework imports..."
EXP=$(grep -R --include='*.ts' --include='*.tsx' "from 'express'" server || true)
FAS=$(grep -R --include='*.ts' --include='*.tsx' "from 'fastify'" server || true)
echo "Express occurrences:"
echo "$EXP" | sed -n '1,10p'
echo ""
echo "Fastify occurrences:"
echo "$FAS" | sed -n '1,10p'
if [[ -n "$EXP" && -z "$FAS" ]]; then
  echo "✅ Express confirmed."
else
  echo "⚠️ Mixed or unknown — verify manually."
fi
