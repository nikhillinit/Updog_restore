#!/bin/bash
# v3_branch_cleanup_safety.sh - v3.2.1
# Creates backups and a safety token for the cleanup script
# Version: 3.2.1 (Updog_restore adapted - emoji-free)

set -euo pipefail

############################################
# 1. Configuration
############################################

# Repository root (default: current directory)
REPO_DIR="${REPO_DIR:-$(pwd)}"

# Report directory (where analyze script wrote its files)
DEFAULT_OUTPUT_DIR="$REPO_DIR/branch_cleanup_reports"
INPUT_DIR="${INPUT_DIR:-$DEFAULT_OUTPUT_DIR}"

# Backup root directory
BACKUP_ROOT="${BACKUP_ROOT:-$REPO_DIR/backups}"

# Git configuration
REMOTE="${REMOTE:-origin}"
MAIN_BRANCH="${MAIN_BRANCH:-$REMOTE/main}"

# Files
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/backup_$TIMESTAMP"
REQUIRES_REVIEW="$INPUT_DIR/requires_review.txt"
TOKEN_FILE="$REPO_DIR/.branch_cleanup_safety_token"

############################################
# 2. Pre-flight checks
############################################

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "ERROR: REPO_DIR '$REPO_DIR' is not a git repository."
  exit 1
fi

cd "$REPO_DIR"

# MAIN_BRANCH sanity check
if ! git rev-parse --verify "$MAIN_BRANCH" >/dev/null 2>&1; then
  echo "ERROR: MAIN_BRANCH '$MAIN_BRANCH' does not exist."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "=== Branch Cleanup Safety Backup v3.2.1 ==="
echo "Repository: $REPO_DIR"
echo "Remote:     $REMOTE"
echo "Main:       $MAIN_BRANCH"
echo "Backup Dir: $BACKUP_DIR"
echo "Date:       $(date)"
echo ""

############################################
# 3. Full repository bundle
############################################

echo "Step 1: Creating full repository bundle..."
git bundle create "$BACKUP_DIR/full_repo_backup.bundle" --all
echo "[OK] Bundle created."

############################################
# 4. Export refs
############################################

echo "Step 2: Exporting all refs..."
git show-ref > "$BACKUP_DIR/all_refs.txt"
echo "[OK] Refs exported."

############################################
# 5. Patches for unmerged branches
############################################

echo "Step 3: Generating patches for 'Requires Review' branches..."
if [ -f "$REQUIRES_REVIEW" ]; then
    mkdir -p "$BACKUP_DIR/patches"
    patch_count=0
    while IFS= read -r line; do
        # Extract branch name, removing "(ahead: X, behind: Y)" suffix
        branch=$(echo "$line" | sed 's/ (ahead:.*//')
        [ -z "$branch" ] && continue

        # Create safe filename by stripping remote and replacing slashes
        patch_name=$(echo "$branch" | sed "s#^$REMOTE/##" | sed 's#/#_#g')

        echo "  Creating patch for: $branch"
        if git format-patch "$MAIN_BRANCH..$branch" --stdout \
          > "$BACKUP_DIR/patches/${patch_name}.patch" 2>/dev/null; then
            if [ -s "$BACKUP_DIR/patches/${patch_name}.patch" ]; then
                ((patch_count++))
            else
                echo "    (no unique commits)"
                rm -f "$BACKUP_DIR/patches/${patch_name}.patch"
            fi
        else
            echo "    (no unique commits or error)"
        fi
    done < "$REQUIRES_REVIEW"
    echo "[OK] Generated $patch_count patches."
else
    echo "WARNING: No requires_review.txt found (or file empty). Skipping patches."
fi

############################################
# 6. Verify bundle integrity
############################################

echo "Step 4: Verifying bundle..."
if git bundle verify "$BACKUP_DIR/full_repo_backup.bundle" > /dev/null 2>&1; then
  echo "[OK] Bundle verification passed."
else
  echo "[FAIL] Bundle verification FAILED. See bundle verification output."
  exit 1
fi

############################################
# 7. Write safety token
############################################

echo "Step 5: Writing safety token..."
date +%s > "$TOKEN_FILE"
echo "[OK] Safety token written to: $TOKEN_FILE"

############################################
# 8. Summary
############################################

echo ""
echo "========================================"
echo "BACKUP COMPLETE"
echo "========================================"
echo "Backup directory: $BACKUP_DIR"
echo ""
echo "Contents:"
ls -lh "$BACKUP_DIR"
if [ -d "$BACKUP_DIR/patches" ]; then
    echo ""
    echo "Patches:"
    ls -1 "$BACKUP_DIR/patches" 2>/dev/null || echo "  (none)"
fi
echo ""
echo "Recovery options:"
echo "  - Full restore: git clone $BACKUP_DIR/full_repo_backup.bundle"
echo "  - Ref lookup: cat $BACKUP_DIR/all_refs.txt"
echo "  - Apply patch: git am < $BACKUP_DIR/patches/<name>.patch"
echo ""
echo "You are now safe to run v3_branch_cleanup_automation.sh within the next few hours."
