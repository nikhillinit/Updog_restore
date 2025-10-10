#!/usr/bin/env bash
# Mark all changed files in a PR as viewed
# Requires: gh (GitHub CLI) authenticated with your account
# Usage: ./scripts/mark-pr-files-viewed.sh <PR_NUMBER>

set -euo pipefail

# Configuration
REPO="nikhillinit/Updog_restore"

# Validate arguments
if [ $# -eq 0 ]; then
  echo "❌ Error: PR number is required"
  echo "Usage: $0 <PR_NUMBER>"
  exit 1
fi

PR=$1

# Validate PR number is a positive integer
if ! [[ "$PR" =~ ^[0-9]+$ ]]; then
  echo "❌ Error: PR number must be a positive integer"
  exit 1
fi

echo "🔍 Checking PR #$PR in $REPO..."

# Verify gh CLI is installed and authenticated
if ! command -v gh &> /dev/null; then
  echo "❌ Error: GitHub CLI (gh) is not installed"
  echo "Install from: https://cli.github.com"
  exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
  echo "❌ Error: GitHub CLI is not authenticated"
  echo "Run: gh auth login"
  exit 1
fi

# Get the PR node ID
echo "📋 Getting PR details..."
PR_ID=$(gh pr view "$PR" -R "$REPO" --json id -q .id)

if [ -z "$PR_ID" ]; then
  echo "❌ Error: Could not find PR #$PR"
  exit 1
fi

echo "✅ Found PR #$PR (ID: $PR_ID)"

# Get list of changed files and mark each as viewed
echo "📝 Marking files as viewed..."
FILE_COUNT=0
ERROR_COUNT=0

while IFS= read -r PATH; do
  if [ -z "$PATH" ]; then
    continue
  fi
  
  FILE_COUNT=$((FILE_COUNT + 1))
  
  if gh api graphql \
    -F prId="$PR_ID" -F path="$PATH" \
    -f query='mutation($prId:ID!, $path:String!) {
      markFileAsViewed(input:{pullRequestId:$prId, path:$path}) { clientMutationId }
    }' &> /dev/null; then
    echo "  ✓ Viewed: $PATH"
  else
    echo "  ⚠️  Failed to mark as viewed: $PATH"
    ERROR_COUNT=$((ERROR_COUNT + 1))
  fi
done < <(gh pr view "$PR" -R "$REPO" --json files -q '.files[].path')

echo ""
echo "✅ Completed!"
echo "   Files processed: $FILE_COUNT"
if [ "$ERROR_COUNT" -gt 0 ]; then
  echo "   ⚠️  Errors: $ERROR_COUNT"
  exit 1
fi
