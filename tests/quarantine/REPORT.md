# Quarantine Report

Generated: 2026-02-18

## Summary

| Metric                  | Count |
| ----------------------- | ----- |
| Total skip sites        | 68    |
| Total skipped tests     | 495   |
| Files with @quarantine  | 42    |
| Undocumented skip files | 0     |

NOTE: "Total skipped tests" counts individual `it()` / `test()` calls inside
skipped `describe.skip` blocks plus individual `it.skip` calls. Env-gated files
(describeMaybe pattern) skip their entire suite when the required env var is
unset, which is the default in local and CI environments.

## By Category

| Category             | Files | Skipped Tests |
| -------------------- | ----- | ------------- |
| env-gated            | 6     | 113           |
| partial              | 7     | 34            |
| tdd-red              | 2     | 3             |
| keep-quarantined     | 1     | 2             |
| stabilization-triage | 23    | 348           |

## Documented Quarantines (tests/unit/)

| File                                                            | Owner           | Reason                                                                                            | Exit Criteria                                                                                      | Skipped |
| --------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| `tests/unit/api/time-travel-api.test.ts`                        | @core-team      | 13 tests require validation middleware or queue integration not mockable in unit context          | Use createTimelineRouter with conditional validation mock, or move to integration tests            | 13      |
| `tests/unit/api/portfolio-intelligence.test.ts`                 | @devops-team    | Test infrastructure does not support rate limiting verification                                   | Mock time control, request isolation, and dedicated Redis instance                                 | 1       |
| `tests/unit/bug-fixes/phase3-critical-bugs.test.ts`             | bug-fixes       | Backward compat test returns 0 allocations with empty stageStrategies (partial -- 1 of 21)        | Fix engine to produce allocations when stageStrategies is empty, or adjust test input              | 1       |
| `tests/unit/database/time-travel-simple.test.ts`                | @qa-team        | Temporarily skipped pending stabilization triage                                                  | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 12      |
| `tests/unit/engines/cohort-engine.test.ts`                      | fund-modeling   | Valuation generation unrealistic; avgMultiple fails under full suite (partial -- 2 of 37)         | Fix generateCompanyValuations() for realistic values; fix test isolation for avgMultiple           | 2       |
| `tests/unit/engines/deterministic-reserve-engine.test.ts`       | reserves-engine | Performance timeout; metadata output mismatch (partial -- 2 skipped)                              | Optimize engine perf; align metadata output schema with assertions                                 | 2       |
| `tests/unit/engines/monte-carlo-orchestrator.test.ts`           | @phoenix-team   | Stochastic mode assertions depend on baseline DB fixtures unavailable in unit tests               | Add deterministic baseline fixture strategy or seeded integration DB                               | 13      |
| `tests/unit/general-info-step.test.tsx`                         | @qa-team        | Temporarily skipped pending stabilization triage                                                  | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 5       |
| `tests/unit/modeling-wizard-persistence.test.tsx`               | modeling-wizard | persistDataService not yet implemented (tdd-red -- 2 skipped)                                     | Merge PR#1 implementing persistDataService with QuotaExceededError and SecurityError handling      | 2       |
| `tests/unit/monte-carlo-2025-validation-core.test.ts`           | @qa-team        | Temporarily skipped pending stabilization triage                                                  | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 14      |
| `tests/unit/pages/portfolio-constructor.test.tsx`               | @qa-team        | Temporarily skipped pending stabilization triage                                                  | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 44      |
| `tests/unit/performance/watch-debounce.test.tsx`                | @qa-team        | Stale sector fixture shape and non-deterministic timing assumptions                               | Update fixtures to current sector schema and recalibrate debounce thresholds with fake timers      | 9       |
| `tests/unit/reallocation-api.test.ts`                           | @qa-team        | Temporarily skipped pending stabilization triage                                                  | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 14      |
| `tests/unit/services/lot-service.test.ts`                       | lot-service     | Database UPSERT logic not yet implemented (tdd-red -- 1 skipped)                                  | Implement idempotent lot creation with database UPSERT in LotService                               | 1       |
| `tests/unit/services/monte-carlo-engine.test.ts`                | monte-carlo     | Config validation not implemented; reserve optimization needs integration env (partial -- 2)      | Implement config parameter validation; add integration test env for reserve optimization           | 2       |
| `tests/unit/services/monte-carlo-power-law-integration.test.ts` | @qa-team        | Temporarily skipped pending stabilization triage                                                  | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 14      |
| `tests/unit/services/monte-carlo-power-law-validation.test.ts`  | @qa-team        | Temporarily skipped pending stabilization triage                                                  | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 13      |
| `tests/unit/services/performance-prediction.test.ts`            | ml-analytics    | Seasonality needs Fourier/autocorrelation; model accuracy below threshold (keep-quarantined -- 2) | Implement Fourier-based seasonality; tune prediction models to meet accuracy thresholds            | 2       |
| `tests/unit/services/snapshot-service.test.ts`                  | @qa-team        | Temporarily skipped pending stabilization triage                                                  | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 19      |

## Documented Quarantines (outside tests/unit/)

| File                                                        | Owner        | Reason                                                                                   | Exit Criteria                                                                                      | Skipped |
| ----------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| `tests/api/allocations.test.ts`                             | nikhil       | Feature flag disabled -- requires ENABLE_PHASE4_TESTS=true and real PostgreSQL           | Enable feature flag in CI, convert to database mocks, or move to E2E suite                         | 30      |
| `tests/api/deal-pipeline.test.ts`                           | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 16      |
| `tests/api/portfolio-route.template.test.ts`                | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 29      |
| `tests/chaos/postgres-latency.test.ts`                      | @devops-team | Requires Toxiproxy infrastructure (docker-compose.toxiproxy.yml)                         | Add Toxiproxy to CI pipeline or create mock-based alternative                                      | 9       |
| `tests/evergreen-validation.test.ts`                        | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 12      |
| `tests/fund-basics-evergreen.test.tsx`                      | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 12      |
| `tests/integration/ScenarioMatrixCache.integration.test.ts` | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 18      |
| `tests/integration/backtesting-api.test.ts`                 | nikhil       | Feature flag disabled -- requires ENABLE_BACKTESTING_TESTS=true                          | Enable feature flag after backtesting feature is production-ready                                  | 28      |
| `tests/integration/cache-monitoring.integration.test.ts`    | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 19      |
| `tests/integration/circuit-breaker-db.test.ts`              | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 13      |
| `tests/integration/migration-runner.test.ts`                | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 6       |
| `tests/integration/rls-middleware.test.ts`                  | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 12      |
| `tests/integration/scenario-comparison-mvp.test.ts`         | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 11      |
| `tests/integration/scenario-comparison.test.ts`             | nikhil       | Feature flag disabled -- requires ENABLE_SCENARIO_COMPARISON=true and database migration | Run npm run db:push after product approval, set ENABLE_SCENARIO_COMPARISON=true                    | 29      |
| `tests/integration/scenarioGeneratorWorker.test.ts`         | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 9       |
| `tests/integration/testcontainers-smoke.test.ts`            | @devops-team | Requires Docker which is not available in GitHub Actions free tier                       | Migrate to self-hosted runners with Docker OR GitHub adds Docker support                           | 7       |
| `tests/perf/validator.microbench.test.ts`                   | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 3       |
| `tests/quarantine/fund-setup.smoke.quarantine.test.tsx`     | --           | DELETED 2026-02-18: Superseded by tests/e2e/fund-setup.spec.ts                           | N/A                                                                                                | 0       |
| `tests/integration/ops-webhook.quarantine.test.ts`          | P5.1 audit   | ESM module reload via require.cache does not work for ES modules (INFRA)                 | Extract startup validation to init() function or migrate to ESM-reload-capable runner              | 2       |
| `tests/integration/approval-guard.test.ts`                  | P5.1 audit   | /api/reserves/calculate endpoints not yet implemented (STUB)                             | Implement reserve calculation API endpoints per ADR-017                                            | 1       |
| `tests/load/metrics-performance.test.ts`                    | P5.1 audit   | Manual-only stress test; 5-min sustained load unsuitable for CI (INFRA)                  | Move to tests/manual/ or dedicated perf CI job with extended timeout                               | 1       |
| `tests/unit/truth-cases/capital-allocation.test.ts`         | P5.1 audit   | CA-005 locked per CA-SEMANTIC-LOCK.md Section 6; dynamic_ratio skipped by policy (STALE) | Unlock CA-005 when dynamic_ratio allocation policy is implemented                                  | dynamic |
| `tests/smoke/wizard.spec.ts`                                | @qa-team     | Requires running application at BASE_URL for synthetic monitoring                        | Run manually with npm run test:smoke against deployed environment                                  | 10      |
| `tests/ui-conditionals.test.tsx`                            | @qa-team     | Temporarily skipped pending stabilization triage                                         | Remove skip and re-enable once deterministic behavior or required test infrastructure is available | 10      |

## Undocumented

All previously undocumented skip files now have @quarantine tags (P5.1 audit,
2026-02-18).

No undocumented skip files remain.

## Changes (2026-02-18, P5.1 Quarantine Hygiene)

- ADDED @quarantine tags to 4 files: ops-webhook.quarantine.test.ts (INFRA),
  approval-guard.test.ts (STUB), metrics-performance.test.ts (INFRA),
  capital-allocation.test.ts (STALE)
- DELETED tests/quarantine/fund-setup.smoke.quarantine.test.tsx -- superseded by
  tests/e2e/fund-setup.spec.ts (describe block explicitly stated replacement)
- Moved all 4 files from Undocumented to Documented tables above

## Review Checklist

- [x] Add @quarantine tags to the 4 undocumented skip files (done 2026-02-18)
- [x] Remove tests that meet exit criteria (fund-setup.smoke deleted 2026-02-18)
- [ ] Review each quarantined test for exit criteria status
- [ ] Update owners if team members have changed

## Protocol Reference

See [PROTOCOL.md](./PROTOCOL.md) for quarantine requirements and review process.
