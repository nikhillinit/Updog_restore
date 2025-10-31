#!/bin/bash
# Document Migration Script (Improved)
# Generated: 2025-10-31
# Purpose: Organize 262 root documents into structured archive

set -e

DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "🔍 DRY RUN MODE - No files will be moved"
fi

# Track moved files
declare -A MOVED_FILES

# Helper function
move_file() {
    local src="$1"
    local dest="$2"

    # Skip if already moved in this run
    if [[ -n "${MOVED_FILES[$src]}" ]]; then
        return
    fi

    # Skip if file doesn't exist
    if [[ ! -f "$src" ]]; then
        return
    fi

    # Mark as moved
    MOVED_FILES[$src]=1

    if $DRY_RUN; then
        echo "📄 $src → $dest"
    else
        mkdir -p "$(dirname "$dest")"
        mv "$src" "$dest"
        echo "✅ $(basename "$src")"
    fi
}

echo "================================================"
echo "Document Migration: Root Cleanup"
echo "================================================"
echo ""

# Count current state
TOTAL_MD=$(ls -1 *.md 2>/dev/null | wc -l)
TOTAL_TXT=$(ls -1 *.txt 2>/dev/null | wc -l)
echo "Current state:"
echo "  📄 $TOTAL_MD markdown files"
echo "  📄 $TOTAL_TXT text files"
echo ""

# PHASE 1: Create archive structure
echo "📁 Creating directory structure..."
mkdir -p archive/2025-q3/{async-hardening,demo-prep,security-hardening,typescript-baseline}
mkdir -p archive/2025-q4/{handoff-memos,stage-normalization,phase-planning,pr-artifacts}
mkdir -p archive/{deployment-planning,status-reports,chat-transcripts}
mkdir -p docs/{releases,validation,integration,ai-optimization,processes,references,components,schemas,forecasting,debugging,wizard,dev}
echo ""

# PHASE 2: Active Documentation (Current Work)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 PHASE 2: Active Documentation → docs/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
move_file "FINAL-HANDOFF-MEMO-2025-10-30.md" "docs/releases/stage-normalization-v3.4.md"
move_file "HANDOFF-Stage-Normalization-v3.4-Option-B-Implementation.md" "docs/releases/stage-norm-v3.4-option-b.md"
move_file "stage-normalization-v3.4-package-REVIEW.md" "docs/releases/stage-norm-v3.4-review.md"
move_file "PHASE4_HANDOFF_MEMO.md" "docs/releases/stage-norm-phase4.md"
move_file "PHASE5_OPTIMIZED_STRATEGY.md" "docs/releases/stage-norm-phase5.md"
move_file "HANDOFF-MEMO-Stage-Validation-v3.md" "docs/validation/stage-validation-v3.md"
move_file "stage-validation.patched.md" "docs/validation/stage-validation-patched.md"
move_file "MEM0_INTEGRATION_SUMMARY.md" "docs/integration/mem0-integration.md"
echo ""

# PHASE 3: Historical Documentation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 PHASE 3: Historical Archives"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Handoff Memos..."
for file in *HANDOFF*.md *SESSION*.md; do
    move_file "$file" "archive/2025-q4/handoff-memos/$file"
done

echo "Demo Prep..."
for file in *DEMO*.md *COMPASS*.md; do
    move_file "$file" "archive/2025-q3/demo-prep/$file"
done
move_file "ENHANCED_DEMO_PLAN.md" "archive/2025-q3/demo-prep/enhanced-demo-plan.md"
move_file "EXECUTIVE_DEMO_WALKTHROUGH.md" "archive/2025-q3/demo-prep/executive-demo-walkthrough.md"
move_file "PRESS_ON_BRANDING_COMPLETE.md" "archive/2025-q3/demo-prep/press-on-branding.md"

echo "Deployment & CI/CD..."
for file in *DEPLOY*.md *BUILD*.md *GATE*.md *CI_*.md; do
    move_file "$file" "archive/deployment-planning/$file"
done
move_file "railway-deploy.md" "archive/deployment-planning/railway-deploy.md"
move_file "ROLLBACK.md" "archive/deployment-planning/rollback.md"
move_file "RUNBOOK.md" "archive/deployment-planning/runbook-old.md"
move_file "setup.md" "archive/deployment-planning/setup-old.md"
move_file "BOOTSTRAP_QUICK_START.md" "archive/deployment-planning/bootstrap-quickstart.md"
move_file "VERCEL_SETUP.md" "docs/deployment/vercel-setup.md"

echo "Status Reports..."
for file in *STATUS*.md *PROGRESS*.md *COMPLETE*.md *SUMMARY*.md *REPORT*.md *EVALUATION*.md *FIXES*.md *VALIDATION*.md; do
    move_file "$file" "archive/status-reports/$file"
done

echo "Phase Planning..."
for file in *PHASE*.md *PLAN*.md *STRATEGY*.md *EXECUTION*.md *ROADMAP*.md; do
    move_file "$file" "archive/2025-q4/phase-planning/$file"
done
move_file "3_DAY_SURGICAL_PLAN.md" "archive/2025-q4/phase-planning/3-day-surgical-plan.md"
move_file "FEATURE_ROADMAP.md" "archive/2025-q4/phase-planning/feature-roadmap.md"
move_file "PRUNING_PLAN.md" "archive/2025-q4/phase-planning/pruning-plan.md"
move_file "spring-G2C-backlogj.md" "archive/2025-q4/phase-planning/spring-g2c-backlog.md"
move_file "WEEK_1_ACTION_PLAN.md" "archive/2025-q4/phase-planning/week1-action-plan.md"
move_file "FUND_MANAGEMENT_INTEGRATION_AUDIT.md" "archive/2025-q4/phase-planning/fund-mgmt-audit.md"

echo "Security & Hardening..."
for file in *SECURITY_*.md *CODACY*.md *HARDENING*.md; do
    move_file "$file" "archive/2025-q3/security-hardening/$file"
done

echo "Async Work..."
for file in ASYNC_*.md; do
    move_file "$file" "archive/2025-q3/async-hardening/$file"
done

echo "PR Artifacts..."
for file in PR_*.md; do
    move_file "$file" "archive/2025-q4/pr-artifacts/$file"
done

echo "Chat Transcripts..."
for file in claude_chat_history_*.md chat_*.md *.agents*.md; do
    move_file "$file" "archive/chat-transcripts/$file"
done

echo ""

# PHASE 4: Active Tool Documentation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 PHASE 4: AI/Agent Documentation → docs/ai-optimization/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for file in *AGENT*.md *AI_*.md *BACKTEST*.md *MCP_*.md *CODEX*.md; do
    move_file "$file" "docs/ai-optimization/$file"
done
move_file "AGENTS.md" "docs/ai-optimization/agents-overview.md"
echo ""

# PHASE 5: Component Documentation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📚 PHASE 5: Component/Process Docs → docs/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
move_file "RESERVE_ENGINE_ARCHITECTURE.md" "docs/components/reserve-engine-architecture.md"
move_file "RESERVE_ENGINE_SPEC.md" "docs/components/reserve-engine-spec.md"
move_file "RESERVE_ENGINE_DELIVERY.md" "docs/components/reserve-engine-delivery.md"
move_file "RESERVE_ADAPTER_INTEGRATION.md" "docs/components/reserve-adapter-integration.md"
move_file "REALLOCATION_TAB_IMPLEMENTATION.md" "docs/components/reallocation-tab-implementation.md"
move_file "WORKER_IMPLEMENTATION.md" "docs/components/worker-implementation.md"
move_file "CODE_REVIEW_CHECKLIST.md" "docs/processes/code-review-checklist.md"
move_file "CAPITAL_ALLOCATION_FOLLOW_ON_TABLE.md" "docs/references/capital-allocation-follow-on.md"
move_file "Seed Cases for CA-007 - CA-020.md" "docs/references/seed-cases-ca-007-020.md"
move_file "SELECTOR_CONTRACT_README.md" "docs/contracts/selector-contract-readme.md"
move_file "SCHEMA_HELPERS_INTEGRATION.md" "docs/schemas/schema-helpers-integration.md"
move_file "SCHEMA_MAPPING.md" "docs/schemas/schema-mapping.md"
move_file "POWER_LAW_IMPLEMENTATION.md" "docs/forecasting/power-law-implementation.md"
move_file "STREAMING_MONTE_CARLO_MIGRATION.md" "docs/forecasting/streaming-monte-carlo-migration.md"
move_file "PROFILING_PLAYBOOK.md" "docs/debugging/profiling-playbook.md"
move_file "MODELING_WIZARD_DESIGN.md" "docs/wizard/modeling-wizard-design.md"
move_file "WIZARD_MIGRATION_EXECUTION_STRATEGY.md" "docs/wizard/migration-execution-strategy.md"
move_file "NOTION_INTEGRATION_PLAN.md" "docs/integration/notion-integration-plan.md"
move_file "UPSTASH_SETUP.md" "docs/integration/upstash-setup.md"
move_file "WSL2_QUICK_START.md" "docs/dev/wsl2-quickstart.md"
move_file "DASHBOARD_MIGRATION_EXAMPLE.md" "archive/2025-q3/dashboard-migration-example.md"
move_file "DEV_DASHBOARD_README.md" "archive/2025-q3/dev-dashboard-readme.md"
echo ""

# PHASE 6: Text Files
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 PHASE 6: Text Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "TypeScript baselines & errors..."
for file in typescript-*.txt ts7006_errors.txt baseline-*.txt server-ts-errors.txt error-hotspots.txt violations-before.txt; do
    if [[ "$file" != ".tsc-baseline."* && -f "$file" ]]; then
        move_file "$file" "archive/2025-q3/typescript-baseline/$file"
    fi
done

echo "Cleanup logs..."
for file in claude_cleanup_log_*.txt vitest-fix-changelog.txt; do
    move_file "$file" "archive/chat-transcripts/$file"
done

echo "Stage normalization artifacts..."
for file in "Stage Normalization"*.txt "# Stage Normalization"*.txt; do
    move_file "$file" "archive/2025-q4/stage-normalization/$file"
done
for file in "Proposed Next Steps"*.txt "Proposed Next Steps"*.md; do
    move_file "$file" "archive/2025-q4/phase-planning/$(echo "$file" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')"
done

echo "Miscellaneous text artifacts..."
move_file "# Phase 7 Production Rollout Strate.txt" "archive/2025-q4/stage-normalization/phase7-rollout.txt"
move_file "Below is a stand‑alone, end‑to‑end.txt" "archive/2025-q4/stage-normalization/standalone-guide.txt"
move_file "DB migration Comments.txt" "archive/2025-q4/stage-normalization/db-migration-comments.txt"
move_file "Hybrid Parallel Execution completed.txt" "archive/2025-q4/stage-normalization/hybrid-parallel-execution.txt"
move_file "Multi-Agentic Rebuild Strategy Comp.txt" "archive/2025-q4/phase-planning/multi-agentic-rebuild.txt"
move_file "Observability_API Runbook.txt" "docs/runbooks/observability-api.txt"
move_file "Phase_5 _oc.txt" "archive/2025-q4/phase-planning/phase5-oc.txt"
move_file "Response_to_Implementation.txt" "archive/2025-q4/stage-normalization/response-to-impl-v1.txt"
move_file "Response_to_Implementationv2.txt" "archive/2025-q4/stage-normalization/response-to-impl-v2.txt"
echo ""

# PHASE 7: Folders
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 PHASE 7: Folders"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ -d "stage-normalization-v3.4-package" ]]; then
    if $DRY_RUN; then
        echo "📄 stage-normalization-v3.4-package/ → archive/2025-q4/stage-normalization/"
    else
        mv "stage-normalization-v3.4-package" "archive/2025-q4/stage-normalization/"
        echo "✅ stage-normalization-v3.4-package/"
    fi
fi
echo ""

# Summary
echo "================================================"
echo "Migration Summary"
echo "================================================"
MOVED_COUNT=${#MOVED_FILES[@]}
echo "📊 Files processed: $MOVED_COUNT"

if $DRY_RUN; then
    echo ""
    echo "✅ Dry run complete - no files were moved"
    echo ""
    echo "Remaining in root:"
    ls -1 *.md 2>/dev/null | head -20 || true
    echo ""
    echo "To execute: bash scripts/migrate-docs-improved.sh"
else
    echo ""
    echo "✅ Migration complete!"
    echo ""
    echo "Next steps:"
    echo "  git status"
    echo "  git add ."
    echo "  git commit -m 'docs: reorganize root directory'"
fi
echo "================================================"
