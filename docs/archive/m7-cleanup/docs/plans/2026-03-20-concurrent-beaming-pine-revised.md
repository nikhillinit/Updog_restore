# Phase 0B Approval Note: `concurrent-beaming-pine` Revised

## Verdict

Approved for execution.

Use this document as the clean replacement for the mixed review-history version
of `C:\Users\nikhi\.claude\plans\concurrent-beaming-pine.md`.

## Authoritative Execution Source

Execute Phase 0B from:

- `docs/plans/2026-03-20-phase-0b-revised-counterproposal.md`

Parent authority:

- `docs/plans/2026-03-20-contract-integrity-final-counterproposal.md`

Do not treat this note as a second competing task list. It is an approval and
constraint memo only.

## Approved Scope

Owned files:

- `server/routes.ts`
- `server/routes/funds.ts`
- `tests/unit/contract/funds-endpoint-snapshots.test.ts`
- `tests/unit/contract/funds-route-ownership.test.ts`
- `docs/evidence/endpoint-ownership.md`
- `docs/decisions/adr-runtime-authority.md`

Out of scope:

- `server/app.ts`
- `server/index.ts`
- `api/[[...slug]].ts`
- `api/index.ts`
- `api/funds.ts`
- DTO work
- persistence work
- wizard-submit work
- results-page work
- drive-by idempotency fixes in unrelated route files

## Non-Waivable Rules

1. Preserve the router-owned `POST /api/funds` contract. Minimum preserved
   contract: `201 { success, data, message }`.
2. Preserve the inline `GET /api/funds` and `GET /api/funds/:id` handlers.
3. Fix the calculate route so the canonical path is `POST /api/funds/calculate`.
4. Remove the shadowed inline `POST /api/funds`.
5. Keep Phase 0A evidence intact. Do not rewrite the observed pre-cutover state
   as if it never existed.
6. The authoritative-runtime smoke proof is mandatory. If it is unstable,
   stabilize it or stop. Do not mark it skippable.
7. The ADR release-support matrix is in scope as a doc-only amendment for this
   batch and must use:
   - `supported`
   - `proxied`
   - `intentionally out of scope`

## Required Validation

Per-batch:

```bash
npx vitest run tests/unit/contract/funds-endpoint-snapshots.test.ts tests/unit/contract/funds-route-ownership.test.ts --project=server
npx eslint server/routes.ts server/routes/funds.ts tests/unit/contract/funds-endpoint-snapshots.test.ts tests/unit/contract/funds-route-ownership.test.ts --no-cache
npm run guardrails:check
```

Integration checkpoint:

```bash
npx vitest run --project=server
npm run test:unit --changed
npm run baseline:progress
npm run lint:eslint
```

Do not substitute:

- `npm run check`
- `npm test -- --project=server`

## File-Ownership Verification

Use a path-scoped diff, not raw `git diff --name-only HEAD`:

```bash
git diff --name-only HEAD -- server/routes.ts server/routes/funds.ts tests/unit/contract/funds-endpoint-snapshots.test.ts tests/unit/contract/funds-route-ownership.test.ts docs/evidence/endpoint-ownership.md docs/decisions/adr-runtime-authority.md
```

## Exit Criteria

- `POST /api/funds` has exactly one owner on the authoritative runtime
- `POST /api/funds` preserves the router-owned wrapper contract
- `POST /api/funds/calculate` is reachable at the single-prefix path
- `POST /api/api/funds/calculate` returns `404`
- inline `GET` endpoints remain unchanged and passing
- Phase 0A docs/tests remain a valid audit trail
- no non-authoritative runtime file was modified
- the authoritative-runtime smoke proof passes
- ADR/runtime-authority documentation still matches shipped behavior
