# Quarantine stabilization triage — 2026-05-28

This document replaces the generic reason
`Temporarily skipped pending stabilization triage.` with actionable root-cause
hypotheses and exit criteria. The rows below are based on static inspection of
the skipped tests and nearby production code; confirm each row by running the
file locally with the skip temporarily removed.

## Inventory summary

The generated quarantine report currently tracks 35 quarantined files, 35
documented files, and 12 static `describe.skip` files. The generic stabilization
reason appears across the items below.

| File                                                        | Failure family                           | Static finding                                                                                                                                                                                  | Exit criteria                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/ui-conditionals.test.tsx`                            | contract-drift / stale UI selectors      | Tests import legacy `FundSetup` and `WaterfallStep`, assert labels such as `ever-green fund`, and assert lowercase waterfall variants.                                                          | Split the schema-level checks into pure validator tests; update UI selectors to accessible roles from current components; pass `vitest run tests/ui-conditionals.test.tsx --project=client` 50 consecutive runs. |
| `tests/evergreen-validation.test.ts`                        | contract-drift                           | Test expects lowercase `american`/`european`, `hurdle`, and `catchUp`, while the current `WaterfallSchema` accepts only `{ type: 'AMERICAN', carryVesting }`.                                   | Product decision recorded: either add a discriminated European waterfall schema or delete/update European assertions. File passes under server project 50 consecutive runs.                                      |
| `tests/unit/reallocation-api.test.ts`                       | requires-real-db / bad-mock              | Header says real PostgreSQL is required, but the test also mocks `server/db`; route imports `query`/`transaction` from `server/db/index`, so the mock does not isolate the actual SQL contract. | Move to integration config with `TEST_DATABASE_URL`, or refactor route behind a repository interface and unit-test the repository mock. File passes 5x under the selected profile.                               |
| `tests/unit/general-info-step.test.tsx`                     | flaky-timing / real product bug          | Test uses fake timers with `userEvent` without an `advanceTimers` bridge; component also calls `onSave` synchronously with no error boundary/logging.                                           | Use `userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })`, replace deprecated `act` import, and add guarded `onSave` error handling. File passes 50x under client project.                           |
| `tests/perf/validator.microbench.test.ts`                   | env-dependent perf threshold             | Perf microbenchmarks are in the unit include path and can fail under shared CI contention.                                                                                                      | Move to a dedicated perf profile with calibrated thresholds, or convert to trend-reporting with no hard unit gate. Passes 20x in perf profile.                                                                   |
| `tests/integration/ScenarioMatrixCache.integration.test.ts` | env-dependent cache integration          | Integration cache behavior is quarantined with a generic reason; likely requires deterministic Redis/cache isolation.                                                                           | Add a cache integration profile with isolated Redis or memory backend; clear cache between cases; pass 10 consecutive runs.                                                                                      |
| `tests/integration/scenarioGeneratorWorker.test.ts`         | worker/env-dependent                     | Worker integration likely depends on runtime queue/worker lifecycle not provisioned by default integration config.                                                                              | Add explicit worker bootstrap/teardown and fake clock boundaries; pass 10 consecutive runs without open-handle warnings.                                                                                         |
| `tests/integration/rls-middleware.test.ts`                  | requires-real-db                         | RLS behavior cannot be validated against the unit DB mock.                                                                                                                                      | Run only in a PostgreSQL-backed RLS profile with migrations applied; pass 5 consecutive runs.                                                                                                                    |
| `tests/integration/migration-runner.test.ts`                | requires-real-db / destructive migration | Migration runner needs isolated DB reset rights.                                                                                                                                                | Gate behind `TEST_DATABASE_URL`/destructive-db confirmation and run in a disposable database; pass up/down cycle 5x.                                                                                             |
| `tests/integration/circuit-breaker-db.test.ts`              | requires-real-db / timing                | Circuit-breaker behavior depends on database failure timing.                                                                                                                                    | Use deterministic fake DB client or toxiproxy-backed integration profile; pass 20x without timing flakes.                                                                                                        |
| `tests/integration/cache-monitoring.integration.test.ts`    | env-dependent cache integration          | Cache monitoring requires isolated cache state and metrics reset.                                                                                                                               | Provide memory Redis or disposable Redis, reset metrics registry between tests, pass 10x.                                                                                                                        |
| `tests/api/portfolio-route.template.test.ts`                | orphaned/template                        | `vitest.config.mjs` excludes `*.template.test.ts`; file is a template, not an executable contract.                                                                                              | Move to `tests/templates/` or instantiate a real route contract file; no generic quarantine remains.                                                                                                             |
| `tests/api/deal-pipeline.test.ts`                           | superseded contract / stale API test     | New `tests/unit/routes/deal-pipeline.contract.test.ts` already freezes route behavior with in-file mocks and idempotency checks.                                                                | Delete stale test or port any unique assertions into the contract test. New contract passes in unit suite.                                                                                                       |
| `tests/unit/services/snapshot-service.test.ts`              | bad-mock / storage-time drift            | Generic reason with no file-specific exit criteria. Likely stale storage/date mocks.                                                                                                            | Replace ambient `Date.now()` assumptions with injected clock and deterministic storage mock; pass 50x.                                                                                                           |
| `tests/unit/pages/portfolio-constructor.test.tsx`           | contract-drift / removed router import   | `vitest.config.mjs` explicitly excludes this file because it imports removed `react-router-dom`.                                                                                                | Replace route dependency with current router wrapper or move assertions to component-level contracts; pass 50x under client project.                                                                             |
| `tests/unit/database/time-travel-simple.test.ts`            | requires-db-state / bad-mock             | Time-travel/database tests are not isolated from DB state under unit config.                                                                                                                    | Move to integration DB profile or mock repository boundary; pass 20x with random test order.                                                                                                                     |

## New quarantine rule

Going forward, quarantine metadata must include:

```ts
itQuarantined(
  'name',
  {
    reason: 'requires-real-db',
    owner: '@owner',
    issue: '#123',
    quarantinedAt: '2026-05-28',
    exitCriteria:
      'This exits quarantine when the file passes 50 consecutive runs under npm run test:flake-hunt.',
  },
  () => {
    // test body
  }
);
```

The generic phrase is banned by `eslint-rules/no-generic-quarantine-reason.cjs`.
