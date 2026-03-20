---
status: PROPOSED
last_updated: 2026-03-20
base_commit: 7fbf1977e5fca6718dc71159b5142ce9d78cb0e3
works_with:
  - docs/plans/2026-03-18-eslint-execution-counterproposal.md
replaces:
  - informal memo
    "C:\\Users\\nikhi\\.claude\\plans\\fluttering-yawning-pretzel.md"
---

# Contract-Integrity Counterproposal

## Executive Decision

Treat this as a short-track priority override for the current release-critical
integration gap.

Do not replace the ESLint execution plan as the repo's operational framework.
Instead:

1. Pause discretionary Wave 3 lint work at the current checkpoint.
2. Execute this contract-integrity track under the existing touched-file lint,
   guardrail, and targeted-test rules.
3. Resume lint cleanup after the primary wizard-to-results flow is truthful and
   end-to-end functional.

## Diagnosis

This is not just a route-registration problem.

It is a runtime-authority and contract-integrity problem spanning:

- multiple server entrypoints
- multiple deployment adapters
- duplicate `/api/funds` surfaces
- mismatched wizard and server payload shapes
- incomplete persistence of full wizard state
- a results page that fabricates data instead of reading a server-backed model
- lingering client-to-server import violations

## Repo Facts That Must Drive The Plan

1. `dev:api` runs `server/main.ts`, which boots `server/server.ts`, which calls
   `registerRoutes()` from `server/routes.ts`.
2. `server/index.ts` separately uses `makeApp()` from `server/app.ts`, which has
   a different route composition surface.
3. `server/routes.ts` already mounts `routes/funds.ts`, but `server/app.ts` does
   not.
4. `client/src/machines/modeling-wizard.machine.ts` posts wizard state to
   `/api/funds`, but `server/routes/funds.ts` expects `name` and `size` while
   the wizard produces `fundName` and `fundSize`.
5. The repo already has overlapping contract surfaces in `shared/dto.ts`,
   `shared/types.ts`, `server/validators/fundSchema.ts`, and
   `server/routes/funds.ts`.
6. Storage currently persists only the basic `funds` row plus optional
   `engineResults`; the repo's full configuration storage already exists in
   `fundConfigs.config`.
7. The results page currently reads session storage and fabricates financial
   outputs instead of loading a server-backed read model.
8. Vercel currently routes `api/**/*.ts` through `vercel.json`, and
   `api/[[...slug]].ts` imports `server/app.js` directly.
9. Railway builds via `Dockerfile.railway`, while the main Docker image runs
   `dist/index.js`, which means deployment adapters must be audited before any
   entrypoint is removed.

## Non-Negotiables

1. Do not introduce yet another top-level fund contract if an existing shared
   schema can be consolidated and extended.
2. Do not delete entrypoints, adapters, or add new route registrations until
   runtime authority and deployment targets are explicit.
3. Do not preserve synthetic results as an MVP fallback for production-facing
   flows.
4. Do not let rich wizard data terminate in validation without an explicit
   persistence target.
5. Do not remove client/server import violations without naming the shared
   replacement module for each import.
6. Keep the ESLint plan's touched-file rules active:
   - touched files end at 0 ESLint errors
   - warnings do not increase
   - `npm run guardrails:check` stays green

## Track Dependencies

The core contract path is sequential, not parallel.

Required dependency order:

1. Track 0
2. Track 1
3. Track 2
4. Track 3
5. Track 4
6. Track 6

Track 5 is the only track that may run independently, and only if its shared
replacement work does not alter the active write or read contracts.

## Multi-Track Ownership

These files appear in multiple tracks and must have one owner at a time:

| File                                             | Primary owner first | Later touch allowed for       |
| ------------------------------------------------ | ------------------- | ----------------------------- |
| `server/routes.ts`                               | Track 0             | Track 4 dedupe only           |
| `server/routes/funds.ts`                         | Track 1             | Track 2 and Track 4           |
| `server/routes/fund-config.ts`                   | Track 2             | Track 3 read-model wiring     |
| `server/app.ts`                                  | Track 0             | adapter-only follow-up        |
| `client/src/machines/modeling-wizard.machine.ts` | Track 1             | Track 4 end-to-end validation |

## Execution Order

### Track 0: Runtime Authority and Route Topology

#### Goal

Make the supported runtime and deployment paths explicit before any route dedupe
or entrypoint removal work.

#### Primary files

- `server/main.ts`
- `server/bootstrap.ts`
- `server/server.ts`
- `server/routes.ts`
- `server/index.ts`
- `server/app.ts`
- `api/[[...slug]].ts`
- `api/index.ts`
- `vercel.json`
- `railway.toml`
- `Dockerfile`
- `Dockerfile.railway`

#### Required work

1. Perform a deployment audit before deleting or downgrading any entrypoint:
   - npm scripts
   - Vercel functions and rewrites
   - Railway configuration
   - Docker and Dockerfile.railway startup targets
2. Write an ADR that names:
   - the authoritative local development boot path
   - the supported deployment adapters
   - the status of `server/index.ts` + `server/app.ts`
   - the scripts, tests, and docs that depend on each path
3. Reconcile the duplicate `/api/funds` ownership in `server/routes.ts` and the
   mounted `routes/funds.ts` router.
4. Before removing or rewriting any inline `/api/funds` handlers, capture HTTP
   request/response snapshots for the affected endpoints so the replacement
   surface can be verified against actual behavior.
5. Add one smoke test that proves `/api/funds` is served by the intended path on
   each supported runtime surface.

#### Exit criteria

- runtime ADR exists
- deployment targets are audited
- `/api/funds` ownership is explicit
- inline-handler rewrite has a snapshot harness
- no supported deployment path is orphaned by the decision

### Track 1: Public Write DTO And Contract Consolidation

#### Goal

Define one canonical public write DTO for `/api/funds`, then adapt it explicitly
to storage and downstream models instead of letting overlapping schemas drift.

#### Primary files

- `shared/dto.ts`
- `shared/types.ts`
- `server/validators/fundSchema.ts`
- `server/routes/funds.ts`
- `client/src/machines/modeling-wizard.machine.ts`
- `client/src/schemas/modeling-wizard.schemas.ts`

#### Required work

1. Choose the canonical public write DTO for `/api/funds`.
2. Add a single adapter from wizard state to that contract.
3. Consolidate or deprecate duplicate server-local schemas that overlap with the
   public write DTO.
4. Fold the step-contract audit into this track:
   - waterfall casing and allowed values
   - scenario shape drift such as `scenarioType` vs `enabled`
5. Add contract tests that prove the wizard submit payload is accepted by the
   server boundary without lossy renaming or ad hoc casts.

#### Exit criteria

- one canonical public write DTO exists
- wizard payload maps to it explicitly
- adapters from write DTO to persistence and read-model inputs are explicit
- waterfall and scenario contract drift is resolved or isolated behind adapters

### Track 2: Write Model and Persistence

#### Goal

Persist the full wizard configuration intentionally instead of storing only a
partial fund row.

#### Primary files

- `server/routes/funds.ts`
- `server/storage.ts`
- `shared/schema/fund.ts`
- `server/routes/fund-config.ts`

#### Required work

1. Define what belongs in the base `funds` row.
2. Define what belongs in `fundConfigs.config`.
3. Make the create flow persist both intentionally when full wizard data is
   submitted.
4. Decide whether the initial write creates:
   - a fund plus an initial draft config
   - a fund plus an initial published config
5. Define lifecycle and versioning fields for the model state, including:
   - `draft`
   - `submitted`
   - `calculating`
   - `ready`
   - `failed`
   - `configVersion`
   - `lastCalculatedAt`
6. Add a field-ownership table and migration story for existing funds and
   configs.
7. Remove any TODO-level behavior where rich wizard sections are validated but
   discarded.

#### Exit criteria

- the full wizard payload has a defined persisted home
- lifecycle state is explicit and truthful
- the create path no longer drops rich configuration data
- storage behavior is consistent across memory and database implementations

### Track 3: Results Read Model

#### Goal

Replace session-storage reconstruction and fabricated outputs with a server-
backed read model.

#### Primary files

- `client/src/pages/fund-model-results.tsx`
- `server/routes.ts`
- `server/routes/fund-config.ts`
- any new dedicated results endpoint if needed

#### Required work

1. Choose the read source for the results page.
2. Prefer a dedicated server-backed results read model if the page needs data
   from multiple stores.
3. Remove fabricated values such as placeholder MOIC and reserve ratio.
4. Make the page render lifecycle states truthfully:
   - `draft`
   - `submitted`
   - `calculating`
   - `ready`
   - `failed`
5. If engine results are not yet available, show an explicit incomplete state
   rather than synthesizing financial outputs.

#### Exit criteria

- the results page no longer depends on session storage for truth
- the page no longer fabricates financial metrics
- the client reads one explicit server-backed model

### Track 4: Funds Route Normalization and End-to-End Rollout

#### Goal

Fix the `funds` surface fully before touching broader route registration.

Note:

- on the `registerRoutes()` path, `funds` is already mounted
- this track is about deduplication, normalization, and truthful end-to-end
  behavior, not about pretending the route does not exist yet

#### Primary files

- `server/routes/funds.ts`
- `server/routes.ts`
- `client/src/machines/modeling-wizard.machine.ts`
- tests covering POST and readback behavior

#### Required work

1. Normalize route path conventions inside `routes/funds.ts`.
2. Eliminate double-prefix hazards such as `/funds` versus
   `/api/funds/calculate` inside the same router.
3. Make the wizard submission succeed end to end against the authoritative
   runtime path.
4. Verify that a created fund can be read back through the chosen results read
   model.

#### Exit criteria

- wizard submit succeeds on the active server path
- persisted data can be read back without session storage
- route prefixes are internally consistent

### Track 5: Boundary Import Replacement

#### Goal

Replace client-to-server import violations through named shared replacements.

#### Primary files

- `workers/reserve-worker.ts`
- `workers/pacing-worker.ts`
- `server/routes/calculations.ts`
- `server/services/projected-metrics-calculator.ts`
- any shared replacement modules required

#### Required work

Build an explicit replacement table:

- current import
- target shared module
- missing shared extraction work, if any
- validation needed after replacement

Do not accept a task phrased only as "remove client imports."

#### Exit criteria

- each violating import has an explicit shared replacement
- no import is removed without preserving behavior

### Track 6: Secondary Route Registration and CI Guard

#### Goal

Only after `funds` is fixed end to end, extend route reachability and add drift
prevention.

#### Primary files

- `server/routes/liquidity.ts`
- `server/routes/capital-allocation.ts`
- route manifest / audit script
- CI workflow files if needed

#### Required work

1. Register `liquidity` and `capital-allocation` in separate rollback-friendly
   batches.
2. Add contract tests for each route as it becomes reachable.
3. Add a manifest-based route-registration audit tied to the authoritative
   runtime entrypoint.

#### Exit criteria

- `funds` is already working before additional route rollout
- route registration drift has a CI guard

## Explicitly Deferred

- broad Wave 3 lint cleanup beyond touched files
- frontend auth flow unless the chosen create/read path is JWT-protected or the
  immediate release requires protected access
- large-scale route registration beyond the named priority surfaces

## Validation And Gates

Per-batch gates:

1. targeted tests for the touched contract or route
2. targeted no-cache ESLint on touched files where feasible
3. `npm run guardrails:check`
4. boot-path smoke test if route topology or entrypoint ownership changed

Integration checkpoint gates:

1. `npm run test:unit --changed`
2. `npm run baseline:progress`
3. `npm run lint:eslint`
4. any broader integration or smoke tests required by the batch bundle

If a batch changes the active route topology or runtime entrypoint, do not merge
it without the corresponding smoke test across the supported runtime surface.

## Recommended Initial Batch

Start with runtime authority only. Do not mix runtime-topology resolution with
DTO and client-submit edits in the first batch.

Initial file set:

- `server/main.ts`
- `server/bootstrap.ts`
- `server/server.ts`
- `server/routes.ts`
- `server/index.ts`
- `server/app.ts`
- `api/[[...slug]].ts`
- `api/index.ts`
- `vercel.json`
- `railway.toml`
- `Dockerfile`
- `Dockerfile.railway`

That batch should end with:

- runtime ADR
- deployment-target audit
- `/api/funds` smoke test coverage
- explicit decision on inline `/api/funds` handler reconciliation

Only then should Track 1 begin.
