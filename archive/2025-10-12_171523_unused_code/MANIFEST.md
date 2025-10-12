# Archive Manifest

**Date**: 2025-10-12 17:15:28
**Archive Directory**: archive/2025-10-12_171523_unused_code

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

```bash
# Restore entire archive
cp -r archive/2025-10-12_171523_unused_code/* ./

# Restore specific directory
cp -r archive/2025-10-12_171523_unused_code/unused_services/monte-carlo-simulation.ts server/services/

# Restore documentation assets
cp -r archive/2025-10-12_171523_unused_code/doc_assets/attached_assets docs/references/
```

## Git Operations

This archive was created to clean up the repository before TypeScript fixes.
To commit these changes:

```bash
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
```

