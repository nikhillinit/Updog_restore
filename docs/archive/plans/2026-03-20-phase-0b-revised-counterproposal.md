# Phase 0B Revised Counterproposal: Authoritative `/api/funds` Owner Cutover

## Purpose

This document replaces the broader `.claude` Phase 0B draft with a tighter
execution counterproposal.

It keeps the correct core changes:

- fix the `funds.ts` idempotency middleware import
- fix the `POST /api/funds/calculate` mount prefix
- remove the shadowed inline `POST /api/funds`
- preserve the load-bearing inline `GET` handlers

It also corrects the main execution problems in the `.claude` draft:

- no out-of-scope drive-by route fixes
- no rewriting of Phase 0A evidence as if ambiguity never existed
- repo-real validation gates
- one mandatory authoritative-runtime smoke proof
- explicit release-surface verification without widening into Vercel/app parity

## Parent Authority

Parent plan:

- `docs/plans/2026-03-20-contract-integrity-final-counterproposal.md`

Phase 0A artifacts already exist:

- `docs/decisions/adr-runtime-authority.md`
- `docs/evidence/endpoint-ownership.md`
- `tests/unit/contract/funds-endpoint-snapshots.test.ts`
- `tests/unit/contract/funds-route-ownership.test.ts`

This batch must remain faithful to the accepted Phase 0B scope in the parent
plan.

## Goal

Make authoritative `/api/funds` ownership unambiguous on the `registerRoutes()`
surface without widening into DTO, persistence, results, or non-authoritative
runtime work.

## Owned Files

- `server/routes.ts`
- `server/routes/funds.ts`
- `tests/unit/contract/funds-endpoint-snapshots.test.ts`
- `tests/unit/contract/funds-route-ownership.test.ts`
- `docs/evidence/endpoint-ownership.md`

## Explicit Scope Amendment

To satisfy the parent plan's release-surface requirement for runtime batches,
this memo includes one doc-only scope amendment:

- `docs/decisions/adr-runtime-authority.md`

This amendment is limited to adding a clearly labeled release-support matrix
using the parent plan vocabulary:

- supported
- proxied
- intentionally out of scope

No other ADR/runtime-surface expansion is allowed in this batch.

## Explicit Non-Goals

- do not modify `server/app.ts`
- do not modify `server/index.ts`
- do not modify `api/[[...slug]].ts`
- do not modify `api/index.ts`
- do not modify `api/funds.ts`
- do not start DTO work
- do not change persistence
- do not touch wizard submit code
- do not change the results page
- do not perform drive-by idempotency fixes in unrelated route files

If the batch appears to require any of the above, stop and amend the parent plan
instead of widening 0B.

## Canonical Contract To Preserve

For authoritative `POST /api/funds`, preserve the router-owned contract from
`server/routes/funds.ts`.

Minimum preserved contract:

- status `201`
- success body shape `{ success, data, message }`
- router-owned error surface remains canonical for this batch

Phase 0B is not allowed to silently revert the endpoint to the deleted inline
raw-fund response shape.

## Execution Tasks

### Task 1: Fix Idempotency Middleware In `server/routes/funds.ts`

Change:

- `import { idempotency } from '../middleware/idempotency';`

To:

- `import idempotency from '../middleware/idempotency';`

Why:

- the named export is the factory
- the default export is the pre-called middleware
- the authoritative `POST /api/funds` path currently passes the factory directly
  to Express

Do not expand this fix to `deal-pipeline.ts` or `variance.ts` in this batch.

### Task 2: Fix The Calculate Mount Prefix

In `server/routes/funds.ts`, change the route declaration from:

- `/api/funds/calculate`

To:

- `/funds/calculate`

Why:

- the router is already mounted at `/api`
- the current declaration resolves to `/api/api/funds/calculate`

### Task 3: Remove The Shadowed Inline `POST /api/funds`

In `server/routes.ts`, delete only the inline `POST /api/funds` handler.

Do not touch:

- inline `GET /api/funds`
- inline `GET /api/funds/:id`

Why:

- Phase 0A evidence shows the mounted router POST already wins on the
  authoritative runtime
- the inline GET handlers are still load-bearing because the router does not
  provide equivalent reads

### Task 4: Update Contract Tests For Post-Cutover State

Update:

- `tests/unit/contract/funds-endpoint-snapshots.test.ts`
- `tests/unit/contract/funds-route-ownership.test.ts`

Rules:

- keep the existing focused/manual harness as the primary contract setup
- do not broaden these tests into a full `registerRoutes()` ownership suite
- remove any reconstruction of the deleted inline POST handler
- remove the idempotency mock only if the `funds.ts` import fix makes the
  focused harness stable
- each POST test must use a unique fund name or an explicit `Idempotency-Key`
  header to avoid false collisions once real idempotency is active

Required assertions after the cutover:

- `POST /api/funds` returns `201` with `{ success, data, message }`
- `POST /api/funds` does not return the deleted raw-fund response shape
- invalid `POST /api/funds` still returns the router-owned error surface at a
  minimum `400` with an `error` property
- `POST /api/funds/calculate` is reachable at `/api/funds/calculate`
- `POST /api/api/funds/calculate` returns `404`
- `GET /api/funds` still works
- `GET /api/funds/:id` still works

### Task 5: Add One Mandatory Authoritative-Runtime Smoke Proof

Add one narrow smoke proof for the authoritative runtime path.

Requirements:

- it must prove the post-cutover owner behavior on the real `registerRoutes()`
  path
- it must stay narrow enough that unrelated route/module initialization does not
  become the main failure mode
- if direct `registerRoutes()` boot is too unstable for the main contract files,
  keep the focused/manual harness as primary and add one dedicated smoke case
  that only proves boot-path ownership
- the smoke case must live inside one of the two existing contract files:
  - `tests/unit/contract/funds-endpoint-snapshots.test.ts`, or
  - `tests/unit/contract/funds-route-ownership.test.ts`
- do not add a third test file for this proof in Phase 0B

This is mandatory for sign-off. Phase 0B is a runtime-owner cutover, so one
authoritative-path proof is required in addition to the focused contract suite.

### Task 6: Update Documentation Without Rewriting History

Update:

- `docs/evidence/endpoint-ownership.md`
- `docs/decisions/adr-runtime-authority.md`

Do:

- keep the existing observed/current-state section as Phase 0A evidence
- add a Phase 0B achieved/result section
- mark the target state as achieved with date
- record the calculate-path correction
- record the inline POST removal
- record that release-supported surfaces remain unchanged in scope:
  `registerRoutes()` changed, non-authoritative surfaces unchanged
- add a `Release-Support Matrix` section to the ADR using the parent plan
  vocabulary:
  - `registerRoutes()` runtime surface: `supported`
  - `server/app.ts` / `api/[[...slug]].ts`: `intentionally out of scope`
  - `api/funds.ts`: `intentionally out of scope` unless explicitly enabled as a
    demo stub

Do not:

- overwrite the observed pre-cutover state table so that it reads as if the
  ambiguity never existed

## Validation

### Per-Batch Gates

1. Targeted contract tests:

```bash
npx vitest run tests/unit/contract/funds-endpoint-snapshots.test.ts tests/unit/contract/funds-route-ownership.test.ts --project=server
```

2. Targeted no-cache ESLint on owned TypeScript files:

```bash
npx eslint server/routes.ts server/routes/funds.ts tests/unit/contract/funds-endpoint-snapshots.test.ts tests/unit/contract/funds-route-ownership.test.ts --no-cache
```

3. Guardrails:

```bash
npm run guardrails:check
```

4. One authoritative-runtime boot-path smoke proof:

- satisfied by the dedicated smoke case from Task 5

### Integration Checkpoint

Run after the batch is green:

```bash
npx vitest run --project=server
npm run test:unit --changed
npm run baseline:progress
npm run lint:eslint
```

Do not use:

- `npm run check` as the compile gate for this batch
- `npm test -- --project=server` as if it were server-only

Those commands do not mean what the broader `.claude` draft assumed in this
repo.

## Release-Surface Verification

Before sign-off, confirm that the existing ADR/runtime-authority tables still
truthfully describe shipped behavior for this batch.

Expected result:

- `registerRoutes()` surface changed
- non-authoritative surfaces unchanged
- Vercel stub/adapters still out of scope

This batch satisfies the release-surface requirement by making the ADR matrix
update explicitly in-scope via the scope amendment above.

## Exit Criteria

- `POST /api/funds` has exactly one owner on the authoritative runtime:
  `server/routes/funds.ts`
- `POST /api/funds` preserves the router-owned wrapper contract
- `POST /api/funds/calculate` is reachable at `/api/funds/calculate`
- `POST /api/api/funds/calculate` returns `404`
- inline `GET /api/funds` and `GET /api/funds/:id` still pass contract tests
- Phase 0A docs/tests remain a valid audit trail
- no non-authoritative runtime file was modified
- authoritative-runtime smoke proof passes
- ADR/runtime-authority surface description still matches shipped behavior

## Rollback Rule

Revert the batch if any of the following happen:

- `POST /api/funds` no longer returns the router-owned wrapper shape
- `POST /api/funds/calculate` becomes unreachable on the authoritative runtime
- either inline GET endpoint changes contract or ownership unexpectedly
- the cutover requires touching DTO, persistence, wizard-submit, or results-page
  code
- authoritative runtime ownership is green locally but cannot be stated
  truthfully against the ADR/runtime-authority evidence

## Deferred Follow-On

Do not fold these into 0B:

- idempotency import fixes in `server/routes/deal-pipeline.ts`
- idempotency import fixes in `server/routes/variance.ts`
- `DatabaseMock` default-population cleanup
- UUID versus serial-ID harmonization

If needed, handle them in a separate narrowly owned batch.

## File-Ownership Verification

Do not rely on a raw `git diff --name-only HEAD` check by itself, because
unrelated worktree changes can pollute the result.

Use one of these checks instead:

1. Path-scoped verification:

```bash
git diff --name-only HEAD -- server/routes.ts server/routes/funds.ts tests/unit/contract/funds-endpoint-snapshots.test.ts tests/unit/contract/funds-route-ownership.test.ts docs/evidence/endpoint-ownership.md docs/decisions/adr-runtime-authority.md
```

2. Or compare against a recorded phase-start file list if the worktree was not
   clean at batch start.

Expected owned-file set:

- `server/routes.ts`
- `server/routes/funds.ts`
- `tests/unit/contract/funds-endpoint-snapshots.test.ts`
- `tests/unit/contract/funds-route-ownership.test.ts`
- `docs/evidence/endpoint-ownership.md`
- `docs/decisions/adr-runtime-authority.md`
