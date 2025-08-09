#!/usr/bin/env bash
set -euo pipefail

PARENT="${1:?Parent PR number required}"
CHILD="${2:?Child PR number required}"

echo "🔄 Merging stacked PRs: Parent #$PARENT -> Child #$CHILD"

git fetch origin

parent_base=$(gh pr view "$PARENT" --json baseRefName --jq .baseRefName)
parent_head=$(gh pr view "$PARENT" --json headRefName --jq .headRefName)
child_head=$(gh pr view "$CHILD"  --json headRefName --jq .headRefName)

[[ -n "$parent_base" && -n "$parent_head" && -n "$child_head" ]]

# 1) Land parent
gh pr ready "$PARENT" >/dev/null
gh pr merge "$PARENT" --squash --auto >/dev/null
echo "✅ Parent #$PARENT queued for auto-merge."

# 2) Wait for MERGED
end=$((SECONDS+1800))
state=""
while (( SECONDS < end )); do
  state=$(gh pr view "$PARENT" --json state --jq .state || true)
  [[ "$state" == "MERGED" ]] && break
  sleep 10
done
[[ "$state" == "MERGED" ]] || { echo "Parent #$PARENT not merged in time"; exit 1; }

# 3) Rebase child onto parent's base (e.g., main)
git fetch origin
git switch "$child_head"
git pull --ff-only
git rebase "origin/$parent_base"

# 4) Validate
npm ci
npm run test:all

# 5) Push & retarget
git push --force-with-lease
gh pr edit "$CHILD" --base "$parent_base"
gh pr ready "$CHILD"

echo "🎉 Child PR #$CHILD rebased onto $parent_base and marked ready."
