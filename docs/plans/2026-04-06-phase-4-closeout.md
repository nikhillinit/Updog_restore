# Phase 4 Closeout

Date: `2026-04-06` Status: `complete`

## Goal

Close the four non-blocking architect findings from the mounted Phase 4
performance truthfulness slice and reconcile the planning story to shipped
state.

## Findings Closed

1. `calculateCanonicalIrr` is now centralized in `shared/lib/finance/xirr.ts`
   instead of being duplicated across
   `server/services/performance-calculator.ts` and
   `server/services/fund-metrics-calculator.ts`.
2. `server/routes/performance-api.ts` no longer pretends a cache layer exists.
   The handlers now record truthful cache misses and still return
   `meta.cacheHit: false`.
3. Route error logging in `server/routes/performance-api.ts` now uses the
   existing pino logger instead of `console.error`.
4. The dead export affordance was removed from
   `client/src/components/performance/PerformanceDashboard.tsx`, and the
   dashboard tests now assert that the mounted performance flow does not expose
   a fake export action.

## Verification

- `npm run test:unit -- tests/unit/xirr-canonical-helper.test.ts tests/unit/services/performance-calculator.test.ts tests/unit/services/fund-metrics-calculator.test.ts tests/unit/xirr-golden-set.test.ts tests/unit/routes/performance-api-observability.test.ts tests/unit/components/performance/performance-dashboard.test.tsx`
- `npm run test:integration -- tests/integration/performance-api.test.ts`
- `npx playwright test tests/e2e/performance-dashboard.spec.ts --project=performance --no-deps`
- `npm run check`
- `npm run lint:eslint -- shared/lib/finance/xirr.ts server/services/performance-calculator.ts server/services/fund-metrics-calculator.ts server/routes/performance-api.ts client/src/components/performance/PerformanceDashboard.tsx tests/unit/xirr-canonical-helper.test.ts tests/unit/routes/performance-api-observability.test.ts tests/unit/components/performance/performance-dashboard.test.tsx tests/e2e/performance-dashboard.spec.ts tests/e2e/page-objects/PerformancePage.ts`
- `npm run build`

## Planning Reconciliation

The mounted Phase 4 slice is now closed. Local `.omx` artifacts should reflect:

- `prd-phase-4-performance-truthfulness.md` → `COMPLETE`
- `test-spec-phase-4-performance-truthfulness.md` → `COMPLETE`
- `prd-bounded-phase-4-performance-truthfulness.md` → `SUPERSEDED`
- `test-spec-bounded-phase-4-performance-truthfulness.md` → `SUPERSEDED`
- `variance-automation-remaining-risks-plan-draft.md` → archived as stale for
  this lane

## Notes

- This closeout does not widen `/performance` beyond the shipped mounted truth
  contract.
- This closeout does not reopen the dormant time-travel lane.
