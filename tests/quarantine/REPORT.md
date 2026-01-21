# Quarantine Report

Generated: 2026-01-20

## Summary

| Metric | Count |
|--------|-------|
| Total Quarantined | 36 |
| Documented | 8 |
| Undocumented | 28 |

## Documented Quarantines

| File | Owner | Reason | Exit Criteria | Age (days) |
|------|-------|--------|---------------|------------|
| `tests\integration\testcontainers-smoke.test.ts` | @devops-team | Requires Docker which is not available in GitHub Actions free tier | Migrate to self-hosted runners with Docker OR GitHub adds Docker support | 0 |
| `tests\integration\scenario-comparison.test.ts` | nikhil | Feature flag disabled - requires ENABLE_SCENARIO_COMPARISON=true and database migration | Not specified | N/A |
| `tests\integration\backtesting-api.test.ts` | nikhil | Feature flag disabled - requires ENABLE_BACKTESTING_TESTS=true | Not specified | N/A |
| `tests\api\allocations.test.ts` | nikhil | Feature flag disabled - requires ENABLE_PHASE4_TESTS=true and real PostgreSQL | Not specified | N/A |
| `tests\chaos\postgres-latency.test.ts` | @devops-team | Requires Toxiproxy infrastructure (docker-compose.toxiproxy.yml) | Add Toxiproxy to CI pipeline or create mock-based alternative | 4 |
| `tests\unit\engines\monte-carlo-orchestrator.test.ts` | @phoenix-team | Stochastic mode tests require Phase 2 Monte Carlo completion | Phase 2 Monte Carlo merged (tracking: phoenix-phase2-planning.md) | 6 |
| `tests\unit\api\time-travel-api.test.ts` | @core-team | 13 tests require validation middleware or queue integration not mockable in unit context | Use createTimelineRouter with conditional validation mock, or move to integration tests | 6 |
| `tests\unit\api\portfolio-intelligence.test.ts` | @devops-team | Test infrastructure does not support rate limiting verification | Mock time control, request isolation, and dedicated Redis instance | 3 |

## Undocumented Quarantines (Action Required)

These tests use `describe.skip` but lack proper `@quarantine` documentation.

| File | Reason |
|------|--------|
| `tests\ui-conditionals.test.tsx` | Not documented (describe.skip without @quarantine) |
| `tests\fund-strategy-validation.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\fund-schema-updates.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\fund-basics-evergreen.test.tsx` | Not documented (describe.skip without @quarantine) |
| `tests\evergreen-validation.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\unit\reallocation-api.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\unit\monte-carlo-2025-validation-core.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\unit\general-info-step.test.tsx` | Not documented (describe.skip without @quarantine) |
| `tests\quarantine\fund-setup.smoke.quarantine.test.tsx` | Not documented (describe.skip without @quarantine) |
| `tests\perf\validator.microbench.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\integration\ScenarioMatrixCache.integration.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\integration\scenarioGeneratorWorker.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\integration\scenario-comparison-mvp.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\integration\rls-middleware.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\integration\migration-runner.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\integration\circuit-breaker-db.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\integration\cache-monitoring.integration.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\api\portfolio-route.template.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\api\deal-pipeline.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\unit\services\snapshot-service.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\unit\services\monte-carlo-power-law-validation.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\unit\services\monte-carlo-power-law-integration.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\unit\performance\watch-debounce.test.tsx` | Not documented (describe.skip without @quarantine) |
| `tests\unit\pages\portfolio-constructor.test.tsx` | Not documented (describe.skip without @quarantine) |
| `tests\unit\database\time-travel-simple.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\unit\components\ai-enhanced-components.test.tsx` | Not documented (describe.skip without @quarantine) |
| `tests\integration\__tests__\vite-build-regression.test.ts` | Not documented (describe.skip without @quarantine) |
| `tests\integration\__tests__\golden-dataset-regression.test.ts` | Not documented (describe.skip without @quarantine) |

## Review Checklist

- [ ] Review each quarantined test for exit criteria status
- [ ] Update owners if team members have changed
- [ ] Add documentation to undocumented quarantines
- [ ] Remove tests that meet exit criteria

## Protocol Reference

See [PROTOCOL.md](./PROTOCOL.md) for quarantine requirements and review process.
