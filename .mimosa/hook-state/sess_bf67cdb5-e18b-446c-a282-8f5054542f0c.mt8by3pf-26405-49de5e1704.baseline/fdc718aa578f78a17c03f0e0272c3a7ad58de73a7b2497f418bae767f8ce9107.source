#!/bin/bash
# v3_analyze_stale_branches.sh - v3.2.1
# Identifies stale branches and categorizes them by merge status
# Version: 3.2.1 (Updog_restore adapted - emoji-free, AI-branch aware)

set -euo pipefail

############################################
# 1. Configuration
############################################

# Repository root (default: current working directory)
REPO_DIR="${REPO_DIR:-$(pwd)}"

# Output directory for reports (default: inside repo)
DEFAULT_OUTPUT_DIR="$REPO_DIR/branch_cleanup_reports"
OUTPUT_DIR="${OUTPUT_DIR:-$DEFAULT_OUTPUT_DIR}"

# Git configuration
REMOTE="${REMOTE:-origin}"
MAIN_BRANCH="${MAIN_BRANCH:-$REMOTE/main}"

# Stale threshold in days
# - 42 days for initial deep cleanup
# - Override with STALE_THRESHOLD_DAYS=14 for monthly hygiene
STALE_THRESHOLD_DAYS="${STALE_THRESHOLD_DAYS:-42}"

############################################
# 2. Pre-flight checks & setup
############################################

# Ensure repo exists
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "ERROR: REPO_DIR '$REPO_DIR' is not a git repository."
  exit 1
fi

cd "$REPO_DIR"

# Remote sanity check
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "ERROR: Remote '$REMOTE' does not exist in this repository."
  exit 1
fi

# Ensure MAIN_BRANCH exists
if ! git rev-parse --verify "$MAIN_BRANCH" >/dev/null 2>&1; then
  echo "ERROR: MAIN_BRANCH '$MAIN_BRANCH' does not exist."
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Derived configuration
CURRENT_DATE=$(date +%s)
CURRENT_COMMIT=$(git rev-parse HEAD)

# Output files
STALE_BRANCHES_LIST="$OUTPUT_DIR/stale_branches_list.txt"
MERGE_STATUS_FILE="$OUTPUT_DIR/merge_status.txt"
SAFE_TO_DELETE="$OUTPUT_DIR/safe_to_delete.txt"
REQUIRES_REVIEW="$OUTPUT_DIR/requires_review.txt"
PROTECTED_BRANCHES="$OUTPUT_DIR/protected_branches.txt"
DEPENDABOT_PRS="$OUTPUT_DIR/dependabot_prs.txt"
REPORT_FILE="$OUTPUT_DIR/stale_branches_report.txt"

############################################
# 3. Run analysis
############################################

echo "=== Stale Branch Analysis v3.2.1 ==="
echo "Repository: $REPO_DIR"
echo "Reports:    $OUTPUT_DIR"
echo "Remote:     $REMOTE"
echo "Main:       $MAIN_BRANCH"
echo "Threshold:  $STALE_THRESHOLD_DAYS days"
echo "HEAD:       $CURRENT_COMMIT"
echo "Date:       $(date)"
echo ""

echo "Fetching latest from $REMOTE..."
git fetch "$REMOTE" --prune

# Clear previous output
> "$STALE_BRANCHES_LIST"
> "$MERGE_STATUS_FILE"
> "$SAFE_TO_DELETE"
> "$REQUIRES_REVIEW"
> "$PROTECTED_BRANCHES"
> "$DEPENDABOT_PRS"
> "$REPORT_FILE"

echo "Analyzing branches..."

git for-each-ref --sort=-committerdate "refs/remotes/$REMOTE" \
  --format='%(refname:short)|%(committerdate:unix)' | while IFS='|' read -r branch commit_date; do

    # Skip HEAD and main
    if [[ "$branch" == "$REMOTE/HEAD" ]] || [[ "$branch" == "$MAIN_BRANCH" ]]; then
        continue
    fi

    # Skip long-running / experimental branches (explicit exceptions)
    if [[ "$branch" == $REMOTE/longrun/* ]] || [[ "$branch" == $REMOTE/experiment/* ]]; then
        echo "$branch|longrun/experiment" >> "$PROTECTED_BRANCHES"
        continue
    fi

    # Skip AI-generated branches (claude/*, copilot/*, codex/*)
    if [[ "$branch" == $REMOTE/claude/* ]] || \
       [[ "$branch" == $REMOTE/copilot/* ]] || \
       [[ "$branch" == $REMOTE/codex/* ]]; then
        echo "$branch|ai-generated" >> "$PROTECTED_BRANCHES"
        continue
    fi

    # Flag dependabot branches for PR review, not deletion
    if [[ "$branch" == $REMOTE/dependabot/* ]]; then
        echo "$branch" >> "$DEPENDABOT_PRS"
        continue
    fi

    # Calculate age in days
    age_seconds=$((CURRENT_DATE - commit_date))
    age_days=$((age_seconds / 86400))

    # Check if stale
    if [ "$age_days" -gt "$STALE_THRESHOLD_DAYS" ]; then
        echo "$branch|$age_days" >> "$STALE_BRANCHES_LIST"
    fi
done

stale_count=$(wc -l < "$STALE_BRANCHES_LIST" 2>/dev/null || echo "0")
protected_count=$(wc -l < "$PROTECTED_BRANCHES" 2>/dev/null || echo "0")
dependabot_count=$(wc -l < "$DEPENDABOT_PRS" 2>/dev/null || echo "0")

echo "Found $stale_count stale branches (>$STALE_THRESHOLD_DAYS days old)"
echo "Protected branches (excluded): $protected_count"
echo "Dependabot PRs (separate workflow): $dependabot_count"

############################################
# 4. Merge status & ahead/behind
############################################

echo "Checking merge status..."
echo "Branch|Age(days)|Merged|Ahead|Behind" > "$MERGE_STATUS_FILE"

while IFS='|' read -r branch age_days; do
    [ -z "$branch" ] && continue

    # Check if merged into MAIN_BRANCH
    if git merge-base --is-ancestor "$branch" "$MAIN_BRANCH" 2>/dev/null; then
        merged="yes"
    else
        merged="no"
    fi

    # Ahead/behind (symmetric difference)
    ahead_behind=$(git rev-list --left-right --count "$MAIN_BRANCH"..."$branch" 2>/dev/null || echo "0 0")
    behind=$(echo "$ahead_behind" | awk '{print $1}')
    ahead=$(echo "$ahead_behind" | awk '{print $2}')

    echo "$branch|$age_days|$merged|$ahead|$behind" >> "$MERGE_STATUS_FILE"

    if [ "$merged" = "yes" ]; then
        echo "$branch" >> "$SAFE_TO_DELETE"
    else
        echo "$branch (ahead: $ahead, behind: $behind)" >> "$REQUIRES_REVIEW"
    fi
done < "$STALE_BRANCHES_LIST"

safe_count=$(wc -l < "$SAFE_TO_DELETE" 2>/dev/null || echo "0")
review_count=$(wc -l < "$REQUIRES_REVIEW" 2>/dev/null || echo "0")

############################################
# 5. Report
############################################

{
    echo "========================================"
    echo "STALE BRANCH ANALYSIS REPORT v3.2.1"
    echo "========================================"
    echo "Generated: $(date)"
    echo "Repo: $REPO_DIR"
    echo "Remote: $REMOTE"
    echo "Main: $MAIN_BRANCH"
    echo "HEAD: $CURRENT_COMMIT"
    echo "Stale threshold: $STALE_THRESHOLD_DAYS days"
    echo ""
    echo "SUMMARY:"
    echo "  Total stale branches: $stale_count"
    echo "  - Safe to delete (Merged):   $safe_count"
    echo "  - Requires review (Unmerged): $review_count"
    echo "  Protected branches (excluded): $protected_count"
    echo "  Dependabot PRs (separate): $dependabot_count"
    echo ""
    echo "PROTECTED PATTERNS:"
    echo "  - $REMOTE/longrun/*"
    echo "  - $REMOTE/experiment/*"
    echo "  - $REMOTE/claude/* (AI-generated)"
    echo "  - $REMOTE/copilot/* (AI-generated)"
    echo "  - $REMOTE/codex/* (AI-generated)"
    echo ""
    echo "========================================"
    echo "SAFE TO DELETE (MERGED)"
    echo "========================================"
    # FIXED: Use -gt for numeric comparison (was incorrectly using >)
    if [ "$safe_count" -gt 0 ]; then cat "$SAFE_TO_DELETE"; else echo "(none)"; fi
    echo ""
    echo "========================================"
    echo "REQUIRES REVIEW (UNMERGED)"
    echo "========================================"
    # FIXED: Use -gt for numeric comparison (was incorrectly using >)
    if [ "$review_count" -gt 0 ]; then cat "$REQUIRES_REVIEW"; else echo "(none)"; fi
    echo ""
    echo "========================================"
    echo "DEPENDABOT PRS (Handle via GitHub)"
    echo "========================================"
    if [ "$dependabot_count" -gt 0 ]; then cat "$DEPENDABOT_PRS"; else echo "(none)"; fi
    echo ""
    echo "========================================"
    echo "PROTECTED BRANCHES (Excluded from analysis)"
    echo "========================================"
    if [ "$protected_count" -gt 0 ]; then cat "$PROTECTED_BRANCHES"; else echo "(none)"; fi
    echo ""
    echo "========================================"
    echo "NEXT STEPS"
    echo "========================================"
    echo "1. Run v3_branch_cleanup_safety.sh to create backups and safety token."
    echo "2. Run v3_branch_cleanup_automation.sh --dry-run to test deletions."
    echo "3. Run v3_branch_cleanup_automation.sh (no --dry-run) to delete safe branches."
    echo "4. Manually review branches listed in 'REQUIRES REVIEW (UNMERGED)'."
    echo "5. Handle Dependabot PRs via GitHub (merge or close stale ones)."
} > "$REPORT_FILE"

cat "$REPORT_FILE"
echo ""
echo "Analysis complete. Reports saved to: $OUTPUT_DIR"
