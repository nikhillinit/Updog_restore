#!/usr/bin/env bash
set -euo pipefail

PARENT_PR="${1:-40}"
BASE_BRANCH="${2:-ai_main_23984511d18b}"
PR40_SHA="${3:-f84dca62f11b46d4199d7e2b1184a21a03009e12}"

# Ensure we're on the right branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "feature/graduation-reserves" ]]; then
  echo "⚠️ Not on feature/graduation-reserves branch"
  exit 1
fi

git fetch origin

# Check if there are new commits
if [[ -z "$(git log --oneline "${PR40_SHA}..HEAD" 2>/dev/null)" ]]; then
  echo "ℹ️ No commits since ${PR40_SHA}. Push your changes first."
  exit 0
fi

# Get commits with better formatting
RANGE_SUMMARY=$(git log --pretty=format:"- %h %s" "${PR40_SHA}..HEAD")

# Create temp file for body
TEMP_BODY=$(mktemp)
trap "rm -f $TEMP_BODY" EXIT

cat > "$TEMP_BODY" <<EOF
## 🎯 Graduation-Driven Reserves (stacked on #${PARENT_PR})

Replaces fixed 67% with dynamic calculation based on graduation and timing.

### Changes
- [ ] Engine: \`computeReservesFromGraduation()\`
- [ ] Integration: allocation-manager
- [ ] Demo: \`/reserves-demo\`
- [ ] Tests: unit + e2e smoke

**Blocked by:** #${PARENT_PR}

<details>
<summary>Commits since PR #${PARENT_PR} head</summary>

${RANGE_SUMMARY}

</details>
EOF

gh pr create \
  --base "${BASE_BRANCH}" \
  --title "feat(reserves): graduation-driven reserves (stacked on #${PARENT_PR})" \
  --draft \
  --body-file "$TEMP_BODY" \
  --label stacked \
  --label needs-review

echo "📝 PR created successfully"
