---
name: bundle-size
description: |
  Bundle size analysis, budget enforcement, and regression detection for Vite/Rollup builds.
  This skill should be used when: (1) analyzing bundle composition or total size,
  (2) checking size budgets, (3) comparing PR vs baseline for regressions,
  (4) investigating why bundle size increased, or (5) optimizing bundle size.
  Reads Vite manifest for chunk graph (Tier B). Cannot attribute sizes to specific
  npm packages without stats.json (Tier C unavailable by default).
---

# Bundle Size Analysis

## Quick Reference

| Operation | Command | Output |
|-----------|---------|--------|
| Check budgets | `node scripts/check-budgets.cjs` | Pass/fail per bundle |
| Size report | `node scripts/size-report.mjs` | Top 10 assets by gzip |
| Compare to baseline | `node scripts/compare-bundle-size.js` | Delta + PR comment |
| First load size | `node scripts/size-first-load.mjs` | Initial load bundle size |
| Visual treemap | Open `dist/stats.html` | Interactive module breakdown |

## Capability Tiers

This skill operates at different capability levels depending on available data:

| Tier | Data Required | Available |
|------|---------------|-----------|
| A | `dist/` files only | Always |
| B | + `dist/public/.vite/manifest.json` | After `npm run build` |
| C | + stats.json from Rollup | NOT enabled by default |

See [references/capability-tiers.md](references/capability-tiers.md) for details.

## CRITICAL: Agent Claim Constraints

These rules are NON-NEGOTIABLE. Violating them produces hallucinations.

### Tier A/B (Default - No stats.json)

ALLOWED claims:
- "Total JS is 245KB gzipped"
- "The largest chunk is vendor-abc123.js at 118KB"
- "Initial load includes 3 entry chunks totaling 89KB"
- "Bundle increased 12KB (+5%) from baseline"
- "New file vendor-forms-xyz.js appeared in this build"

FORBIDDEN claims:
- "lodash contributes 40KB to the bundle"
- "Replace moment.js with dayjs to save 30KB"
- "The zod package is responsible for the increase"
- "date-fns accounts for 15% of vendor chunk"

When asked about package attribution:
> "To identify package-level contribution, open dist/stats.html for an interactive
> treemap, or enable Rollup stats output in vite.config.ts for programmatic analysis."

### On Regressions

ALLOWED:
- Report the delta (bytes and percent)
- List new/removed/changed files
- Reference commit diff if available

FORBIDDEN:
- Guess the cause without evidence
- Attribute to specific code changes without seeing the diff
- Claim a package caused the regression

When cause is uncertain:
> "Bundle increased by X KB. To identify the cause, review the commit diff or
> open dist/stats.html to compare module sizes."

## Existing Scripts

### scripts/check-budgets.cjs
Per-bundle budget enforcement. Reads `.size-limit.json` configuration.

```bash
node scripts/check-budgets.cjs
# Exit 0 = pass, Exit 1 = budget exceeded
```

### scripts/size-report.mjs
Reports top 10 largest assets by gzip size.

```bash
node scripts/size-report.mjs
# Outputs table to stdout
```

### scripts/compare-bundle-size.js
Compares current build to baseline artifact. Used in CI.

```bash
node scripts/compare-bundle-size.js --base baseline.json --head current.json
```

### scripts/size-first-load.mjs
Reports the initial load bundle size (entry chunks only).

```bash
node scripts/size-first-load.mjs
# Outputs initial load size
```

## CI Integration

The existing workflow `.github/workflows/bundle-size-check.yml`:
1. Downloads baseline artifact from main branch
2. Builds PR branch
3. Compares sizes
4. Posts PR comment with delta
5. Fails if budget exceeded (unless `approved:perf-budget-change` label applied)

## Troubleshooting

See [references/troubleshooting.md](references/troubleshooting.md) for common issues:
- Manifest not found
- Baseline unavailable
- Budget configuration errors

## Enabling Tier C (Package Attribution)

To unlock package-level attribution, add Rollup stats output:

```typescript
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    visualizer({
      filename: 'dist/stats.json',
      json: true,  // Enable JSON output
    }),
  ],
});
```

WARNING: This increases build time. Only enable if package attribution is regularly needed.
