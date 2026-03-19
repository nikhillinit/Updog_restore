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
5. Wave 2: client ingress, cache, stream boundaries
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

Roll the hardened helper layer through the heaviest server routes in smaller,
clean rollback-friendly batches.

### Route order

1. `server/routes/monte-carlo.ts`
2. `server/routes/scenario-comparison.ts`
3. `server/routes/ai.ts`
4. `server/routes/variance.ts`

### Procedure

1. Remediate `monte-carlo.ts` and `scenario-comparison.ts` first using the Wave
   1A helper layer.
2. Run targeted tests, targeted lint, typecheck, `npm run lint:eslint`, and
   `npm run guardrails:check`.
3. Commit if the first route batch is internally coherent.
4. Remediate `ai.ts` and `variance.ts` second using the same shared helpers.
5. Apply standing targeted cleanup on touched files only after each route
   batch's architectural edits.
6. Keep route outputs on DTOs or adapter outputs, not raw schema shapes.

### Exit criteria

- route-local widening is removed from the primary route cluster
- route outputs no longer leak raw schema shapes
- the route rollout completed in at least two rollback-friendly batches

## Wave 2: Client Ingress, Cache, and Stream Boundaries

### Goal

Stop raw transport data before it reaches client hooks, state, or page logic.

### Primary targets

- `client/src/lib/predictive-cache.ts`
- `client/src/hooks/useAgentStream.ts`
- `client/src/utils/async-iteration.ts`
- shared API helpers used by these paths
- any contract-producing reserve or shared adapters that define forecasting or
  wizard-facing shapes

### Ownership rule

If a page or hook is the actual ingress boundary, it may be owned here. If it is
only a consumer of already-parsed data, leave it to Wave 3. Do not split a file
across Wave 2 and Wave 3 without a recorded owner transfer.

### Procedure

1. Wrap `response.json()` and stream payload handling in explicit parsers.
2. Keep raw transport data confined to boundary helpers.
3. Ensure cache hydration validates before values enter client state.
4. Stabilize any reserve or shared adapter that produces a consumer-facing shape
   needed by forecasting or wizard code.
5. Reuse shared contracts from Wave 1 where applicable.
6. Add targeted tests for cache, stream, and ingress parsing paths.
7. Apply standing targeted cleanup on touched files only after the architectural
   edits.

### Exit criteria

- raw transport data is blocked at the client boundary
- any consumer-facing reserve or shared contract needed downstream is stable
- overlapping ownership between ingress files and consumer files is explicit

## Wave 3: Chart, Wizard, and Forecasting Consumers

### Goal

Fix the heaviest client consumer layers after ingress contracts are stable.

### Primary targets

- `client/src/components/ui/recharts-bundle.tsx`
- `client/src/components/dashboard/dual-forecast-dashboard.tsx`
- `client/src/components/reports/reports.tsx`
- `client/src/components/performance/PerformanceDashboard.tsx`
- `client/src/components/modeling-wizard/ModelingWizard.tsx`
- `client/src/hooks/useModelingWizard.ts`
- `client/src/machines/modeling-wizard.machine.ts`
- `client/src/pages/forecasting.tsx`
- `client/src/hooks/useCohortAnalysis.ts`

### Repo note

The repo is already on XState v5. Do not preserve a v4-or-v5 branch in the
execution plan.

### Procedure

1. Define typed chart view models separate from raw payloads.
2. Centralize Recharts callback and formatter typing in the adapter layer.
3. Reuse ingress contracts and any earlier stabilized reserve or shared
   consumer-facing adapters.
4. Make wizard machine context and events explicit using the repo's XState v5
   patterns.
5. Remove local casts that duplicate typed ingress contracts.
6. Fix local `react-hooks/exhaustive-deps` warnings only where the touched flow
   depends on them for correctness.
7. Apply standing targeted cleanup on touched files only after the architectural
   edits.

### Exit criteria

- chart, wizard, and forecasting consumers depend on stable typed contracts
- forecasting-facing ownership is resolved in one wave per file
- chart typing does not leak `any` through the component tree

## Wave 4: Reserve Math and Shared Modeling Helpers

### Goal

Clean calculation-path typing, precision handling, and shared helper
normalization after the consumer-facing contracts are already stable.

### Clarifying rule

This wave is for algorithmic and precision cleanup. Any reserve or shared helper
that defines a downstream consumer-facing contract should already have been
stabilized in Wave 2 or Wave 3. If a Wave 4 fix reveals that a contract shape
was wrong or incomplete, escalate back to the consumer wave owner for
re-verification rather than silently patching the contract here.

### Primary targets

- `client/src/lib/reserves-v11.ts`
- `shared/lib/reserves-v11.ts`
- `client/src/core/reserves/adapter/toEngineGraduationRates.ts`
- `client/src/core/reserves/computeReservesFromGraduation.ts`
- `client/src/lib/path-utils.ts`

### Procedure

1. Replace repeated index access and deep optional chaining with typed helper
   functions.
2. Standardize typed inputs and outputs across client and shared reserve
   helpers.
3. Remove calculation-path `parseFloat` usage during this wave.
4. Do not apply defaulting strategies to reserve, forecasting, money-like, or
   model-driving values.
5. Run reserve characterization tests after each meaningful sub-batch.
6. Apply standing targeted cleanup on touched files only after the architectural
   edits.

### Exit criteria

- calculation-path reserve helpers consume typed inputs and produce typed
  outputs
- precision-sensitive paths are covered by characterization tests
- contract-producing adapter work is not being deferred into this wave

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
- `client/src/lib/rollout-orchestrator.ts` if still in runtime scope after Wave
  0

### Procedure

1. Apply the Wave 0 policy decisions first.
2. For CLI files, prefer explicit CLI-safe output policy over runtime logger
   migration unless there is a strong reason to unify them.
3. For reference or example files, narrow scope or move them rather than
   spending production-runtime cleanup effort first.
4. For dev-runtime websocket or dashboard code, type event envelopes and
   command-output parsing before chasing local console warnings.
5. Apply standing targeted cleanup on touched files only after the architectural
   edits.
6. Fix remaining unused locals manually or by deliberate rename.
7. Resolve remaining `require-atomic-updates`, singleton, and narrow console
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
