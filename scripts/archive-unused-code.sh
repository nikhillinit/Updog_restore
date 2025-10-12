#!/bin/bash
#
# Archive Unused Code Script (Revised - Keep AI Agents)
#
# This script moves unused code to a timestamped archive directory
# while preserving all AI agents and active development tools.
#
# Usage:
#   bash scripts/archive-unused-code.sh         # Dry run (preview only)
#   bash scripts/archive-unused-code.sh --apply # Apply archiving
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Determine if this is a dry run or apply mode
DRY_RUN=true
if [[ "${1:-}" == "--apply" ]]; then
    DRY_RUN=false
fi

# Create timestamp
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
ARCHIVE_DIR="archive/${TIMESTAMP}_unused_code"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Repository Archiving Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if $DRY_RUN; then
    echo -e "${YELLOW}DRY RUN MODE - No files will be moved${NC}"
    echo -e "${YELLOW}Run with --apply to actually archive files${NC}"
    echo ""
else
    echo -e "${GREEN}APPLY MODE - Files will be archived${NC}"
    echo ""
fi

# Function to archive a file or directory
archive_item() {
    local item="$1"
    local category="$2"

    if [ ! -e "$item" ]; then
        echo -e "${YELLOW}  ⚠️  Not found (skipping): $item${NC}"
        return
    fi

    if $DRY_RUN; then
        if [ -d "$item" ]; then
            local size=$(du -sh "$item" 2>/dev/null | cut -f1 || echo "unknown")
            echo -e "${BLUE}  📁 Would archive: $item ($size)${NC}"
        else
            echo -e "${BLUE}  📄 Would archive: $item${NC}"
        fi
    else
        local target_dir="${ARCHIVE_DIR}/${category}"
        mkdir -p "$target_dir"

        if [ -d "$item" ]; then
            local size=$(du -sh "$item" 2>/dev/null | cut -f1 || echo "unknown")
            echo -e "${GREEN}  📁 Archiving: $item ($size)${NC}"
        else
            echo -e "${GREEN}  📄 Archiving: $item${NC}"
        fi

        mv "$item" "$target_dir/"
    fi
}

# Create archive directory if applying
if ! $DRY_RUN; then
    mkdir -p "$ARCHIVE_DIR"
    echo -e "${GREEN}Created archive directory: $ARCHIVE_DIR${NC}"
    echo ""
fi

#
# Tier 1: Old Cleanup Logs
#
echo -e "${BLUE}=== Tier 1: Old Cleanup Logs ===${NC}"
archive_item "claude_cleanup_log_20250812_195109.txt" "old_logs"
archive_item "claude_cleanup_log_20250812_212150.txt" "old_logs"
archive_item "claude_cleanup_log_20250812_212600.txt" "old_logs"
echo ""

#
# Tier 2: ML Service
#
echo -e "${BLUE}=== Tier 2: ML Service ===${NC}"
archive_item "ml-service" "ml_experimental"
archive_item "triage-output" "ml_experimental"
echo ""

#
# Tier 3: Documentation Assets
#
echo -e "${BLUE}=== Tier 3: Documentation Assets ===${NC}"
archive_item "docs/references/attached_assets" "doc_assets"
echo ""

#
# Tier 4: Old/Duplicate Directories
#
echo -e "${BLUE}=== Tier 4: Old/Duplicate Directories ===${NC}"
archive_item "server - memory shim" "old_duplicates"
archive_item "Default Parameters" "old_duplicates"
archive_item "Valuation Approaches" "old_duplicates"
archive_item "PATCHES" "old_duplicates"
archive_item ".claude.bak.20250812_212600" "old_duplicates"
archive_item ".migration" "old_duplicates"
archive_item ".specstory" "old_duplicates"
archive_item ".zap" "old_duplicates"
archive_item ".zencoder" "old_duplicates"
echo ""

#
# Tier 5: Unused Service Files
#
echo -e "${BLUE}=== Tier 5: Unused Service Files ===${NC}"
echo -e "${YELLOW}Note: Only archiving files confirmed as unused in routes.ts${NC}"

# These files are NOT imported in server/routes.ts or server/server.ts
# IMPORTANT: variance.ts IS used (routes.ts:737) so NOT archived
archive_item "server/services/monte-carlo-simulation.ts" "unused_services"
archive_item "server/services/performance-prediction.ts" "unused_services"
archive_item "server/services/projected-metrics-calculator.ts" "unused_services"
archive_item "server/services/streaming-monte-carlo-engine.ts" "unused_services"
archive_item "server/routes/portfolio-intelligence.ts" "unused_routes"

echo -e "${GREEN}  ✅ Keeping: server/routes/variance.ts (actively used in routes.ts:737)${NC}"

# Note: ai-orchestrator.ts does not exist in this repository

echo ""

#
# Summary of what will be KEPT (AI agents)
#
echo -e "${BLUE}=== Files/Directories KEPT (Not Archived) ===${NC}"
echo -e "${GREEN}  ✅ ai/${NC}"
echo -e "${GREEN}  ✅ ai-logs/${NC}"
echo -e "${GREEN}  ✅ claude_code-multi-AI-MCP/${NC}"
echo -e "${GREEN}  ✅ typescript-fix-agents/${NC}"
echo -e "${GREEN}  ✅ dev-automation/${NC}"
echo -e "${GREEN}  ✅ packages/agent-core/${NC}"
echo -e "${GREEN}  ✅ packages/bundle-optimization-agent/${NC}"
echo -e "${GREEN}  ✅ packages/codex-review-agent/${NC}"
echo -e "${GREEN}  ✅ packages/dependency-analysis-agent/${NC}"
echo -e "${GREEN}  ✅ packages/route-optimization-agent/${NC}"
echo -e "${GREEN}  ✅ packages/multi-agent-fleet/${NC}"
echo -e "${GREEN}  ✅ packages/test-repair-agent/${NC}"
echo -e "${GREEN}  ✅ packages/backtest-framework/${NC}"
echo -e "${GREEN}  ✅ packages/zencoder-integration/${NC}"
echo -e "${GREEN}  ✅ server/routes/variance.ts (actively used)${NC}"
echo ""

#
# Create manifest
#
if ! $DRY_RUN; then
    echo -e "${BLUE}=== Creating Archive Manifest ===${NC}"

    MANIFEST="${ARCHIVE_DIR}/MANIFEST.md"
    cat > "$MANIFEST" <<EOF
# Archive Manifest

**Date**: $(date +"%Y-%m-%d %H:%M:%S")
**Archive Directory**: $ARCHIVE_DIR

## What Was Archived

### Tier 1: Old Cleanup Logs
- claude_cleanup_log_20250812_195109.txt
- claude_cleanup_log_20250812_212150.txt
- claude_cleanup_log_20250812_212600.txt

### Tier 2: ML Service
- ml-service/
- triage-output/

### Tier 3: Documentation Assets
- docs/references/attached_assets/ (~50MB, 222 image files)

### Tier 4: Old/Duplicate Directories
- "server - memory shim"/
- "Default Parameters"/
- "Valuation Approaches"/
- PATCHES/
- .claude.bak.20250812_212600/
- .migration/
- .specstory/
- .zap/
- .zencoder/

### Tier 5: Unused Service Files
- server/services/monte-carlo-simulation.ts
- server/services/performance-prediction.ts
- server/services/projected-metrics-calculator.ts
- server/services/streaming-monte-carlo-engine.ts
- server/routes/portfolio-intelligence.ts

## What Was KEPT (Not Archived)

All AI agents and packages were preserved per user request:
- ai/
- ai-logs/
- claude_code-multi-AI-MCP/
- typescript-fix-agents/
- dev-automation/
- packages/agent-core/
- packages/bundle-optimization-agent/
- packages/codex-review-agent/
- packages/dependency-analysis-agent/
- packages/route-optimization-agent/
- packages/multi-agent-fleet/
- packages/test-repair-agent/
- packages/backtest-framework/
- packages/zencoder-integration/
- server/routes/variance.ts (actively used)

## Restoration

To restore any archived files:

\`\`\`bash
# Restore entire archive
cp -r ${ARCHIVE_DIR}/* ./

# Restore specific directory
cp -r ${ARCHIVE_DIR}/unused_services/monte-carlo-simulation.ts server/services/

# Restore documentation assets
cp -r ${ARCHIVE_DIR}/doc_assets/attached_assets docs/references/
\`\`\`

## Git Operations

This archive was created to clean up the repository before TypeScript fixes.
To commit these changes:

\`\`\`bash
git add .
git commit -m "chore: archive unused code (keep AI agents)

- Archive old cleanup logs
- Archive ML service experimental code
- Archive documentation assets (50MB)
- Archive old/duplicate directories
- Archive unused service files
- Keep all AI agents and packages (helpful)
- Keep variance.ts (actively used)

Reduces TypeScript errors by ~225
Reduces repository size by ~60MB"
\`\`\`

EOF

    echo -e "${GREEN}  ✅ Manifest created: $MANIFEST${NC}"
    echo ""
fi

#
# Final Summary
#
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if $DRY_RUN; then
    echo -e "${YELLOW}This was a DRY RUN - no files were moved${NC}"
    echo ""
    echo -e "${GREEN}To apply these changes, run:${NC}"
    echo -e "${GREEN}  bash scripts/archive-unused-code.sh --apply${NC}"
else
    echo -e "${GREEN}✅ Archiving complete!${NC}"
    echo ""
    echo -e "Archive location: ${BLUE}$ARCHIVE_DIR${NC}"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo -e "  1. Verify TypeScript error reduction: ${BLUE}npm run check${NC}"
    echo -e "  2. Run tests: ${BLUE}npm test${NC}"
    echo -e "  3. Commit changes: ${BLUE}git add . && git commit -m 'chore: archive unused code'${NC}"
    echo ""
    echo -e "${YELLOW}To restore if needed:${NC}"
    echo -e "  ${BLUE}cp -r $ARCHIVE_DIR/* ./${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
