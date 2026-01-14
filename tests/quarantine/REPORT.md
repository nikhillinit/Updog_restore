# Quarantine Report

> Auto-generated on 2026-01-14 - DO NOT EDIT MANUALLY
> Run `npm run quarantine:report` to regenerate

## Summary

| Metric | Count |
|--------|-------|
| Total files with skips | 59 |
| Total skipped tests | 123 |
| Documented (@quarantine) | 5 |
| Undocumented | 54 |

## By Reason Category

| Category | Files |
|----------|-------|
| undocumented | 54 |
| feature-flag | 3 |
| other | 2 |

## By Owner

| Owner | Files |
|-------|-------|
| unassigned | 54 |
| nikhil | 5 |

## Detailed File List

| File | Skips | Documented | Reason | Owner | Exit Criteria |
|------|-------|------------|--------|-------|---------------|
| tests\unit\engines\monte-carlo-orchestrator.test.ts | 13 | Yes | Stochastic mode tests require Monte Carlo engine completion (Phase 2) | nikhil | Complete Phase 2 Monte Carlo implementation, enable stochastic tests |
| tests\unit\api\time-travel-api.test.ts | 13 | Yes | Middleware dependencies - validation and queue provider not mockable in unit tests | nikhil | Refactor to use dependency injection or move to integration tests |
| tests\e2e\performance.spec.ts | 8 | No | - | - | - |
| tests\e2e\accessibility.spec.ts | 7 | No | - | - | - |
| tests\unit\components\ai-enhanced-components.test.tsx | 6 | No | - | - | - |
| tests\unit\modeling-wizard-persistence.test.tsx | 4 | No | - | - | - |
| tests\unit\services\performance-prediction.test.ts | 4 | No | - | - | - |
| tests\unit\performance\watch-debounce.test.tsx | 4 | No | - | - | - |
| tests\unit\bug-fixes\phase3-critical-bugs.test.ts | 4 | No | - | - | - |
| tests\smoke\production.spec.ts | 3 | No | - | - | - |
| tests\e2e\navigation-and-routing.spec.ts | 3 | No | - | - | - |
| tests\ui-conditionals.test.tsx | 2 | No | - | - | - |
| tests\unit\xirr-golden-set.test.ts | 2 | No | - | - | - |
| tests\unit\analytics-xirr.test.ts | 2 | No | - | - | - |
| tests\integration\ops-webhook.test.ts | 2 | No | - | - | - |
| tests\e2e\user-authentication.spec.ts | 2 | No | - | - | - |
| tests\e2e\basic-smoke.spec.ts | 2 | No | - | - | - |
| tests\unit\services\monte-carlo-engine.test.ts | 2 | No | - | - | - |
| tests\unit\engines\deterministic-reserve-engine.test.ts | 2 | No | - | - | - |
| tests\unit\engines\cohort-engine.test.ts | 2 | No | - | - | - |
| tests\fund-strategy-validation.test.ts | 1 | No | - | - | - |
| tests\fund-schema-updates.test.ts | 1 | No | - | - | - |
| tests\fund-basics-evergreen.test.tsx | 1 | No | - | - | - |
| tests\evergreen-validation.test.ts | 1 | No | - | - | - |
| tests\unit\monte-carlo-2025-validation-core.test.ts | 1 | No | - | - | - |
| tests\unit\general-info-step.test.tsx | 1 | No | - | - | - |
| tests\smoke\wizard.spec.ts | 1 | No | - | - | - |
| tests\quarantine\fund-setup.smoke.quarantine.test.tsx | 1 | No | - | - | - |
| tests\perf\validator.microbench.test.ts | 1 | No | - | - | - |
| tests\middleware\idempotency-dedupe.test.ts | 1 | No | - | - | - |
| tests\load\metrics-performance.test.ts | 1 | No | - | - | - |
| tests\integration\testcontainers-smoke.test.ts | 1 | No | - | - | - |
| tests\integration\rls-middleware.test.ts | 1 | No | - | - | - |
| tests\integration\reserves-integration.test.ts | 1 | No | - | - | - |
| tests\integration\interleaved-thinking.test.ts | 1 | No | - | - | - |
| tests\integration\dev-memory-mode.test.ts | 1 | No | - | - | - |
| tests\integration\circuit-breaker-db.test.ts | 1 | No | - | - | - |
| tests\integration\approval-guard.test.ts | 1 | No | - | - | - |
| tests\e2e\portfolio-management.spec.ts | 1 | No | - | - | - |
| tests\e2e\performance-dashboard.spec.ts | 1 | No | - | - | - |
| tests\e2e\lp-dashboard.spec.ts | 1 | No | - | - | - |
| tests\e2e\dashboard-functionality.spec.ts | 1 | No | - | - | - |
| tests\e2e\basic-navigation.spec.ts | 1 | No | - | - | - |
| tests\chaos\postgres-latency.test.ts | 1 | No | - | - | - |
| tests\api\portfolio-route.template.test.ts | 1 | No | - | - | - |
| tests\unit\truth-cases\capital-allocation.test.ts | 1 | No | - | - | - |
| tests\unit\services\snapshot-service.test.ts | 1 | No | - | - | - |
| tests\unit\services\monte-carlo-power-law-validation.test.ts | 1 | No | - | - | - |
| tests\unit\services\monte-carlo-power-law-integration.test.ts | 1 | No | - | - | - |
| tests\unit\services\lot-service.test.ts | 1 | No | - | - | - |
| tests\unit\pages\portfolio-constructor.test.tsx | 1 | No | - | - | - |
| tests\unit\database\time-travel-simple.test.ts | 1 | No | - | - | - |
| tests\unit\api\portfolio-intelligence.test.ts | 1 | No | - | - | - |
| tests\integration\__tests__\vite-build-regression.test.ts | 1 | No | - | - | - |
| tests\integration\__tests__\golden-dataset-regression.test.ts | 1 | No | - | - | - |
| client\src\core\capitalAllocation\__tests__\truthCaseRunner.test.ts | 1 | No | - | - | - |
| tests\integration\scenario-comparison.test.ts | 0 | Yes | Feature flag disabled - requires ENABLE_SCENARIO_COMPARISON=true and database migration | nikhil | Run npm run db:push after product approval, set ENABLE_SCENARIO_COMPARISON=true |
| tests\integration\backtesting-api.test.ts | 0 | Yes | Feature flag disabled - requires ENABLE_BACKTESTING_TESTS=true | nikhil | Enable feature flag after backtesting feature is production-ready |
| tests\api\allocations.test.ts | 0 | Yes | Feature flag disabled - requires ENABLE_PHASE4_TESTS=true and real PostgreSQL | nikhil | Enable feature flag in CI, convert to database mocks, or move to E2E suite |

## How to Document a Quarantined Test

Add a JSDoc comment above the skipped test:

```typescript
/**
 * @quarantine
 * @reason Routes not implemented
 * @owner @username
 * @exit Implement POST /api/endpoint
 * @date 2026-01-14
 */
describe.skip('Feature Name', () => {
  // tests...
});
```

## How to Un-Quarantine

1. Fix the underlying issue (implement route, fix flakiness, etc.)
2. Remove the `.skip` from the test
3. Remove the `@quarantine` JSDoc block
4. Run `npm run quarantine:report` to update this report
5. Commit changes
