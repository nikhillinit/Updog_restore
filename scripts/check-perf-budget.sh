#!/bin/bash
# Performance Budget Protection Script
# Prevents perf budget increases without approval

set -euo pipefail

# Base branch to compare against (default: origin/main)
BASE_BRANCH=${1:-origin/main}

# Check if .perf-budget.json has been modified
if git diff --name-only "$BASE_BRANCH"...HEAD | grep -qE '^\.perf-budget\.json'; then
  echo "📊 Performance budget file has been modified"
  
  # Check if the PR has the required approval label
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null || echo "")
    
    if [ -n "$PR_NUMBER" ]; then
      LABELS=$(gh pr view "$PR_NUMBER" --json labels -q '.labels[].name' 2>/dev/null || echo "")
      
      if echo "$LABELS" | grep -q 'approved:perf-budget-change'; then
        echo "✅ Performance budget change approved (label: approved:perf-budget-change)"
        exit 0
      else
        echo "❌ Performance budget changed without 'approved:perf-budget-change' label"
        echo "   Please get approval from @product and @dx-lead"
        exit 1
      fi
    fi
  fi
  
  # If we can't check labels (local dev), show warning but don't block
  echo "⚠️  Unable to verify approval label (running locally?)"
  echo "   Ensure PR has 'approved:perf-budget-change' label before merging"
fi

echo "✅ No performance budget changes detected"
exit 0