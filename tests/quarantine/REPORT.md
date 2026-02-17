# Quarantine Report

Generated: 2026-02-17

## Summary

| Metric            | Count |
| ----------------- | ----- |
| Total Quarantined | 35    |
| Documented        | 35    |
| Undocumented      | 0     |

## Documented Quarantines

| File                                                            | Owner         | Reason                                                                                           | Exit Criteria                                                                                       | Age (days) |
| --------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------- |
| `tests\ui-conditionals.test.tsx`                                | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\fund-strategy-validation.test.ts`                        | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\fund-schema-updates.test.ts`                             | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\fund-basics-evergreen.test.tsx`                          | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\evergreen-validation.test.ts`                            | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\unit\reallocation-api.test.ts`                           | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\unit\monte-carlo-2025-validation-core.test.ts`           | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\unit\general-info-step.test.tsx`                         | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\perf\validator.microbench.test.ts`                       | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\quarantine\fund-setup.smoke.quarantine.test.tsx`         | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\integration\testcontainers-smoke.test.ts`                | @devops-team  | Requires Docker which is not available in GitHub Actions free tier                               | Migrate to self-hosted runners with Docker OR GitHub adds Docker support                            | 28         |
| `tests\integration\ScenarioMatrixCache.integration.test.ts`     | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\integration\scenarioGeneratorWorker.test.ts`             | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\integration\scenario-comparison.test.ts`                 | nikhil        | Feature flag disabled - requires ENABLE_SCENARIO_COMPARISON=true and database migration          | Not specified                                                                                       | N/A        |
| `tests\integration\scenario-comparison-mvp.test.ts`             | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\integration\rls-middleware.test.ts`                      | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\integration\migration-runner.test.ts`                    | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\integration\circuit-breaker-db.test.ts`                  | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\integration\cache-monitoring.integration.test.ts`        | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\integration\backtesting-api.test.ts`                     | nikhil        | Feature flag disabled - requires ENABLE_BACKTESTING_TESTS=true                                   | Not specified                                                                                       | N/A        |
| `tests\unit\services\snapshot-service.test.ts`                  | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\unit\services\monte-carlo-power-law-validation.test.ts`  | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\unit\services\monte-carlo-power-law-integration.test.ts` | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\unit\performance\watch-debounce.test.tsx`                | @qa-team      | Perf harness currently uses stale sector fixture shape and non-deterministic timing assumptions. | Update fixtures to current sector schema and recalibrate debounce thresholds with fake timers.      | 0          |
| `tests\api\portfolio-route.template.test.ts`                    | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\api\deal-pipeline.test.ts`                               | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\api\allocations.test.ts`                                 | nikhil        | Feature flag disabled - requires ENABLE_PHASE4_TESTS=true and real PostgreSQL                    | Not specified                                                                                       | N/A        |
| `tests\unit\pages\portfolio-constructor.test.tsx`               | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\unit\engines\monte-carlo-orchestrator.test.ts`           | @phoenix-team | Stochastic mode assertions depend on baseline DB fixtures unavailable in unit test runtime.      | Add deterministic baseline fixture strategy (or seeded integration DB) for stochastic mode tests.   | 34         |
| `tests\unit\database\time-travel-simple.test.ts`                | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\unit\api\time-travel-api.test.ts`                        | @core-team    | 13 tests require validation middleware or queue integration not mockable in unit context         | Use createTimelineRouter with conditional validation mock, or move to integration tests             | 34         |
| `tests\unit\api\portfolio-intelligence.test.ts`                 | @devops-team  | Test infrastructure does not support rate limiting verification                                  | Mock time control, request isolation, and dedicated Redis instance                                  | 31         |
| `tests\chaos\postgres-latency.test.ts`                          | @devops-team  | Requires Toxiproxy infrastructure (docker-compose.toxiproxy.yml)                                 | Add Toxiproxy to CI pipeline or create mock-based alternative                                       | 32         |
| `tests\integration\__tests__\vite-build-regression.test.ts`     | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |
| `tests\integration\__tests__\golden-dataset-regression.test.ts` | @qa-team      | Temporarily skipped pending stabilization triage.                                                | Remove skip and re-enable once deterministic behavior or required test infrastructure is available. | 0          |

## Review Checklist

- [ ] Review each quarantined test for exit criteria status
- [ ] Update owners if team members have changed
- [ ] Add documentation to undocumented quarantines
- [ ] Remove tests that meet exit criteria

## Protocol Reference

See [PROTOCOL.md](./PROTOCOL.md) for quarantine requirements and review process.
