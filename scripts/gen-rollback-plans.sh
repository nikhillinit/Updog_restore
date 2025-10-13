#!/usr/bin/env bash
set -Eeuo pipefail

# Generate rollback safety nets (does NOT execute them)
# Creates two scripts:
# 1. rollback-plan.sh - Per-commit revert commands
# 2. selective-rollback.sh - Per-file selective rollback

OUT="scripts"
mkdir -p "$OUT"

echo "=== Generating Rollback Plans ==="

# Capture likely TS remediation commits (broader grep for safety)
echo "Analyzing commit history…"
git log --oneline origin/main..HEAD \
  --grep="types-only" --grep="types:" --grep="TypeScript" --grep="TS" --grep="fix:" --grep="strict" \
  > "$OUT/typed-commits.txt" || true

# Count commits
COMMIT_COUNT=$(wc -l < "$OUT/typed-commits.txt" 2>/dev/null || echo 0)
echo "Found $COMMIT_COUNT TypeScript-related commits"

# Per-commit revert script (does NOT execute)
: > "$OUT/rollback-plan.sh"
echo "#!/usr/bin/env bash" >> "$OUT/rollback-plan.sh"
echo "# Per-commit rollback plan (generated: $(date))" >> "$OUT/rollback-plan.sh"
echo "# WARNING: Review before executing!" >> "$OUT/rollback-plan.sh"
echo "set -euo pipefail" >> "$OUT/rollback-plan.sh"
echo "" >> "$OUT/rollback-plan.sh"

while read -r line; do
  [ -z "$line" ] && continue
  hash="${line%% *}"
  echo "git revert $hash --no-edit  # $line" >> "$OUT/rollback-plan.sh"
done < "$OUT/typed-commits.txt"

chmod +x "$OUT/rollback-plan.sh"

# Per-file selective rollback (ts/tsx only)
echo "Analyzing changed TypeScript files…"
: > "$OUT/selective-rollback.sh"
echo "#!/usr/bin/env bash" >> "$OUT/selective-rollback.sh"
echo "# Per-file selective rollback (generated: $(date))" >> "$OUT/selective-rollback.sh"
echo "# WARNING: Review before executing!" >> "$OUT/selective-rollback.sh"
echo "set -euo pipefail" >> "$OUT/selective-rollback.sh"
echo "" >> "$OUT/selective-rollback.sh"

FILE_COUNT=0
git diff --name-only origin/main..HEAD | grep -E '\.(ts|tsx)$' | while read -r f; do
  echo "git checkout origin/main -- '$f'  # Rollback $f" >> "$OUT/selective-rollback.sh"
  FILE_COUNT=$((FILE_COUNT + 1))
done || true

chmod +x "$OUT/selective-rollback.sh"

# Count files
TS_FILES=$(git diff --name-only origin/main..HEAD | grep -E '\.(ts|tsx)$' | wc -l || echo 0)

echo ""
echo "✅ Rollback plans created:"
echo "   - $OUT/rollback-plan.sh ($COMMIT_COUNT commits)"
echo "   - $OUT/selective-rollback.sh ($TS_FILES TypeScript files)"
echo ""
echo "⚠️  These scripts are SAFETY NETS ONLY"
echo "    Review carefully before executing"
echo ""
