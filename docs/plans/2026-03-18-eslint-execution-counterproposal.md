---
status: APPROVED
last_updated: 2026-03-18
approved: 2026-03-18
replaces:
  - external plan "2026-03-19-eslint-optimal-implementation-strategy.md"
---

# ESLint Optimal Execution Plan

## Executive Decision

Use this document as the operational source of truth.

Adopt a boundary-first remediation strategy, but execute it through this repo's
actual lint, typecheck, and guardrail workflow instead of introducing a parallel
process.

The approved execution sequence is:

1. Wave 0: baseline, policy, owner map
2. Wave 0.5: safety harness and third-party interop inventory
3. Wave 1A: server schema roots, middleware, parsers
4. Wave 1B: server route rollout
5. Wave 2: client ingress, validation, and transport
6. Wave 3: chart, wizard, and forecasting consumers
7. Wave 4: reserve math and shared modeling helpers
8. Wave 5: policy-sensitive, dev-runtime, and mechanical long tail
9. Wave 6: ratchet through existing repo gates

## Snapshot

Current `current-lint-state.json` totals on 2026-03-18:

- 2605 warnings
- 304 errors
- 292 files with warnings
- 104 files with errors

NOTE: The companion roadmap (`2026-03-18-eslint-remediation-roadmap.md`) reports
0 errors and 2470 warnings. The discrepancy likely reflects different lint
configurations or file coverage. Wave 0 pre-flight MUST produce one
authoritative baseline from a single `eslint . --format json` run and reconcile
or supersede both snapshots. Until then, treat numbers in this section as
indicative, not authoritative.

Dominant rule families:

- `@typescript-eslint/no-unsafe-member-access`: 1138
- `@typescript-eslint/no-unsafe-assignment`: 550
- `@typescript-eslint/no-unsafe-argument`: 382
- `@typescript-eslint/no-explicit-any`: 273
- `unused-imports/no-unused-vars`: 218
- `@typescript-eslint/no-unsafe-call`: 156
- `@typescript-eslint/no-unsafe-return`: 150

Highest-concentration paths from the current snapshot:

- `client/src`: 2182 warnings, 223 errors
- `server/routes`: 307 warnings, 40 errors

Top files currently visible in the snapshot:

- `server/routes/monte-carlo.ts`: 34 warnings
- `server/routes/scenario-comparison.ts`: 31 warnings, 2 errors
- `client/src/components/ui/recharts-bundle.tsx`: 31 warnings
- `client/src/hooks/useCohortAnalysis.ts`: 25 warnings
- `client/src/pages/forecasting.tsx`: 25 warnings
- `client/src/lib/predictive-cache.ts`: 24 warnings, 3 errors
- `client/src/components/modeling-wizard/ModelingWizard.tsx`: 24 warnings, 3
  errors
- `client/src/machines/modeling-wizard.machine.ts`: 24 warnings

Policy-sensitive files that are not reliably represented in the saved snapshot
but still carry current warnings when linted directly:

- `packages/agent-core/backtest-runner.ts`: 54 warnings
- `server/security/integration-guide.ts`: 42 warnings
- `server/websocket/dev-dashboard.ts`: 31 warnings
- `server/db/schema/reserves.ts`: 27 warnings
- `server/cache/index.ts`: 19 warnings

Error-floor rule:

- treat the refreshed Wave 0 baseline as the authoritative repo-wide ESLint
  error floor
- no batch may increase repo-wide error count, even if warnings fall

## Why This Plan Differs

### 1. It uses the repo's real gates

This repo does not gate only on raw `eslint --max-warnings`. It also enforces:

- `npm run lint:eslint`
- `npm run guardrails:check`
- console ratchet baseline
- file-level disable ratchet baseline

Any execution plan that does not include those checks is incomplete for this
repo.

### 2. It treats validation modes as an existing contract

The repo already exposes a runtime validation-mode contract of:

- `off`
- `warn`
- `enforce`

Do not introduce a second top-level public mode vocabulary such as `reportOnly`
/ `normalizeOrDefault` / `enforce`.

Instead:

- keep `off | warn | enforce` as the operational mode contract
- model `normalizeOrDefault` as a per-schema or per-field parsing strategy, not
  as a public runtime mode
- never return invalid data as typed data on a failed parse

Hard rule for `warn` mode:

- for reserve, forecasting, money-like, or model-driving inputs, a failed parse
  may log and short-circuit or return a tagged invalid result
- it may not silently default numeric values
- it may not re-enter the typed domain as if valid

### 3. It narrows automation

Repo-wide `eslint . --fix` or `--fix-dry-run` is too broad for this phase.

Allowed automation:

- targeted `unused-imports/no-unused-imports` cleanup on an explicit
  touched-file allowlist
- targeted `consistent-type-imports` cleanup on an explicit touched-file
  allowlist
- narrow codemods that have a single stated write scope

Standing rule:

- after the architectural edits in every owner batch, run the approved targeted
  cleanup only on the touched files for that batch

Not allowed:

- repo-wide `eslint --fix`
- any automation pass that changes files outside the current owner batch
- claiming that unused-local warnings are broadly auto-fixable

## Repo-Specific Non-Negotiables

1. Touched files must end with `0` ESLint errors, and no batch may increase the
   repo-wide ESLint error floor from Wave 0.
2. Do not add broad file-level disables. Existing disable counts are already
   ratcheted.
3. Do not regress the console or eslint-disable guardrails.
4. Every hotspot file must have one primary owner wave in
   `.artifacts/eslint-owner-map.md`.
5. No file may be double-touched across waves without a recorded owner transfer.
6. Generate the owner map from a fresh baseline. Do not treat any embedded list
   in a planning doc as authoritative.
7. Keep validation mode naming aligned with the existing `off | warn | enforce`
   runtime contract.
8. No raw-boundary-to-domain assertions from `req.body`, `req.query`,
   `response.json()`, websocket payloads, `JSON.parse`, cache hydration, or
   child-process output.
9. Fix helpers and contract-producing adapters before call sites.
10. Do not mix architectural refactors with broad mechanical cleanup in the same
    commit.
11. Treat CLI, dev-runtime, and reference/example files as policy decisions
    first, cleanup targets second.
12. Every touched file must end with warnings less than or equal to where it
    started.
13. If a reserve or shared adapter defines a downstream consumer-facing shape,
    stabilize that contract before or during the consumer wave, not after it.

## Pre-Flight

Before Wave 0 begins, prepare execution artifacts from the live repo state.

Required artifacts:

- `.artifacts/eslint-baseline.json`
- `.artifacts/eslint-owner-map.md`
- `.artifacts/eslint-wave-log.md`
- `.artifacts/eslint-policy-decisions.md`
- `.artifacts/eslint-third-party-interop.md`

Recommended commands:

```powershell
New-Item -ItemType Directory -Force .artifacts | Out-Null
.\node_modules\.bin\eslint.cmd . --format json > .artifacts/eslint-baseline.json
npm run lint:eslint
npm run guardrails:check
npm run check:fast
```

If a batch changes code outside `tsconfig.fast.json` coverage, use the smallest
project-specific typecheck that actually covers the touched files, then run the
repo-level typecheck required by the batch.

## Wave 0: Baseline, Policy, Owner Map

### Goal

Replace stale assumptions with a fresh owner map, explicit policy decisions, and
an authoritative error and warning baseline.

### Must-classify files

- `packages/agent-core/backtest-runner.ts`
- `server/security/integration-guide.ts`
- `server/routes/simulations-guarded.example.ts`
- `server/websocket/dev-dashboard.ts`
- `server/routes/dev-dashboard.ts`
- `client/src/lib/rollout-orchestrator.ts`

### Procedure

1. Refresh the baseline JSON from the live repo.
2. Record totals by rule, directory, and file.
3. Record the authoritative repo-wide ESLint error floor and warning total.
4. Classify each policy-sensitive file as:
   - production runtime
   - dev runtime
   - CLI
   - reference/example
5. Decide how each class is handled for `no-console`.
6. Build `.artifacts/eslint-owner-map.md` from the fresh baseline with one owner
   wave per file.
7. Record, for each owned file:
   - path
   - current warnings
   - current errors
   - owner wave
   - why that wave owns it
   - policy class
   - whether it produces a shared contract
   - whether a later wave depends on it
8. For overlapping hotspots such as forecasting, dev-dashboard, and reserve
   adapters, assign one primary owner and record any future owner-transfer rule.
9. Record files that are missing from the saved snapshot but still warn under a
   direct lint run.

### Exit criteria

- current owner map exists
- repo error floor is recorded
- policy-sensitive files are classified
- console policy is explicit by class
- overlapping hotspots have one owner wave each

## Wave 0.5: Safety Harness and Third-Party Interop Inventory

### Goal

Install a small safety net and identify narrow third-party typing blockers
before high-risk refactors start.

### Required harness

- reserve characterization fixtures and tests
- route contract tests for:
  - `server/routes/monte-carlo.ts`
  - `server/routes/scenario-comparison.ts`
  - `server/routes/ai.ts`
- wizard transition tests
- one client ingress or cache parsing path
- one stream or websocket envelope path if `dev-dashboard` code is touched early

### Third-party interop scope

Audit hotspot libraries only. Do not turn this into repo-wide dependency
gardening.

Examples in scope:

- Recharts
- Socket.IO
- hotspot SDK wrappers in server services
- narrow command-output parsing helpers

### Procedure

1. Add or repair the targeted tests listed above.
2. Record the test commands that define the wave harness.
3. Audit hotspot third-party typing needs only and record the result in
   `.artifacts/eslint-third-party-interop.md`.
4. Add only narrow wrappers, local `.d.ts` files, or typed adapters where
   needed.
5. Identify any reserve or shared adapters that define consumer-facing shapes
   and mark whether they must move into Wave 2 or Wave 3.

### Exit criteria

- targeted safety harness exists before deep refactors begin
- hotspot third-party blockers are known or resolved
- contract-producing reserve or shared adapters are identified up front

## Wave 1A: Server Schema Roots, Middleware, Parsers

### Goal

Stabilize server-side schema roots, request augmentation, and shared parsing
helpers before rolling changes through major routes.

### Primary targets

- `server/db/schema/reserves.ts`
- request augmentation types for `req.user` and `req.context`
- server middleware touched by request typing
- shared body, query, and param parsing helpers
- DTO or adapter helpers that bridge schema outputs to route contracts

### Procedure

1. Tighten schema-root and adapter code in `server/db/schema/reserves.ts`.
2. Centralize request typing for `req.user`, `req.context`, body, query, and
   params.
3. Introduce or repair shared parsers and adapter helpers before touching route
   call sites.
4. Keep runtime validation behavior aligned with:
   - `off`: bypass
   - `warn`: parse, log, and short-circuit or return a tagged invalid result on
     parse failure
   - `enforce`: reject invalid payloads
5. In `warn` mode, failed parses for reserve, forecasting, money-like, or
   model-driving inputs may not silently default numeric values or produce typed
   domain data.
6. Add or update the route-contract tests needed to cover the helper layer.
7. Apply standing targeted cleanup on touched files only after the architectural
   edits are complete.

### Exit criteria

- shared request and parsing helpers exist
- schema roots and DTO adapters are stable enough for route rollout
- validation semantics are explicit and safe for financial inputs

## Wave 1B: Server Route Rollout

### Goal

Roll the hardened helper layer through the remaining server routes in smaller,
clean rollback-friendly batches, but drive the order from live sandbox
validation status instead of the stale 2026-03-18 hotspot snapshot.

### Sandbox validation findings (2026-03-24)

- `npx eslint ... --format json` returns `0` warnings and `0` errors for:
  - `server/routes/monte-carlo.ts`
  - `server/routes/scenario-comparison.ts`
  - `server/routes/ai.ts`
  - `server/routes/variance.ts`
  - `server/routes/graduation.ts`
  - `server/routes/readiness.ts`
  - `server/routes/fund-metrics.ts`
  - `server/routes/admin/queue-dashboard.ts`
- `npm run test:wave1b` passes in the live repo and covers:
  - `tests/unit/routes/monte-carlo-api.test.ts`
  - `tests/unit/routes/ai-api.test.ts`
  - `tests/unit/api/variance-tracking-api.test.ts`
  - `tests/unit/routes/wave1b-tail-api.test.ts`
  - `tests/unit/routes/scenario-comparison-api.test.ts`
- `tests/integration/scenario-comparison-mvp.test.ts` is quarantined, only runs
  when `ENABLE_PHASE4_TESTS=true`, and still depends on DB-backed setup and
  migration approval
- direct route-level sandbox tests now exist for `server/routes/ai.ts`,
  `server/routes/variance.ts`, and `server/routes/scenario-comparison.ts`

### Execution batches

1. Batch A: `server/routes/monte-carlo.ts`
2. Batch B: validated route tail
   - `server/routes/graduation.ts`
   - `server/routes/readiness.ts`
   - `server/routes/fund-metrics.ts`
   - `server/routes/admin/queue-dashboard.ts`
3. Batch C: direct-harness routes
   - `server/routes/ai.ts`
   - `server/routes/variance.ts`
4. Batch D: unit-covered, integration-conditional route
   - `server/routes/scenario-comparison.ts`

### Procedure

1. Keep `monte-carlo.ts` first using the Wave 1A helper layer, and require
   `tests/unit/routes/monte-carlo-api.test.ts` to stay green after each edit.
2. Treat the route tail as executable Wave 1B scope because
   `tests/unit/routes/wave1b-tail-api.test.ts` already validates it in sandbox.
3. Keep `ai.ts` and `variance.ts` on direct route suites that cover request
   validation and primary success or error envelopes:
   - `tests/unit/routes/ai-api.test.ts`
   - `tests/unit/api/variance-tracking-api.test.ts`
4. Keep `scenario-comparison.ts` on the direct route suite
   `tests/unit/routes/scenario-comparison-api.test.ts`, but do not count its
   quarantined integration harness as complete until it is runnable in sandbox
   or CI.
5. For `scenario-comparison.ts`, require explicit unblock conditions before
   execution:
   - `ENABLE_PHASE4_TESTS=true`
   - required DB fixtures and migrations available
   - quarantine exit criteria recorded and satisfied
6. After each route batch, run targeted tests, targeted lint, the smallest
   covering typecheck, `npm run lint:eslint`, and `npm run guardrails:check`.
7. Apply standing targeted cleanup on touched files only after each route
   batch's architectural edits.
8. Keep route outputs on DTOs or adapter outputs, not raw schema shapes.

### Exit criteria

- live Wave 1B batching matches runnable validation status, not stale warning
  counts
- `npm run test:wave1b` remains green under sandbox validation
- `ai.ts`, `variance.ts`, and `scenario-comparison.ts` have direct route harness
- `scenario-comparison.ts` still has explicit integration unblock conditions
- route outputs no longer leak raw schema shapes
- the route rollout completed in at least two rollback-friendly batches

### Route-Backing Services and Infra Follow-On

#### Owner-map scope note

- the live owner map currently assigns 35 files to executable Wave 1B service
  and infra scope
- if a 36-file count is being used, it only works by carrying
  `server/websocket/dev-dashboard.ts` forward from Wave 5 dev-runtime
- keep `server/websocket/dev-dashboard.ts` in Wave 5 unless an explicit owner
  transfer is recorded

#### Sandbox validation findings (2026-03-24)

- `npm run test:wave1b:runtime` is the validated Wave 1B runtime harness: 18
  files, 273 passing tests, 13 skipped tests
- the runtime harness covers:
  - `tests/unit/routes/monte-carlo-api.test.ts`
  - `tests/unit/routes/ai-api.test.ts`
  - `tests/unit/api/variance-tracking-api.test.ts`
  - `tests/unit/routes/wave1b-tail-api.test.ts`
  - `tests/unit/routes/scenario-comparison-api.test.ts`
  - `tests/unit/services/monte-carlo-engine.test.ts`
  - `tests/unit/services/power-law-distribution.test.ts`
  - `tests/unit/services/variance-tracking.test.ts`
  - `tests/unit/services/time-travel-analytics.test.ts`
  - `tests/unit/api/time-travel-api.test.ts`
  - `tests/unit/circuit-breaker.test.ts`
  - `tests/unit/portfolio-optimization/portfolio-optimization-service.test.ts`
  - `tests/unit/cache/server-cache.test.ts`
  - `tests/unit/services/lp-cache.test.ts`
  - `tests/unit/services/cache-invalidation-service.test.ts`
  - `tests/unit/services/cache-warming-service.test.ts`
  - `tests/unit/websocket/websocket-index.test.ts`
  - `tests/unit/websocket/portfolio-metrics.test.ts`
- targeted `npx eslint --no-warn-ignored ...` on the touched Wave 1B service,
  infra, and direct-test files returned `0` warnings
- `npm run lint:eslint` passed at `753` warnings and `0` errors
- `npm run guardrails:check` passed: console ratchet `108 <= 170`; file-level
  eslint-disable ratchet `39 <= 127`
- `npm run check:server` still fails only on pre-existing unrelated issues in
  `client/src/machines/modeling-wizard.machine.ts` and `server/routes/flags.ts`
- direct service or infra harness already exists for:
  - `server/cache/index.ts`
  - `server/cache/memory.ts`
  - `server/services/lp-cache.ts`
  - `server/services/monte-carlo-engine.ts`
  - `server/services/power-law-distribution.ts`
  - `server/services/variance-tracking.ts`
  - `server/services/time-travel-analytics.ts`
  - `server/infra/circuit-breaker-cache.ts`
  - `server/services/portfolio-optimization-service.ts`
  - `server/services/CacheInvalidationService.ts`
  - `server/services/CacheWarmingService.ts`
  - `server/websocket/index.ts`
  - `server/websocket/portfolio-metrics.ts`
- route-backed harness already exists for:
  - `server/services/monte-carlo-service-unified.ts`
  - `server/services/ai-orchestrator.ts`
  - `server/metrics/variance-metrics.ts`
  - `server/services/fund-metrics-calculator.ts`
  - breaker health and readiness surfaces touched through
    `tests/unit/routes/wave1b-tail-api.test.ts`
- harness-first files still need direct tests before deeper refactors:
  - external integrations: `server/services/email-service.ts`,
    `server/services/notion-service.ts`
  - operational and monitoring tail: `server/services/database-pool-manager.ts`,
    `server/seed-demo-data.ts`, `server/observability/production-monitoring.ts`,
    `server/rum/cardinality-guard.ts`
- `tests/api/lp-portal.test.ts` is not included by the default Vitest server
  project include set, so it is not a normal sandbox gate for
  `server/services/email-service.ts`
- `tests/integration/cache-monitoring.integration.test.ts` is skipped on Windows
  or CI, and `tests/integration/circuit-breaker-db.test.ts` remains quarantined,
  so neither should block normal sandbox execution

#### Execution batches

1. Batch E: Monte Carlo compute and forecasting services
   - `server/services/monte-carlo-engine.ts`
   - `server/services/monte-carlo-service-unified.ts`
   - `server/services/monte-carlo-simulation.ts`
   - `server/services/power-law-distribution.ts`
   - `server/services/actual-metrics-calculator.ts`
   - `server/services/construction-forecast-calculator.ts`
   - `server/services/fund-metrics-calculator.ts`
   - `server/services/performance-calculator.ts`
   - `server/services/projected-metrics-calculator.ts`
   - `server/services/portfolio-optimization-service.ts`
2. Batch F: Variance and time-travel analytics
   - `server/services/variance-tracking.ts`
   - `server/metrics/variance-metrics.ts`
   - `server/services/time-travel-analytics.ts`
3. Batch G: Cache, LP, and circuit-breaker core
   - `server/services/lp-cache.ts`
   - `server/cache/index.ts`
   - `server/cache/memory.ts`
   - `server/infra/circuit-breaker-cache.ts`
   - `server/infra/circuit-breaker/CircuitBreaker.ts`
   - `server/infra/circuit-breaker/error-classifier.ts`
   - `server/infra/circuit-breaker/hedged.ts`
   - `server/infra/circuit-breaker/http-breaker.ts`
   - `server/infra/circuit-breaker/index.ts`
   - `server/infra/circuit-breaker/mutex.ts`
   - `server/infra/circuit-breaker/typed-breaker.ts`
4. Batch H: External integration services
   - `server/services/ai-orchestrator.ts`
   - `server/services/email-service.ts`
   - `server/services/notion-service.ts`
5. Batch I: Operational tail services
   - `server/services/CacheInvalidationService.ts`
   - `server/services/CacheWarmingService.ts`
   - `server/services/database-pool-manager.ts`
   - `server/seed-demo-data.ts`
6. Batch J: Production websocket and monitoring runtime
   - `server/websocket/index.ts`
   - `server/websocket/portfolio-metrics.ts`
   - `server/observability/production-monitoring.ts`
   - `server/rum/cardinality-guard.ts`

#### Procedure

1. Execute Batches E and F first because they already have direct service or API
   harness in the default Vitest project.
2. For Batch G, add direct unit or characterization tests for `lp-cache.ts`,
   `server/cache/index.ts`, and `server/cache/memory.ts` before deeper type
   cleanup.
3. For Batch H, keep `ai-orchestrator.ts` on the existing route harness, but add
   default-project direct tests for `email-service.ts` and `notion-service.ts`
   before structural edits.
4. For Batch I, add focused tests for cache invalidation and warming services
   before relying on the Windows-skipped cache integration suite.
5. For Batch J, add websocket envelope or setup tests before changing runtime
   payload typing or monitoring surfaces.
6. If Batch G needs `server/infra/circuit-breaker/breaker-registry.ts` or any
   other Wave 1A-owned producer file, record the owner transfer before touch.
7. After each service or infra batch, run targeted lint, the smallest covering
   typecheck, `npm run test:wave1b:runtime`, `npm run lint:eslint`, and
   `npm run guardrails:check`.
8. Keep service outputs on typed DTOs, parsers, or adapters, not raw third-party
   payloads or unchecked cache values.

#### Exit criteria

- all 35 live Wave 1B service and infra files are assigned to an executable or
  harness-first batch
- `npm run test:wave1b:runtime` remains green during the service rollout
- harness-first files gain direct tests before deeper refactors begin
- no Wave 5 dev-runtime file enters Wave 1B without a recorded owner transfer

## Wave 2: Client Ingress, Validation, and Transport

### Goal

Stop raw transport data before it reaches client hooks, stores, or app
bootstrap logic.

### Live scope rebase

As of 2026-03-25, the live `.artifacts/eslint-owner-map.md` is the
authoritative Wave 2 scope until the next baseline refresh.

- targeted `eslint` on 2026-03-25 returned `0` warnings for
  `client/src/lib/predictive-cache.ts`, `client/src/hooks/useAgentStream.ts`,
  `client/src/utils/async-iteration.ts`, and
  `client/src/lib/validation-helpers.ts`
- treat those files as validated harness assets, not primary remediation scope
- keep `client/src/main.tsx` in Wave 2 because URL, localStorage, and app
  bootstrap normalization is real ingress work
- transfer `client/src/debug/wizard-trace.ts`,
  `client/src/lib/error-boundary.ts`, and `client/src/lib/logger.ts` to Wave 5
  because their remaining work is dev-runtime or console-policy cleanup, not
  transport or contract ingress work

### Primary targets

- `client/src/lib/path-utils.ts`
- `client/src/lib/cache-strategy.ts`
- `client/src/lib/resilient-api-client.ts`
- `client/src/api/reserve-engine-client.ts`
- `client/src/core/flags/featureFlags.ts`
- `client/src/lib/env-detection.ts`
- `client/src/lib/hash.ts`
- `client/src/lib/telemetry.ts`
- `client/src/services/funds.ts`
- `client/src/config/navigation.ts`
- `client/src/config/rollout-runtime.ts`
- `client/src/lib/excel-parity-validator.ts`
- `client/src/main.tsx`
- shared boundary helpers explicitly assigned to Wave 2 in the live owner map

### Ownership rule

If a file parses or normalizes network, URL, env, localStorage, hash, or app
bootstrap data before it enters client state, it belongs here. If it is only a
consumer of already-parsed data, leave it to Wave 3. Do not split a file
across Wave 2 and Wave 3 without a recorded owner transfer.

Reserve math and shared modeling helpers do not move into Wave 2 unless the
owner map records an explicit transfer. `client/src/lib/reserves-v11.ts` and
`client/src/core/reserves/*` remain Wave 4.

### Runnable harness

- `npm run test:wave2` is the current Wave 2 boundary harness:
  - `tests/unit/cache/predictive-cache-characterization.test.tsx`
  - `tests/unit/cache/cache-strategy.test.tsx`
  - `tests/unit/hooks/useAgentStream.test.tsx`
  - `tests/unit/validation/validation-helpers.test.ts`
  - `tests/unit/lib/path-utils.test.tsx`
  - `tests/unit/services/funds.idempotency.test.tsx`
  - `tests/unit/normalize-create-fund-response.test.tsx`
- `tests/unit/utils/wave2-utility-boundaries.test.ts` is not a Wave 2 exit gate;
  it covers generic utilities and does not prove ingress readiness

### Execution batches

#### Batch K: Transport and bootstrap primitives

- `client/src/lib/path-utils.ts`
- `client/src/lib/hash.ts`
- `client/src/lib/env-detection.ts`
- `client/src/lib/validation-helpers.ts`
- `client/src/main.tsx`

#### Batch L: API and cache ingress

- `client/src/lib/cache-strategy.ts`
- `client/src/api/reserve-engine-client.ts`
- `client/src/lib/resilient-api-client.ts`
- `client/src/services/funds.ts`

#### Batch M: Flag, config, and telemetry ingress

- `client/src/core/flags/featureFlags.ts`
- `client/src/config/navigation.ts`
- `client/src/config/rollout-runtime.ts`
- `client/src/lib/telemetry.ts`

#### Batch N: Low-risk tail and harness-first gaps

- `client/src/lib/excel-parity-validator.ts`
- direct tests now exist for `client/src/api/reserve-engine-client.ts`,
  `client/src/lib/cache-strategy.ts`,
  `client/src/lib/resilient-api-client.ts`,
  `client/src/lib/telemetry.ts`,
  `client/src/lib/env-detection.ts`, and
  `client/src/core/flags/featureFlags.ts`

### Sandbox validation

The plan is now validated by a real Wave 2 sandbox slice, not only by owner-map
inspection.

- on 2026-03-25, the full live Wave 2 source list was remediated inside the
  sandbox, including `path-utils.ts`, `cache-strategy.ts`,
  `resilient-api-client.ts`, `telemetry.ts`, `reserve-engine-client.ts`,
  `featureFlags.ts`, `env-detection.ts`, `hash.ts`, `funds.ts`,
  `navigation.ts`, `rollout-runtime.ts`, `excel-parity-validator.ts`,
  `validation-helpers.ts`, and `main.tsx`
- focused validation:
  - `npx vitest run tests/unit/cache/cache-strategy.test.tsx tests/unit/lib/path-utils.test.tsx --reporter=dot`
    passed `2` files and `8` tests
  - targeted `npx eslint client/src/lib/path-utils.ts client/src/lib/cache-strategy.ts tests/unit/cache/cache-strategy.test.tsx tests/unit/lib/path-utils.test.tsx`
    returned `0` warnings and `0` errors
- final validation on 2026-03-25:
  - `npm run test:wave2` passed `12` files and `38` tests after the new
    client-boundary tests entered the harness
  - targeted `npx eslint ...` across the live Wave 2 source list returned `0`
    warnings and `0` errors
  - the funds-to-telemetry contract is aligned, so the Wave 2 harness no
    longer emits telemetry rejection stderr

### Procedure

1. Start each batch with `npm run test:wave2` green.
2. Wrap `response.json()`, URL parameters, localStorage reads, env lookups, and
   bootstrap payload handling in explicit parsers or typed normalizers.
3. Keep raw transport data confined to boundary helpers.
4. Ensure cache hydration validates before values enter client state.
5. Keep app-entry and feature-flag normalization in Wave 2; do not move
   consumer pages or hooks into this wave without a recorded owner transfer.
6. Do not pull `client/src/lib/reserves-v11.ts` or `client/src/core/reserves/*`
   into Wave 2. If a boundary helper exposes a wrong contract shape, fix or
   wrap the boundary file here and send downstream re-verification back to the
   owning Wave 3 or Wave 4 file.
7. Add direct tests for `client/src/api/reserve-engine-client.ts`,
   `client/src/lib/cache-strategy.ts`, and
   `client/src/lib/resilient-api-client.ts` before deeper refactors in those
   files.
8. Run targeted `npx eslint --no-warn-ignored ...` on the current batch after
   the architectural edits.
9. Once a batch stabilizes, run `npm run lint:eslint`,
   `npm run guardrails:check`, and `npm run check:client`.

### Exit criteria

- live Wave 2 scope matches the owner map
- raw transport data is blocked at the client boundary
- `npm run test:wave2` remains green during the wave
- `client/src/main.tsx` remains Wave 2-owned as app bootstrap ingress work
- `client/src/debug/wizard-trace.ts`, `client/src/lib/error-boundary.ts`, and
  `client/src/lib/logger.ts` are recorded in Wave 5
- the full live Wave 2 source list is clean under targeted lint
- the transport-helper slice (`path-utils.ts`, `cache-strategy.ts`) and the
  client-boundary API slice (`reserve-engine-client.ts`,
  `resilient-api-client.ts`) prove the wave can land cleanly through targeted
  tests and targeted lint
- harness-first files gain direct tests before deep refactors begin, then stay
  in the Wave 2 harness
- overlapping ownership between ingress files and consumer files is explicit

## Wave 3: Client Pages, Hooks, and State Consumers

### Goal

Finish the remaining client consumer and local-state cleanup after the Wave 2
ingress layer is stable.

### Live scope rebase

As of 2026-03-25, the old Wave 3 hotspot list is stale relative to the live
codebase.

- do not drive execution from the older snapshot targets:
  - `client/src/components/ui/recharts-bundle.tsx`
  - `client/src/components/dashboard/dual-forecast-dashboard.tsx`
  - `client/src/components/reports/reports.tsx`
  - `client/src/components/performance/PerformanceDashboard.tsx`
  - `client/src/components/modeling-wizard/ModelingWizard.tsx`
  - `client/src/hooks/useModelingWizard.ts`
  - `client/src/machines/modeling-wizard.machine.ts`
  - `client/src/pages/forecasting.tsx`
  - `client/src/hooks/useCohortAnalysis.ts`
- the live `.artifacts/eslint-owner-map.md` now centers Wave 3 on consumer
  pages, hooks, stores, and UI helpers such as:
  - `client/src/pages/mobile-executive-dashboard.tsx`
  - `client/src/components/wizard/PremiumSelect.tsx`
  - `client/src/pages/CapitalStructureStep.tsx`
  - `client/src/lib/quarter-time.ts`
  - `client/src/lib/storage.ts`
  - `client/src/components/ui/intelligent-skeleton.tsx`
  - `client/src/components/wizard/EnhancedField.tsx`
  - `client/src/hooks/use-graduation.ts`
  - `client/src/hooks/useAI.ts`
  - `client/src/pages/shared-dashboard.tsx`
  - `client/src/pages/time-travel.tsx`
  - `client/src/shared/useFlags.ts`
  - `client/src/stores/useFundStore.ts`
  - `client/src/stores/fundStore.ts`
- `client/src/config/runtime.ts` is not a core Wave 3 consumer file in the
  current codebase; it produces runtime config consumed by the already-landed
  Wave 2 boundary file `client/src/config/rollout-runtime.ts`
- treat `client/src/config/runtime.ts` as a Wave 2 carryover prerequisite and
  clear it before any Wave 3 batch that would otherwise reopen rollout
  behavior
- transfer `client/src/debug/fetch-tap.ts`, `client/src/monitoring/noop.ts`,
  and `client/src/vitals.ts` to Wave 5 because they are dev-runtime or
  policy-sensitive runtime surfaces, not primary consumer cleanup
- keep `client/src/lib/storage.ts` in Wave 3, but treat it as low-risk tail
  work because it is test-backed and not currently on the main application
  runtime import path
- keep `client/src/shared/useFlags.ts` in Wave 3 because it is the UI-facing
  feature-flag consumer layered over already-stabilized Wave 2 flag ingress

### Primary targets

- `client/src/components/wizard/PremiumSelect.tsx`
- `client/src/components/wizard/EnhancedField.tsx`
- `client/src/components/wizard/TestIdProvider.tsx`
- `client/src/pages/CapitalStructureStep.tsx`
- `client/src/pages/DistributionsStep.tsx`
- `client/src/pages/InvestmentStrategyStep.tsx`
- `client/src/stores/useFundStore.ts`
- `client/src/stores/fundStore.ts`
- `client/src/pages/mobile-executive-dashboard.tsx`
- `client/src/pages/shared-dashboard.tsx`
- `client/src/pages/time-travel.tsx`
- `client/src/hooks/useAI.ts`
- `client/src/hooks/use-graduation.ts`
- `client/src/hooks/useFundMetrics.ts`
- `client/src/hooks/useLPFundDetail.ts`
- `client/src/hooks/useLPSummary.ts`
- `client/src/hooks/useLiquidityAnalytics.ts`
- `client/src/hooks/useFundKpis.ts`
- `client/src/components/ui/intelligent-skeleton.tsx`
- `client/src/components/ui/ai-insight-card.tsx`
- `client/src/lib/quarter-time.ts`
- `client/src/lib/storage.ts`
- `client/src/shared/useFlags.ts`
- the remaining live Wave 3 pages, hooks, stores, and low-warning consumer tail
  assigned in `.artifacts/eslint-owner-map.md`

### Repo note

The repo is already on XState v5. Do not preserve a v4-or-v5 branch in the
execution plan.

### Ownership rule

If a file renders UI, derives local state, or consumes already-normalized
contracts from Wave 2 or Wave 4 producers, it belongs in Wave 3. If it parses
raw transport, env, remote-config, or bootstrap payloads before they enter
client state, record an owner transfer back to Wave 2 instead of silently
burying boundary cleanup here. If it is primarily dev-runtime, monitoring, or
console-policy work, move it to Wave 5.

### Runnable harness

- `npm run test:wave3` is the current Wave 3 execution harness:
  - `tests/unit/components/enhanced-field.test.tsx`
  - `tests/unit/components/premium-select.test.tsx`
  - `tests/unit/hooks/useAI.test.tsx`
  - `tests/unit/hooks/use-graduation.test.tsx`
  - `tests/unit/lib/quarter-time.test.ts`
  - `tests/unit/lib/storage.test.ts`
  - `tests/unit/shared/useFlags.test.tsx`
  - `tests/unit/stores/useFundStore.test.ts`
  - `tests/unit/stores/useFundStore.idempotency.test.ts`
  - `tests/unit/stores/fund-store-stability.test.ts`
  - `tests/unit/components/ai-enhanced-components.test.tsx`
  - `tests/unit/modeling-wizard-persistence.test.tsx`
  - `tests/unit/machines/modeling-wizard-fundid.test.tsx`
- this harness already gives direct runnable coverage for:
  - `client/src/components/wizard/EnhancedField.tsx`
  - `client/src/components/wizard/PremiumSelect.tsx`
  - `client/src/hooks/useAI.ts`
  - `client/src/hooks/use-graduation.ts`
  - `client/src/lib/quarter-time.ts`
  - `client/src/lib/storage.ts`
  - `client/src/shared/useFlags.ts`
  - `client/src/components/ui/intelligent-skeleton.tsx`
  - `client/src/components/ui/ai-insight-card.tsx`
  - `client/src/stores/useFundStore.ts`
  - `client/src/stores/fundStore.ts`
- the repo also has local tests for some live Wave 3 files outside the current
  default Vitest project include set:
  - `client/src/lib/__tests__/storage.test.ts`
  - `client/src/components/__tests__/POVComponents.test.tsx`
  - `client/src/components/__tests__/Sidebar.test.tsx`
- do not count those `client/src/**/__tests__` files as Wave 3 gate coverage
  until they are moved under `tests/unit` or the Vitest project include rules
  are intentionally widened
- remaining page-level coverage gaps for future hardening, not current blockers:
  - `client/src/pages/CapitalStructureStep.tsx`
  - `client/src/pages/DistributionsStep.tsx`
  - `client/src/pages/InvestmentStrategyStep.tsx`
  - `client/src/pages/mobile-executive-dashboard.tsx`
  - `client/src/pages/shared-dashboard.tsx`
  - `client/src/pages/time-travel.tsx`

### Sandbox validation

- on 2026-03-25, a Wave 3 Batch O wizard-input slice landed in sandbox:
  - `client/src/components/wizard/PremiumSelect.tsx`
  - `client/src/components/wizard/EnhancedField.tsx`
  - `tests/unit/components/premium-select.test.tsx`
  - `tests/unit/components/enhanced-field.test.tsx`
- targeted `npx eslint --no-warn-ignored ...` on those touched source and test
  files returned `0` warnings and `0` errors
- after adding the wizard-input tests to the harness, `npm run test:wave3`
  passed in the live workspace:
  - `8` files
  - `61` tests passed
  - `2` tests skipped
- the current harness emits non-blocking stderr from:
  - zustand persist middleware reporting unavailable test storage in the
    `useFundStore` and `fundStore` suites
  - expected localStorage failure logs in
    `tests/unit/modeling-wizard-persistence.test.tsx`
- treat that stderr as existing harness noise, not as Wave 3 execution failure
- on 2026-03-25, the full in-scope Wave 3 rollout landed in sandbox:
  - Batch O store, wizard-input, and step-page cleanup
  - Batch P dashboard, analytics, and consumer-hook cleanup
  - Batch Q helper and flag/storage consumer cleanup
  - Batch R low-warning page and hook tail cleanup
- the expanded `npm run test:wave3` harness passed in the live workspace:
  - `13` files
  - `73` tests passed
  - `2` tests skipped
- targeted `npx eslint --no-warn-ignored ...` across the in-scope live Wave 3
  owner-map files returned `0` warnings and `0` errors after excluding the
  recorded non-Wave-3 transfers:
  - `client/src/config/runtime.ts` as Wave 2 carryover
  - `client/src/debug/fetch-tap.ts`
  - `client/src/monitoring/noop.ts`
  - `client/src/vitals.ts`
- `npm run check:client` remains red on unrelated pre-existing client and
  project-include failures outside this Wave 3 rollout; the touched Wave 3
  files validated here no longer appear in that error surface

### Execution batches

#### Batch O: Wizard inputs, store-backed step pages, and store core

- `client/src/components/wizard/PremiumSelect.tsx`
- `client/src/components/wizard/EnhancedField.tsx`
- `client/src/components/wizard/TestIdProvider.tsx`
- `client/src/pages/CapitalStructureStep.tsx`
- `client/src/pages/DistributionsStep.tsx`
- `client/src/pages/InvestmentStrategyStep.tsx`
- `client/src/stores/useFundStore.ts`
- `client/src/stores/fundStore.ts`
- `client/src/stores/useFund.ts`
- `client/src/stores/useFundSelector.ts`
- `client/src/lib/investment-round-defaults.ts`

#### Batch P: Dashboard, analytics, and reporting consumers

- `client/src/pages/mobile-executive-dashboard.tsx`
- `client/src/pages/shared-dashboard.tsx`
- `client/src/pages/time-travel.tsx`
- `client/src/components/planning/portfolio-construction.tsx`
- `client/src/hooks/useAI.ts`
- `client/src/hooks/use-graduation.ts`
- `client/src/hooks/useFundMetrics.ts`
- `client/src/hooks/useLPFundDetail.ts`
- `client/src/hooks/useLPSummary.ts`
- `client/src/hooks/useLiquidityAnalytics.ts`
- `client/src/hooks/useFundKpis.ts`
- `client/src/adapters/kpiAdapter.ts`
- `client/src/components/ui/intelligent-skeleton.tsx`
- `client/src/components/ui/ai-insight-card.tsx`

#### Batch Q: Consumer helpers and UI-facing flag/storage tail

- `client/src/lib/quarter-time.ts`
- `client/src/lib/storage.ts`
- `client/src/shared/useFlags.ts`
- `client/src/hooks/useFlags.tsx`
- `client/src/hooks/useScenarioComparison.ts`
- `client/src/components/LegacyRouteRedirector.tsx`
- `client/src/components/onboarding/GuidedTour.tsx`
- `client/src/lib/excel-parity.ts`

#### Batch R: Remaining low-warning page and hook tail

- the remaining Wave 3 files at `1-4` warnings in the live owner map after
  Batches O-Q are stable
- examples include `client/src/pages/planning.tsx`,
  `client/src/pages/lp/reports.tsx`, `client/src/pages/CompanyDetail.tsx`,
  `client/src/pages/financial-modeling.tsx`,
  `client/src/components/ui/sidebar.tsx`, and `client/src/hooks/useFundKpis.ts`

### Procedure

1. Start each batch with `npm run test:wave3` green.
2. Clear `client/src/config/runtime.ts` as a Wave 2 carryover before opening any
   Wave 3 batch that would otherwise mask boundary work behind consumer edits.
3. Execute Batch O first because the live codebase still routes step pages and
   dashboards through the fund-store and wizard-input layer.
4. Before deeper refactors in a harness-first file, add a direct unit or page
   test for that file and then keep it inside `npm run test:wave3`.
5. Preserve store idempotence, hydration, and no-op update behavior validated by
   the current `useFundStore` and `fundStore` suites.
6. Reuse Wave 2 ingress contracts and do not reintroduce raw `fetch`,
   `localStorage`, or URL parsing directly inside consumer pages or hooks.
7. If a Wave 3 consumer reveals a wrong reserve or shared-model contract, hand
   the contract repair back to the owning Wave 4 file rather than silently
   fixing the shared helper here.
8. Fix local `react-hooks/exhaustive-deps` warnings only where the touched flow
   depends on them for correctness.
9. Keep `client/src/debug/fetch-tap.ts`, `client/src/monitoring/noop.ts`, and
   `client/src/vitals.ts` out of Wave 3 unless an explicit owner transfer is
   recorded.
10. Apply standing targeted cleanup on touched files only after the
    architectural edits.
11. After each batch, run targeted `npx eslint --no-warn-ignored ...`,
    `npm run test:wave3`, `npm run lint:eslint`, `npm run guardrails:check`,
    and the smallest covering client typecheck.

### Exit criteria

- the Wave 3 plan matches the live owner-map consumer scope instead of the
  stale chart/forecasting hotspot list
- `client/src/config/runtime.ts` is treated as a Wave 2 carryover, not hidden
  inside Wave 3 consumer work
- `client/src/debug/fetch-tap.ts`, `client/src/monitoring/noop.ts`, and
  `client/src/vitals.ts` are recorded in Wave 5
- `npm run test:wave3` exists and remains green during the wave
- wizard inputs, store-backed pages, and dashboard consumers gain direct tests
  before deep refactors begin
- local store idempotence and hydration behavior remain stable
- Wave 3 consumers depend on typed contracts without reopening reserve-math or
  transport-boundary ownership

## Wave 4: Reserve Math and Shared Modeling Helpers

### Goal

Clean calculation-path typing, precision handling, and shared helper
normalization after the consumer-facing contracts are already stable.

### Live scope rebase

As of 2026-03-25, the live `.artifacts/eslint-owner-map.md` is the
authoritative Wave 4 scope.

- the current live hotspots are:
  - `client/src/lib/reserves-v11.ts`
  - `client/src/core/reserves/adapter/toEngineGraduationRates.ts`
  - `client/src/core/reserves/ConstrainedReserveEngine.ts`
  - `client/src/core/reserves/computeReservesFromGraduation.ts`
  - `client/src/lib/cashflow/generate.ts`
  - `schema/src/index.ts`
  - `client/src/core/capitalAllocation/periodLoopEngine.ts`
  - `client/src/lib/fund-calc-v2.ts`
  - `client/src/core/graduation/GraduationRateEngine.ts`
  - `client/src/core/cohorts/resolvers.ts`
  - `client/src/core/types/fund-domain.ts`
  - `client/src/lib/fee-calculations.ts`
- treat `client/src/lib/cashflow/generate.ts` and
  `client/src/core/cohorts/resolvers.ts` as security-sensitive Wave 4 work
  because their remaining warnings are calculation-path parsing rules
- keep this wave focused on modeling and reserve math; do not reopen transport,
  UI, or runtime-policy cleanup already assigned to Waves 2, 3, or 5

### Ownership rule

If a file defines reserve math, cashflow math, graduation logic, shared
modeling helpers, or typed adapters feeding those engines, it belongs here. If
the fix changes a consumer-facing contract shape already normalized by Wave 2
or Wave 3, escalate back to that consumer wave for re-verification instead of
silently burying contract changes in Wave 4.

### Runnable harness

- `npm run test:wave4` is the Wave 4 execution harness:
  - `tests/unit/reserves-v11.test.ts`
  - `tests/unit/reserves/ConstrainedReserveEngine.test.ts`
  - `tests/unit/reserves/adapter-toEngineGraduationRates.test.ts`
  - `tests/unit/reserves/computeReservesFromGraduation.test.ts`
  - `tests/unit/lib/cashflow-generate.test.ts`
  - `tests/unit/engines/graduation-rate-engine.test.ts`
  - `tests/unit/cohorts/resolvers.test.ts`
  - `tests/unit/fee-calculations.test.ts`
  - `tests/unit/fund-calc-fee-horizon.test.ts`
  - `tests/unit/truth-cases/capital-allocation.test.ts`
  - `tests/unit/wizard-reserve-bridge.test.ts`
- `npm run lint:wave4` is the targeted non-regression gate for the current
  live Wave 4 source list plus the Wave 4 characterization tests

### Sandbox validation

- on 2026-03-25, the reserve and shared-modeling rollout landed in sandbox:
  - client compatibility shims now re-export the authoritative shared
    implementations for `reserves-v11` and `ConstrainedReserveEngine`
  - `toEngineGraduationRates.ts` now accepts `unknown`, normalizes stage input
    through typed helpers, and uses deterministic fallback stage identifiers
  - `cashflow/generate.ts` no longer relies on `parseFloat` or `parseInt` in
    calculation paths
  - `schema/src/index.ts`, `periodLoopEngine.ts`, `fund-calc-v2.ts`,
    `GraduationRateEngine.ts`, `fund-domain.ts`, and `fee-calculations.ts`
    received the low-warning Wave 4 tail cleanup
- direct Wave 4 characterization coverage added during the rollout:
  - `tests/unit/lib/cashflow-generate.test.ts`
  - explicit zero-cap coverage in `tests/unit/reserves-v11.test.ts`
  - deterministic fallback-stage coverage in
    `tests/unit/reserves/adapter-toEngineGraduationRates.test.ts`
  - direct runner coverage in
    `tests/unit/reserves/computeReservesFromGraduation.test.ts` so the harness
    no longer relies on `client/src/**/__tests__` include behavior

### Execution batches

#### Batch S: Reserve engines and authoritative shared implementations

- `shared/lib/reserves-v11.ts`
- `client/src/lib/reserves-v11.ts`
- `shared/core/reserves/ConstrainedReserveEngine.ts`
- `client/src/core/reserves/ConstrainedReserveEngine.ts`
- `tests/unit/reserves-v11.test.ts`
- `tests/unit/reserves/ConstrainedReserveEngine.test.ts`

#### Batch T: Contract-producing reserve adapters and graduation projections

- `client/src/core/reserves/adapter/toEngineGraduationRates.ts`
- `client/src/core/reserves/computeReservesFromGraduation.ts`
- `client/src/core/graduation/GraduationRateEngine.ts`
- `client/src/core/cohorts/resolvers.ts`
- `tests/unit/reserves/adapter-toEngineGraduationRates.test.ts`
- `tests/unit/reserves/computeReservesFromGraduation.test.ts`
- `tests/unit/engines/graduation-rate-engine.test.ts`
- `tests/unit/cohorts/resolvers.test.ts`

#### Batch U: Cashflow and modeling helper tail

- `client/src/lib/cashflow/generate.ts`
- `client/src/core/capitalAllocation/periodLoopEngine.ts`
- `client/src/lib/fund-calc-v2.ts`
- `client/src/lib/fee-calculations.ts`
- `tests/unit/lib/cashflow-generate.test.ts`
- `tests/unit/fee-calculations.test.ts`
- `tests/unit/fund-calc-fee-horizon.test.ts`
- `tests/unit/truth-cases/capital-allocation.test.ts`
- `tests/unit/wizard-reserve-bridge.test.ts`

#### Batch V: Shared schema and low-warning modeling types

- `schema/src/index.ts`
- `client/src/core/types/fund-domain.ts`

### Procedure

1. Start each batch with `npm run test:wave4` green.
2. Prefer one authoritative implementation for reserve engines and keep
   client-path compatibility via thin re-export shims where the app already
   imports the client path.
3. Replace unchecked `any` and unsafe property access with `unknown` plus typed
   helper normalizers.
4. Remove calculation-path `parseFloat` and `parseInt` usage during this wave.
5. Do not apply fallback defaults to reserve, forecasting, or money-driving
   values unless the fallback is already part of the modeled contract.
6. Add direct tests before changing behavior that affects ranking, capping,
   graduation, or generated cashflow schedules.
7. Run `npm run lint:wave4` after the architectural edits for the current
   batch.
8. Once the wave is stable, run `npm run lint:eslint`,
   `npm run guardrails:check`, and the smallest relevant typecheck.

### Exit criteria

- live Wave 4 scope matches the owner map
- authoritative reserve helpers consume typed inputs and produce typed outputs
- client compatibility shims stay thin and stop duplicating shared engine logic
- `npm run test:wave4` remains green during the wave
- `npm run lint:wave4` passes on the full live Wave 4 source list
- precision-sensitive paths are covered by characterization tests
- contract-producing adapter work is not silently deferred into other waves

## Wave 5: Policy-Sensitive, Dev-Runtime, and Mechanical Long Tail

### Goal

Finish the remaining warnings only after the main architectural sources are
under control.

### Primary targets

- `packages/agent-core/backtest-runner.ts`
- `server/security/integration-guide.ts`
- `server/websocket/dev-dashboard.ts`
- `server/routes/dev-dashboard.ts`
- `server/cache/index.ts`
- `server/queues/simulation-queue.ts`
- `server/queues/backtesting-queue.ts`
- `server/queues/report-generation-queue.ts`
- `client/src/debug/wizard-trace.ts`
- `client/src/debug/fetch-tap.ts`
- `client/src/monitoring/noop.ts`
- `client/src/vitals.ts`
- `client/src/lib/error-boundary.ts`
- `client/src/lib/logger.ts`
- `client/src/lib/rollout-orchestrator.ts` if still in runtime scope after Wave
  0

### Procedure

1. Apply the Wave 0 policy decisions first.
2. For CLI files, prefer explicit CLI-safe output policy over runtime logger
   migration unless there is a strong reason to unify them.
3. For reference or example files, narrow scope or move them rather than
   spending production-runtime cleanup effort first.
4. For client policy or debug-runtime helpers, keep console policy explicit and
   prefer logger or policy cleanup over ad hoc transport refactors.
5. For dev-runtime websocket or dashboard code, type event envelopes and
   command-output parsing before chasing local console warnings.
6. Apply standing targeted cleanup on touched files only after the architectural
   edits.
7. Fix remaining unused locals manually or by deliberate rename.
8. Resolve remaining `require-atomic-updates`, singleton, and narrow console
   issues only in the currently owned operational paths.

### Exit criteria

- the long tail is reduced without distorting earlier owner waves
- policy-sensitive files are handled according to recorded policy, not ad hoc
  exceptions

## Wave 6: Ratchet Through Existing Gates

### Goal

Turn the cleanup into a maintained floor using the repo's existing enforcement
path.

### Procedure

1. Refresh `.artifacts/eslint-baseline.json`.
2. Record realized deltas by rule, directory, owner wave, and repo-wide error
   count.
3. Record which targeted tests were run for the wave and whether they passed.
4. Update the lint warning cap only after:
   - the wave-specific targeted tests pass
   - the targeted-test result is logged in `.artifacts/eslint-wave-log.md`
   - `npm run lint:eslint` passes
   - `npm run guardrails:check` passes
   - the chosen typecheck passes
5. Write updated console and eslint-disable baselines only if that change is
   explicitly intended and approved.
6. Keep touched-file non-regression active in future work.

### Ratchet rule

Do not lower only `--max-warnings` while leaving console or disable baselines
stale. Ratchets must stay aligned with behavior, lint, and guardrail state.

## Concurrent Feature Development Policy

If a file queued for a future wave must be modified for unrelated feature work
before that wave reaches it:

1. The feature author follows non-negotiable #12 (warnings must not increase)
   and #1 (errors must reach 0 in touched files).
2. The feature author is NOT required to perform the full wave remediation for
   that file.
3. The owner map is updated to record the touch, and the owning wave inherits
   the file at its new warning count.
4. If the feature change alters a contract-producing shape, the owning wave must
   re-verify downstream consumers.

This keeps feature velocity decoupled from wave sequencing while preserving the
error floor and warning monotonicity guarantees.

## Timebox and Reassessment

Each wave should target completion within one focused work session. If any
single wave (especially Wave 0.5 safety harness) exceeds two sessions without
reaching its exit criteria:

1. Log the blocker in `.artifacts/eslint-wave-log.md`.
2. Reassess whether the wave scope should be split or deferred.
3. Do not let an incomplete wave block subsequent waves that have no dependency
   on it.

If project priorities shift mid-execution, the plan may be paused after any
completed wave. The error floor, owner map, and wave log preserve all progress
for resumption.

## Standard Batch Workflow

Use this workflow inside every owner batch:

1. Select one owner batch.
2. List the touched files.
3. Confirm owner-wave responsibility for each touched file.
4. List the boundaries feeding those files.
5. Add or update the smallest necessary tests.
6. Update helpers and contract-producing adapters before call sites.
7. Remediate the owner files.
8. Run targeted `unused-imports/no-unused-imports` and `consistent-type-imports`
   cleanup on touched files only.
9. Fix remaining unused locals manually or by deliberate rename.
10. Run targeted lint on touched files.
11. Run targeted tests.
12. Run the smallest relevant typecheck.
13. Run `npm run lint:eslint`.
14. Run `npm run guardrails:check`.
15. Record warning deltas, error deltas, targeted tests, and owner notes in
    `.artifacts/eslint-wave-log.md`.
16. Commit only when the batch is internally coherent.

## Approval Conditions

This plan is approval-ready if the implementation team agrees to:

- regenerate the owner map from the live repo before Wave 1A
- preserve `off | warn | enforce` as the validation-mode contract
- install the Wave 0.5 safety harness before high-risk refactors begin
- split server execution into Wave 1A and Wave 1B
- stabilize contract-producing reserve or shared adapters before or during the
  consumer waves that depend on them
- keep automation scoped to touched files only
- ratchet only after targeted tests, lint, guardrails, and typecheck all pass
