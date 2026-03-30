---
status: ACTIVE
last_updated: 2026-03-30
---

# Chart Library Decision

## Executive Summary
**Decision**: Recharts is the live app standard. The remaining Nivo-backed
components have been migrated, and Nivo has been removed from runtime
dependencies.

## Current State

### Runtime Status
- **Recharts**: canonical chart library for app-facing chart components
- **Nivo**: no live runtime imports remain in `client/`, `server/`, or `shared/`
- **Chart.js**: still used by dedicated dashboard/chart.js components and is not
  part of this migration

### Why Recharts Remains
1. Already dominant in the application
2. Native React ergonomics fit the current component model
3. Smaller long-term maintenance surface than a mixed Recharts/Nivo stack

## Completed Cleanup

- [x] Migrate `nivo-performance-chart.tsx` off `@nivo/line`
- [x] Migrate `nivo-moic-scatter.tsx` off `@nivo/scatterplot`
- [x] Remove root `@nivo/*` dependencies
- [x] Collapse runtime chart selection to Recharts-only behavior

## Validation

```bash
rg -n --hidden -e "from '@nivo" -e 'from "@nivo' client server shared packages
npm run build
```

Expected result:
- no `@nivo/*` imports in live code
- successful production build

## Rollback

```bash
git revert <chart-cleanup-commit>
```

## Expected Outcomes
- Smaller dependency surface
- Fewer chart-specific type conflicts
- No ambiguity about which charting library new work should use
