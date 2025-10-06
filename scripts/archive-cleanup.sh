#!/usr/bin/env bash
#
# archive-cleanup.sh - Automated Phase 1 file cleanup
#
# This script archives obsolete remediation documentation and utility scripts
# that were created during the Node.js compatibility resolution process.
#
# Usage:
#   ./scripts/archive-cleanup.sh          # Execute the archival
#   ./scripts/archive-cleanup.sh --dry-run # Preview what will be moved
#

set -e  # Exit on error

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
DRY_RUN=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Archive directories
ARCHIVE_BASE="$PROJECT_ROOT/docs/archive"
ARCHIVE_REMEDIATION="$ARCHIVE_BASE/remediation"
ARCHIVE_SCRIPTS="$ARCHIVE_BASE/scripts"

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown argument: $arg${NC}"
      echo "Usage: $0 [--dry-run]"
      exit 1
      ;;
  esac
done

# Print header
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Archive Cleanup - Phase 1${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}DRY RUN MODE - No files will be moved${NC}"
  echo ""
fi

# Create archive directories
create_archive_dirs() {
  echo -e "${GREEN}Creating archive directories...${NC}"

  if [ "$DRY_RUN" = false ]; then
    mkdir -p "$ARCHIVE_REMEDIATION"
    mkdir -p "$ARCHIVE_SCRIPTS"
    echo "  Created: $ARCHIVE_REMEDIATION"
    echo "  Created: $ARCHIVE_SCRIPTS"
  else
    echo "  Would create: $ARCHIVE_REMEDIATION"
    echo "  Would create: $ARCHIVE_SCRIPTS"
  fi
  echo ""
}

# Move a file if it exists
move_file() {
  local source="$1"
  local dest_dir="$2"
  local filename=$(basename "$source")

  if [ -f "$source" ]; then
    if [ "$DRY_RUN" = false ]; then
      mv "$source" "$dest_dir/"
      if [ -f "$dest_dir/$filename" ]; then
        echo -e "  ${GREEN}✓${NC} Moved: $filename"
      else
        echo -e "  ${RED}✗${NC} Failed to move: $filename"
        return 1
      fi
    else
      echo -e "  ${YELLOW}→${NC} Would move: $filename"
    fi
  else
    echo -e "  ${YELLOW}⊘${NC} Skipped (not found): $filename"
  fi
}

# Archive remediation documentation
archive_remediation_docs() {
  echo -e "${GREEN}Archiving remediation documentation...${NC}"

  cd "$PROJECT_ROOT"

  move_file "REMEDIATION_EXEC.ps1" "$ARCHIVE_REMEDIATION"
  move_file "REMEDIATION_FALLBACK.md" "$ARCHIVE_REMEDIATION"
  move_file "REMEDIATION_SUMMARY.md" "$ARCHIVE_REMEDIATION"
  move_file "WINDOWS_NPX_WORKAROUND.md" "$ARCHIVE_REMEDIATION"
  move_file "QUICK_START.md" "$ARCHIVE_REMEDIATION"

  echo ""
}

# Archive utility scripts
archive_utility_scripts() {
  echo -e "${GREEN}Archiving utility scripts...${NC}"

  cd "$PROJECT_ROOT/scripts"

  # AI review scripts
  move_file "ai-node-version-review.mjs" "$ARCHIVE_SCRIPTS"
  move_file "ai-remediation-debate.mjs" "$ARCHIVE_SCRIPTS"
  move_file "ai-server-fix-debate.mjs" "$ARCHIVE_SCRIPTS"
  move_file "ai-server-fix-review.mjs" "$ARCHIVE_SCRIPTS"

  # Apply scripts
  move_file "apply-direct-node.mjs" "$ARCHIVE_SCRIPTS"
  move_file "apply-npx-workaround.mjs" "$ARCHIVE_SCRIPTS"
  move_file "apply-sidecar-node.mjs" "$ARCHIVE_SCRIPTS"

  # Detection and recovery
  move_file "detect-recovery-path.sh" "$ARCHIVE_SCRIPTS"

  # Ensure scripts
  move_file "ensure-complete-local.mjs" "$ARCHIVE_SCRIPTS"
  move_file "ensure-local-vite.mjs" "$ARCHIVE_SCRIPTS"
  move_file "ensure-sidecar.mjs" "$ARCHIVE_SCRIPTS"

  # Lockfile management
  move_file "fresh-lockfile.sh" "$ARCHIVE_SCRIPTS"
  move_file "restore-lockfile.sh" "$ARCHIVE_SCRIPTS"
  move_file "verify-lockfile.sh" "$ARCHIVE_SCRIPTS"

  # Miscellaneous
  move_file "revert-to-normal.mjs" "$ARCHIVE_SCRIPTS"
  move_file "sidecar-loader.mjs" "$ARCHIVE_SCRIPTS"
  move_file "link-sidecar-vite.mjs" "$ARCHIVE_SCRIPTS"

  echo ""
}

# Verify archival
verify_archival() {
  if [ "$DRY_RUN" = false ]; then
    echo -e "${GREEN}Verifying archival...${NC}"

    local remediation_count=$(find "$ARCHIVE_REMEDIATION" -type f 2>/dev/null | wc -l)
    local scripts_count=$(find "$ARCHIVE_SCRIPTS" -type f 2>/dev/null | wc -l)

    echo "  Remediation docs archived: $remediation_count files"
    echo "  Utility scripts archived: $scripts_count files"
    echo ""

    if [ $remediation_count -gt 0 ] && [ $scripts_count -gt 0 ]; then
      echo -e "${GREEN}✓ Archival completed successfully${NC}"
    else
      echo -e "${YELLOW}⚠ Warning: Some files may not have been archived${NC}"
    fi
  else
    echo -e "${YELLOW}Skipping verification in dry-run mode${NC}"
  fi
  echo ""
}

# Create README if it doesn't exist
create_readme() {
  local readme_path="$ARCHIVE_BASE/README.md"

  if [ "$DRY_RUN" = false ]; then
    if [ ! -f "$readme_path" ]; then
      echo -e "${GREEN}Creating archive README...${NC}"
      cat > "$readme_path" << 'EOF'
# Archive Directory

This directory contains files that are no longer actively used but preserved for historical reference.

## Contents

### remediation/
Obsolete documentation from the Node.js v20.19.0 compatibility resolution process. These files documented the npx/ESM workarounds that were needed during the transition period but are no longer necessary after the final resolution.

**Files:**
- `REMEDIATION_EXEC.ps1` - PowerShell execution wrapper (Windows-specific)
- `REMEDIATION_FALLBACK.md` - Fallback strategies documentation
- `REMEDIATION_SUMMARY.md` - Comprehensive remediation summary
- `WINDOWS_NPX_WORKAROUND.md` - Windows npx workaround documentation
- `QUICK_START.md` - Quick start guide for workaround setup

**Archived:** 2025-10-05
**Reason:** Node.js engine compatibility fully resolved; workarounds no longer needed

---

### scripts/
Utility scripts created during the remediation process. These were temporary solutions for Node.js compatibility issues and have been superseded by the stable v20.19.0 configuration.

**AI Review Scripts:**
- `ai-node-version-review.mjs` - Automated Node.js version analysis
- `ai-remediation-debate.mjs` - Remediation strategy debate agent
- `ai-server-fix-debate.mjs` - Server fix strategy debate agent
- `ai-server-fix-review.mjs` - Server fix review agent

**Apply Scripts:**
- `apply-direct-node.mjs` - Direct Node.js execution approach
- `apply-npx-workaround.mjs` - npx workaround application
- `apply-sidecar-node.mjs` - Sidecar Node.js approach

**Detection & Recovery:**
- `detect-recovery-path.sh` - Recovery path detection

**Ensure Scripts:**
- `ensure-complete-local.mjs` - Complete local setup
- `ensure-local-vite.mjs` - Local Vite setup
- `ensure-sidecar.mjs` - Sidecar setup

**Lockfile Management:**
- `fresh-lockfile.sh` - Fresh lockfile generation
- `restore-lockfile.sh` - Lockfile restoration
- `verify-lockfile.sh` - Lockfile verification

**Miscellaneous:**
- `revert-to-normal.mjs` - Revert to normal configuration
- `sidecar-loader.mjs` - Sidecar loader utility
- `link-sidecar-vite.mjs` - Sidecar Vite linking

**Archived:** 2025-10-05
**Reason:** Remediation complete; Node.js v20.19.0 stable; scripts obsolete

---

## Why Archive Instead of Delete?

These files represent significant troubleshooting work and may be useful for:
1. **Historical reference** - Understanding the evolution of the build system
2. **Learning resource** - Examples of debugging complex dependency issues
3. **Future troubleshooting** - Similar issues may arise in different contexts
4. **Audit trail** - Documentation of technical decisions and their resolution

## Restoration

If you need to restore any of these files, they can be found in their respective subdirectories. However, note that they were designed for a specific set of conditions that no longer apply.

## Related Documentation

- See `CHANGELOG.md` for the complete timeline of changes
- See `DECISIONS.md` for architectural decisions related to Node.js version selection
- See commit `63fe950` for the final Node.js v20.19.0 alignment
EOF
      echo "  Created: docs/archive/README.md"
    else
      echo -e "${YELLOW}README already exists, skipping...${NC}"
    fi
  else
    echo -e "${YELLOW}Would create: docs/archive/README.md${NC}"
  fi
  echo ""
}

# Main execution
main() {
  create_archive_dirs
  archive_remediation_docs
  archive_utility_scripts
  create_readme
  verify_archival

  echo -e "${BLUE}========================================${NC}"
  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}Dry run complete. Run without --dry-run to execute.${NC}"
  else
    echo -e "${GREEN}Archive cleanup complete!${NC}"
  fi
  echo -e "${BLUE}========================================${NC}"
}

# Run main function
main
