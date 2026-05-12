# Quarantine Report

Generated: 2026-05-11

## Summary

| Metric                     | Count |
| -------------------------- | ----- |
| Total Quarantined          | 36    |
| Documented                 | 33    |
| Undocumented               | 3     |
| Static describe.skip files | 12    |
| Static skip threshold      | 25    |
| Static skip status         | PASS  |

This report tracks quarantined files, not the total number of skipped assertions
inside those files.

The static skip threshold is defined in `tests/quarantine/policy.json`. The
report generator and `skip-counter.yml` both read that same policy file.

## Documented Quarantines

| File                                                              | Owner                | Reason                                                                                                                                                     | Exit Criteria                                                                                                                  | Age (days) |
| ----------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `tests/ui-conditionals.test.tsx`                                  | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/evergreen-validation.test.ts`                              | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/unit/reallocation-api.test.ts`                             | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/unit/modeling-wizard-persistence.test.tsx`                 | modeling-wizard      | persistDataService not yet implemented (PR#1 pending)                                                                                                      | Merge PR#1 implementing persistDataService with QuotaExceededError and SecurityError handling                                  | 83         |
| `tests/unit/general-info-step.test.tsx`                           | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/perf/validator.microbench.test.ts`                         | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/load/metrics-performance.test.ts`                          | P5.1 tech debt audit | Intentional manual-only stress test; 5-minute sustained load unsuitable for CI                                                                             | Move to tests/manual/ directory or run only in dedicated perf CI job with extended timeout                                     | N/A        |
| `tests/integration/testcontainers-smoke.test.ts`                  | @devops-team         | Requires Docker which is not available in GitHub Actions free tier                                                                                         | Migrate to self-hosted runners with Docker OR GitHub adds Docker support                                                       | 111        |
| `tests/integration/ScenarioMatrixCache.integration.test.ts`       | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/integration/scenarioGeneratorWorker.test.ts`               | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/integration/rls-middleware.test.ts`                        | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/integration/ops-webhook.quarantine.test.ts`                | P5.1 tech debt audit | ESM module reload via require.cache does not work for ES modules; cannot test module-load-time startup validation in Vitest                                | Extract startup validation to an init() function callable from tests, or migrate to a test runner supporting ESM module reload | N/A        |
| `tests/integration/migration-runner.test.ts`                      | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/integration/circuit-breaker-db.test.ts`                    | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/integration/cache-monitoring.integration.test.ts`          | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/integration/approval-guard.test.ts`                        | P5.1 tech debt audit | /api/reserves/calculate endpoints not yet implemented; test body is empty                                                                                  | Implement reserve calculation API endpoints per ADR-017                                                                        | N/A        |
| `tests/chaos/postgres-latency.test.ts`                            | @devops-team         | Requires Toxiproxy infrastructure (docker-compose.toxiproxy.yml)                                                                                           | Add Toxiproxy to CI pipeline or create mock-based alternative                                                                  | 115        |
| `tests/api/portfolio-route.template.test.ts`                      | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/api/deal-pipeline.test.ts`                                 | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/api/allocations.test.ts`                                   | nikhil               | Feature flag disabled - requires ENABLE_PHASE4_TESTS=true and real PostgreSQL                                                                              | Not specified                                                                                                                  | N/A        |
| `tests/unit/truth-cases/capital-allocation.test.ts`               | P5.1 tech debt audit | CA-005 truth case locked per docs/CA-SEMANTIC-LOCK.md Section 6; dynamic_ratio policy cases skipped by engine policy                                       | Unlock CA-005 when dynamic_ratio allocation policy is implemented in the reserve engine                                        | N/A        |
| `tests/unit/services/snapshot-service.test.ts`                    | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/unit/services/performance-prediction.test.ts`              | ml-analytics         | Remaining gaps: (1) seasonality detection needs Fourier/autocorrelation, (2) model accuracy far below threshold                                            | Implement Fourier-based seasonality, tune prediction models to meet accuracy thresholds                                        | 83         |
| `tests/unit/services/lot-service.test.ts`                         | lot-service          | Database UPSERT logic not yet implemented (deferred to Phase 4)                                                                                            | Implement idempotent lot creation with database UPSERT in LotService                                                           | 83         |
| `tests/unit/performance/watch-debounce.test.tsx`                  | @qa-team             | Perf harness currently uses stale sector fixture shape and non-deterministic timing assumptions.                                                           | Update fixtures to current sector schema and recalibrate debounce thresholds with fake timers.                                 | 83         |
| `tests/unit/pages/portfolio-constructor.test.tsx`                 | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/unit/engines/phase2-calibration-output.quarantine.test.ts` | phoenix-team         | Output envelope checks depend on MC fixture unlock (Workstream B)                                                                                          | All output checks pass consistently across 5 consecutive runs                                                                  | 78         |
| `tests/unit/engines/deterministic-reserve-engine.test.ts`         | reserves-engine      | (1) Performance test timing out or exceeding threshold, (2) metadata output structure doesn't match test expectations                                      | Optimize engine perf to meet time limit; align metadata output schema with test assertions                                     | 83         |
| `tests/unit/engines/cohort-engine.test.ts`                        | fund-modeling        | (1) Valuation generation produces unrealistic MOIC/stage distributions, (2) avgMultiple test passes in isolation but fails under full suite (shared state) | Fix generateCompanyValuations() for realistic values; fix test isolation for avgMultiple comparison                            | 83         |
| `tests/unit/database/time-travel-simple.test.ts`                  | @qa-team             | Temporarily skipped pending stabilization triage.                                                                                                          | Remove skip and re-enable once deterministic behavior or required test infrastructure is available.                            | 83         |
| `tests/unit/bug-fixes/phase3-critical-bugs.test.ts`               | bug-fixes            | 3 of 4 integration tests converted to mock-based; backward compat test returns 0 allocations with empty stageStrategies                                    | Fix engine to produce allocations when stageStrategies is empty, or adjust test input                                          | 83         |
| `tests/unit/api/time-travel-api.test.ts`                          | @core-team           | 13 tests require validation middleware or queue integration not mockable in unit context                                                                   | Use createTimelineRouter with conditional validation mock, or move to integration tests                                        | 117        |
| `tests/unit/api/portfolio-intelligence.test.ts`                   | @devops-team         | Test infrastructure does not support rate limiting verification                                                                                            | Mock time control, request isolation, and dedicated Redis instance                                                             | 114        |

## Undocumented Quarantines (Action Required)

These tests use `describe.skip` but lack proper `@quarantine` documentation.

| File                                                          | Reason                                             |
| ------------------------------------------------------------- | -------------------------------------------------- |
| `tests/integration/phase0-migrated-postgres.test.ts`          | Not documented (describe.skip without @quarantine) |
| `tests/integration/lp-reporting-metric-run.test.ts`           | Not documented (describe.skip without @quarantine) |
| `tests/integration/lp-reporting-foundation-migration.test.ts` | Not documented (describe.skip without @quarantine) |

## Review Checklist

- [ ] Review each quarantined test for exit criteria status
- [ ] Update owners if team members have changed
- [ ] Add documentation to undocumented quarantines
- [ ] Remove tests that meet exit criteria

## Protocol Reference

See [PROTOCOL.md](./PROTOCOL.md) for quarantine requirements and review process.
