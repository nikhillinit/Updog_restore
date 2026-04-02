# Phase 0B Execution Spec: Authoritative `/api/funds` Owner Cutover

## Context

Phase 0A is complete and committed.

Authoritative plan:

- `docs/plans/2026-03-20-contract-integrity-final-counterproposal.md`

Phase 0A deliverables already exist:

- `docs/decisions/adr-runtime-authority.md`
- `docs/evidence/endpoint-ownership.md`
- `tests/unit/contract/funds-endpoint-snapshots.test.ts`
- `tests/unit/contract/funds-route-ownership.test.ts`

Phase 0B is a narrow runtime-owner cutover on the authoritative
`registerRoutes()` surface only.

## Goal

Make authoritative `/api/funds` ownership unambiguous without widening into DTO,
persistence, results-read, or Vercel-parity work.

Concretely, this batch must:

- keep inline `GET /api/funds` and `GET /api/funds/:id` unchanged
- preserve the router-owned `POST /api/funds` contract
- fix the `/api/api/funds/calculate` double-prefix bug
- remove the shadowed inline `POST /api/funds`
- preserve the Phase 0A audit trail

## Owned Files

- `server/routes.ts`
- `server/routes/funds.ts`
- `tests/unit/contract/funds-endpoint-snapshots.test.ts`
- `tests/unit/contract/funds-route-ownership.test.ts`
- `docs/evidence/endpoint-ownership.md`

## Out Of Scope

- `server/app.ts`
- `server/index.ts`
- `api/[[...slug]].ts`
- `api/index.ts`
- `api/funds.ts`
- DTO work
- persistence changes
- wizard-submit changes
- results-page changes
- drive-by idempotency fixes in unrelated route files

If the batch appears to require any of the above, stop and amend the parent plan
instead of widening 0B.

## Canonical Contract To Preserve

For authoritative `POST /api/funds`, the preserved success contract is the
router-owned shape from `server/routes/funds.ts`:

- `201`
- body shape: `{ success, data, message }`

This batch is not allowed to silently flip the endpoint back to the inline raw
fund response shape.

## Task 1: Fix Idempotency Middleware In `server/routes/funds.ts`

Change the import from the named factory to the default pre-called middleware.

From:

- `import { idempotency } from '../middleware/idempotency';`

To:

- `import idempotency from '../middleware/idempotency';`

Why:

- `server/middleware/idempotency.ts` exports the factory as a named export and
  the pre-called middleware as the default export
- `server/routes/funds.ts` currently passes the factory directly to Express
- that breaks the authoritative `POST /api/funds` path

Do not expand this fix to other route files in this batch.

## Task 2: Fix The Mount Prefix For Calculate

In `server/routes/funds.ts`, change the route path from:

- `/api/funds/calculate`

to:

- `/funds/calculate`

Why:

- the router is already mounted at `/api`
- the current declaration resolves to `/api/api/funds/calculate`

## Task 3: Remove The Shadowed Inline `POST /api/funds`

In `server/routes.ts`, delete only the inline `POST /api/funds` handler.

Do not touch:

- inline `GET /api/funds`
- inline `GET /api/funds/:id`

Why:

- Phase 0A ownership evidence shows the mounted router POST already wins on the
  authoritative surface
- the inline GET handlers are still load-bearing because
  `server/routes/funds.ts` does not provide read endpoints

## Task 4: Update Contract Tests For Post-Cutover State

Update:

- `tests/unit/contract/funds-endpoint-snapshots.test.ts`
- `tests/unit/contract/funds-route-ownership.test.ts`

Rules:

- keep the existing focused/manual harness as the primary contract test setup
- do not broaden these tests to full `registerRoutes()` ownership unless a
  separate smoke proof is added and remains deterministic
- remove any reconstruction of the deleted inline POST handler
- remove the idempotency mock only if the `funds.ts` import fix makes the
  focused harness stable

Required assertions after the cutover:

- `POST /api/funds` returns `201` with `{ success, data, message }`
- `POST /api/funds/calculate` is reachable at `/api/funds/calculate`
- `POST /api/api/funds/calculate` is not the canonical path
- `GET /api/funds` still works
- `GET /api/funds/:id` still works

These tests should assert the post-cutover state, not just document it.

## Task 5: Update Endpoint Ownership Evidence Without Rewriting History

Update `docs/evidence/endpoint-ownership.md`.

Do:

- keep the existing observed/current-state section as Phase 0A evidence
- add a Phase 0B achieved/result section
- mark the target state as achieved with date
- record the calculate-path correction
- record the inline POST removal

Do not:

- overwrite the observed pre-cutover state table so that it reads as if the
  ambiguity never existed

## Validation

### Per-Batch Gates

1. Targeted contract tests:

```bash
npx vitest run tests/unit/contract/funds-endpoint-snapshots.test.ts tests/unit/contract/funds-route-ownership.test.ts --project=server
```

2. Targeted no-cache ESLint on touched TypeScript files:

```bash
npx eslint server/routes.ts server/routes/funds.ts tests/unit/contract/funds-endpoint-snapshots.test.ts tests/unit/contract/funds-route-ownership.test.ts --no-cache
```

3. Guardrails:

```bash
npm run guardrails:check
```

### Integration Checkpoint

Run after the batch is green:

```bash
npm run test:unit --changed
npm run baseline:progress
npm run lint:eslint
```

### Release-Support Matrix Check

Before sign-off, confirm the ADR/release-support matrix still truthfully marks
every touched runtime surface as one of:

- supported for this release
- proxied to the canonical owner
- intentionally out of scope

For this batch, the expected result is:

- `registerRoutes()` surface changed
- non-authoritative surfaces unchanged
- Vercel stub/adapters still out of scope

## Exit Criteria

- `POST /api/funds` has exactly one owner on the authoritative runtime:
  `server/routes/funds.ts`
- `POST /api/funds` preserves the router-owned wrapper contract
- `POST /api/funds/calculate` is reachable at `/api/funds/calculate`
- `POST /api/api/funds/calculate` is not the canonical path
- inline `GET /api/funds` and `GET /api/funds/:id` still pass contract tests
- Phase 0A docs/tests remain a valid audit trail
- no non-authoritative runtime file was modified
- the release-support matrix still matches shipped behavior

## Rollback Rule

Revert the batch if any of the following happen:

- `POST /api/funds` no longer returns the router-owned wrapper shape
- `POST /api/funds/calculate` becomes unreachable on the authoritative runtime
- either inline GET endpoint changes contract or ownership unexpectedly
- the cutover requires touching DTO, persistence, wizard-submit, or results-page
  code
- the release-support matrix can no longer be stated truthfully

## Deferred Follow-On

Do not fold these into 0B:

- idempotency import fixes in `server/routes/deal-pipeline.ts`
- idempotency import fixes in `server/routes/variance.ts`
- `DatabaseMock` default-population cleanup
- UUID versus serial-ID harmonization

If needed, handle them in a separate narrowly owned batch.
