#!/bin/bash
# Migration safety checker - detects destructive SQL operations
# Exit codes: 0=safe, 42=destructive (requires approval), 1=error
# Requires: ripgrep (rg) or grep

set -euo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-migrations}"
PR_NUMBER="${PR_NUMBER:-${GITHUB_PR_NUMBER:-}}"

echo "🔍 Scanning migrations in $MIGRATIONS_DIR for destructive operations"

# Check if migration directory exists
if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "✅ No migrations directory found - skipping check"
  exit 0
fi

# Patterns that indicate destructive operations
DESTRUCTIVE_PATTERNS=(
  "DROP\s+TABLE"
  "DROP\s+COLUMN" 
  "ALTER\s+TABLE.*DROP"
  "DELETE\s+FROM"
  "TRUNCATE"
  "DROP\s+INDEX"
  "DROP\s+CONSTRAINT"
  "ALTER\s+COLUMN.*TYPE"  # Type changes can be destructive
  "RENAME\s+COLUMN"       # Can break existing code
  "RENAME\s+TABLE"        # Can break existing code
)

# Build regex pattern
PATTERN=$(printf "|%s" "${DESTRUCTIVE_PATTERNS[@]}")
PATTERN="${PATTERN:1}" # Remove leading |

echo "🔍 Checking for patterns: ${DESTRUCTIVE_PATTERNS[*]}"

# Try ripgrep first, fallback to grep
destructive_files=()
if command -v rg >/dev/null 2>&1; then
  echo "📊 Using ripgrep for fast scanning..."
  while IFS= read -r line; do
    destructive_files+=("$line")
  done < <(rg -i --type sql --files-with-matches "$PATTERN" "$MIGRATIONS_DIR" || true)
else
  echo "📊 Using grep fallback (ripgrep not available)..."
  while IFS= read -r line; do
    destructive_files+=("$line")
  done < <(find "$MIGRATIONS_DIR" -name "*.sql" -exec grep -l -i -E "$PATTERN" {} \; || true)
fi

# Check results
if [[ ${#destructive_files[@]} -eq 0 ]]; then
  echo "✅ No destructive operations detected in migrations"
  exit 0
fi

echo "⚠️  Potentially destructive operations found in:"
for file in "${destructive_files[@]}"; do
  echo "  📄 $file"
  
  # Show specific matches for context
  if command -v rg >/dev/null 2>&1; then
    rg -i -n --color always "$PATTERN" "$file" | head -5 || true
  else
    grep -i -n -E --color=always "$PATTERN" "$file" | head -5 || true
  fi
  echo ""
done

# Check for rollback markers
has_rollback=false
for file in "${destructive_files[@]}"; do
  if grep -i -q "rollback\|undo\|down\|revert" "$file"; then
    echo "✅ Found rollback instructions in $file"
    has_rollback=true
  fi
done

if [[ "$has_rollback" != true ]]; then
  echo "⚠️  No rollback instructions found in destructive migrations"
fi

# Check if this is PR-scoped (not affecting other branches)
if [[ -n "$PR_NUMBER" ]]; then
  echo "🔍 PR #$PR_NUMBER detected - checking migration scope"
  
  # Get files changed in this PR
  changed_files=$(gh pr diff "$PR_NUMBER" --name-only | grep "^$MIGRATIONS_DIR" || true)
  
  # Check if destructive migrations are new in this PR
  pr_scoped=true
  for file in "${destructive_files[@]}"; do
    if ! echo "$changed_files" | grep -q "$(basename "$file")"; then
      echo "⚠️  $file contains destructive ops but wasn't changed in this PR"
      pr_scoped=false
    fi
  done
  
  if [[ "$pr_scoped" == true ]]; then
    echo "✅ All destructive migrations are PR-scoped"
  fi
fi

echo ""
echo "🚨 DESTRUCTIVE MIGRATION DETECTED"
echo "   This requires manual approval before deployment"
echo "   Exit code: 42 (requires approval)"

exit 42