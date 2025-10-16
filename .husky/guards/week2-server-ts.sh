#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Week 2: Server strictness guard (scoped to server/shared + client core/lib/utils)
# - Runs only when staged changes touch:
#     server/**/*.ts(x)  OR  shared/**/*.ts(x)
#     client/src/(core|lib|utils)/**/*.ts(x)   [extended scope, Week-2]
# - Bypass locally with:
#     SKIP_SERVER_TS=1 git commit -m "..."
#     git commit --no-verify
# - Windows-safe: auto-falls back to git.exe if needed
# ------------------------------------------------------------------------------
set -euo pipefail

# 0) Respect bypass
if [ -n "${SKIP_SERVER_TS:-}" ]; then
  echo "  → SKIP_SERVER_TS set — skipping server strictness check"
  exit 0
fi

# 1) Pick a git executable (Windows-safe fallback)
GIT_CMD="${GIT_CMD:-git}"
if ! command -v "$GIT_CMD" >/dev/null 2>&1; then
  if command -v git.exe >/dev/null 2>&1; then
    GIT_CMD="git.exe"
  else
    GIT_CMD="git" # last resort
  fi
fi

# 2) Collect staged files (Added, Copied, Modified)
if [ -n "${STAGED_TS_FILES:-}" ]; then
  # Reuse if your existing hook exported it earlier
  STAGED_ALL="$STAGED_TS_FILES"
else
  STAGED_ALL="$("$GIT_CMD" diff --cached --name-only --diff-filter=ACM || true)"
fi

# 3) Filter to TypeScript files under Week-2 scope
#    server/**, shared/**, and client/src/(core|lib|utils)/**  (extended)
STAGED_SCOPE="$(printf '%s\n' "$STAGED_ALL" \
  | awk '/^server\/.*\.(ts|tsx)$|^shared\/.*\.(ts|tsx)$|^client\/src\/(core|lib|utils)\/.*\.(ts|tsx)$/' || true)"

if [ -z "$STAGED_SCOPE" ]; then
  echo "  → No staged server/shared/client-core-lib-utils TS files — skipping server check"
  exit 0
fi

echo "  → Checking server strictness (Week 2)..."
echo "    Staged files in scope:"
printf '%s\n' "$STAGED_SCOPE" | sed 's/^/      • /'
echo

# 4) Run strict server type-check (Week-2 scope)
if ! npm run -s check:server; then
  echo
  echo "❌ Server strict type check failed (Week 2 guard)"
  echo "💡 Fix errors or bypass temporarily with:"
  echo "   • SKIP_SERVER_TS=1 git commit -m \"WIP: ...\""
  echo "   • git commit --no-verify"
  echo "🔎 To inspect locally: npm run check:server"
  exit 1
fi

echo "    ✅ Server types OK"
exit 0
