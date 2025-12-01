#!/bin/bash
# v3_branch_cleanup_automation.sh - v3.2.1
# Automates deletion of safe-to-delete branches with Safety Token check
# Version: 3.2.1 (Updog_restore adapted - emoji-free)

set -euo pipefail

############################################
# 1. Configuration
############################################

REPO_DIR="${REPO_DIR:-$(pwd)}"
DEFAULT_REPORT_DIR="$REPO_DIR/branch_cleanup_reports"
SAFE_TO_DELETE_FILE="${SAFE_TO_DELETE_FILE:-$DEFAULT_REPORT_DIR/safe_to_delete.txt}"
LOG_FILE="${LOG_FILE:-$REPO_DIR/cleanup_$(date +%Y%m%d_%H%M%S).log}"
TOKEN_FILE="$REPO_DIR/.branch_cleanup_safety_token"

# Default 6-hour window for backup validity (override via env)
MAX_SAFETY_AGE_HOURS="${MAX_SAFETY_AGE_HOURS:-6}"
REMOTE="${REMOTE:-origin}"

############################################
# 2. Help & args
############################################

show_help() {
  cat << EOF
Usage: $0 [OPTIONS]

Automates deletion of safe-to-delete branches identified by v3_analyze_stale_branches.sh.

OPTIONS:
  --dry-run     Simulate deletion without actually deleting branches
  -h, --help    Show this help message

Environment variables:
  REPO_DIR              Path to git repository (default: current directory)
  SAFE_TO_DELETE_FILE   Path to safe_to_delete.txt (default: \$REPO_DIR/branch_cleanup_reports/safe_to_delete.txt)
  REMOTE                Remote name (default: origin)
  MAX_SAFETY_AGE_HOURS  Max age (in hours) of safety backup token (default: 6)

PREREQUISITES:
  1. v3_analyze_stale_branches.sh must have been run.
  2. v3_branch_cleanup_safety.sh must have been run recently (valid safety token present).
EOF
}

DRY_RUN=false
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    show_help
    exit 0
elif [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
fi

echo "=== Branch Cleanup Automation v3.2.1 ===" | tee "$LOG_FILE"
echo "Repository: $REPO_DIR" | tee -a "$LOG_FILE"
echo "Remote:     $REMOTE" | tee -a "$LOG_FILE"
echo "Mode:       $([ "$DRY_RUN" == true ] && echo "DRY RUN" || echo "LIVE DELETE")" | tee -a "$LOG_FILE"
echo "Date:       $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

############################################
# 3. Pre-flight checks
############################################

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[FAIL] ERROR: REPO_DIR '$REPO_DIR' is not a git repository." | tee -a "$LOG_FILE"
  exit 1
fi

cd "$REPO_DIR"

# Remote sanity check
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "[FAIL] ERROR: Remote '$REMOTE' does not exist in this repository." | tee -a "$LOG_FILE"
  exit 1
fi

# Safety token check
if [ ! -f "$TOKEN_FILE" ]; then
  echo "[FAIL] ERROR: Safety token not found at $TOKEN_FILE" | tee -a "$LOG_FILE"
  echo "  Run v3_branch_cleanup_safety.sh before deleting branches." | tee -a "$LOG_FILE"
  exit 1
fi

# Use bash built-in instead of cat (Codacy: avoid UUoC)
TOKEN_TIMESTAMP=$(<"$TOKEN_FILE") || TOKEN_TIMESTAMP=""
if ! [[ "$TOKEN_TIMESTAMP" =~ ^[0-9]+$ ]]; then
  echo "[FAIL] ERROR: Safety token appears corrupted (expected unix timestamp)." | tee -a "$LOG_FILE"
  exit 1
fi

CURRENT_TIMESTAMP=$(date +%s)
AGE_SECONDS=$((CURRENT_TIMESTAMP - TOKEN_TIMESTAMP))
AGE_HOURS=$((AGE_SECONDS / 3600))

if [ "$AGE_HOURS" -ge "$MAX_SAFETY_AGE_HOURS" ]; then
  echo "[FAIL] ERROR: Safety backup is too old (${AGE_HOURS}h >= ${MAX_SAFETY_AGE_HOURS}h)." | tee -a "$LOG_FILE"
  echo "  Please re-run v3_branch_cleanup_safety.sh to refresh the backup." | tee -a "$LOG_FILE"
  exit 1
fi

echo "[OK] Safety token valid (created ${AGE_HOURS}h ago)." | tee -a "$LOG_FILE"

# Safe-to-delete file check
if [ ! -f "$SAFE_TO_DELETE_FILE" ]; then
  echo "[FAIL] ERROR: $SAFE_TO_DELETE_FILE not found." | tee -a "$LOG_FILE"
  echo "  Run v3_analyze_stale_branches.sh first." | tee -a "$LOG_FILE"
  exit 1
fi

branch_count=$(wc -l < "$SAFE_TO_DELETE_FILE")
echo "Branches to delete: $branch_count" | tee -a "$LOG_FILE"

if [ "$branch_count" -eq 0 ]; then
  echo "No branches to delete. Exiting." | tee -a "$LOG_FILE"
  exit 0
fi

echo "" | tee -a "$LOG_FILE"
echo "Branches marked for deletion:" | tee -a "$LOG_FILE"
# Use input redirection instead of cat | tee (Codacy: avoid UUoC)
tee -a "$LOG_FILE" < "$SAFE_TO_DELETE_FILE"
echo "" | tee -a "$LOG_FILE"

############################################
# 4. Confirmation (LIVE mode)
############################################

if [ "$DRY_RUN" == false ]; then
  echo "WARNING: This will PERMANENTLY DELETE $branch_count branches from remote '$REMOTE'." | tee -a "$LOG_FILE"
  echo "  Recovery is only possible via the git bundle created during the safety step." | tee -a "$LOG_FILE"
  read -p "Type 'yes' to confirm: " confirmation
  if [ "$confirmation" != "yes" ]; then
    echo "Aborted by user." | tee -a "$LOG_FILE"
    exit 0
  fi
fi

############################################
# 5. Execution
############################################

processed_count=0
failed_count=0

echo "" | tee -a "$LOG_FILE"

while IFS= read -r branch; do
  [ -z "$branch" ] && continue

  # Strip remote prefix dynamically
  branch_name="${branch#$REMOTE/}"

  if [ "$DRY_RUN" == true ]; then
    echo "[DRY RUN] Would delete: $REMOTE/$branch_name" | tee -a "$LOG_FILE"
    ((processed_count++))
  else
    echo "Deleting: $REMOTE/$branch_name" | tee -a "$LOG_FILE"
    if git push "$REMOTE" --delete "$branch_name" >> "$LOG_FILE" 2>&1; then
      echo "  [OK] Deleted" | tee -a "$LOG_FILE"
      ((processed_count++))
    else
      echo "  [FAIL] Failed (see log for details)" | tee -a "$LOG_FILE"
      ((failed_count++))
    fi
  fi
done < "$SAFE_TO_DELETE_FILE"

############################################
# 6. Summary & token cleanup
############################################

echo "" | tee -a "$LOG_FILE"
echo "========================================"  | tee -a "$LOG_FILE"
echo "SUMMARY" | tee -a "$LOG_FILE"
echo "========================================"  | tee -a "$LOG_FILE"
echo "  Processed branches: $processed_count" | tee -a "$LOG_FILE"
echo "  Failed deletions:   $failed_count" | tee -a "$LOG_FILE"

if [ "$DRY_RUN" == true ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "Dry run complete. No branches were deleted." | tee -a "$LOG_FILE"
  echo "To execute deletions, run without --dry-run flag." | tee -a "$LOG_FILE"
else
  rm -f "$TOKEN_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "Safety token removed. Cleanup complete." | tee -a "$LOG_FILE"
  echo "Log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
fi
