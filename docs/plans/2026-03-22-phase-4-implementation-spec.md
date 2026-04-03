---
last_updated: 2026-04-03
---

# Phase 4 Implementation Spec: Funds Route Normalization And Boundary Cleanup

## Context

Authoritative parent plan:

- `docs/plans/2026-03-20-contract-integrity-final-counterproposal.md`

Already landed before this batch:

- Phase 0B router cutover for `POST /api/funds`
- Phase 3 server-backed results read model at `GET /api/funds/:id/results`
- sandboxed wizard-to-results validation in
  `tests/integration/wizard-to-results-e2e.test.ts`

This Phase 4 spec is based on the live repo state and the sandbox implementation
completed in this workspace on 2026-03-22.

For a single developer, the implementation keeps the original sequential Phase 4
intent but uses lightweight enforcement:

- one machine-checked ownership manifest for the canonical funds surface
- one focused boundary regression test for the normalized Phase 4 files
- one route-level create -> detail-readback proof for persisted behavior on the
  canonical funds read surface

## Goal

Finish the contract-integrity sequence by:

1. making `server/routes/funds.ts` the sole canonical owner of the
   `GET/POST /api/funds` surface on `registerRoutes()`
2. replacing the remaining server-facing imports that reached into `client/`
   with explicit shared modules
3. proving that the Phase 3 submit and readback flow still works after that
   normalization

## Live Repo Facts

1. Phase 0B already made `POST /api/funds` and `POST /api/funds/calculate`
   router-owned in `server/routes/funds.ts`.
2. Before this batch, `GET /api/funds` and `GET /api/funds/:id` still lived as
   inline handlers in `server/routes.ts`.
3. The following Phase 4 files still imported runtime logic from `client/`:
   - `server/routes.ts`
   - `server/routes/calculations.ts`
   - `server/services/projected-metrics-calculator.ts`
   - `workers/reserve-worker.ts`
   - `workers/pacing-worker.ts`
   - `workers/cohort-worker.ts`
4. Phase 3 was already truthful end to end:
   - `client/src/pages/fund-model-results.tsx` reads from
     `GET /api/funds/:id/results`
   - `/latest` is rejected as a truth source
   - `tests/integration/wizard-to-results-e2e.test.ts` validates submit,
     navigation, and reload using persisted server data

## Decisions

### 1. Canonical Funds Owner

`server/routes/funds.ts` owns the canonical CRUD surface mounted at `/api` on
`registerRoutes()`:

- `GET /api/funds`
- `GET /api/funds/:id`
- `POST /api/funds`
- `POST /api/funds/calculate`

`server/routes.ts` should mount the router and must not retain duplicate inline
ownership for those endpoints.

`server/routes/fund-config.ts` remains the owner of the config/readback routes
that hang off `/api/funds/:id/*`:

- `/draft`
- `/publish`
- `/reserves`
- `/state`
- `/results`

### 2. Shared Replacement Strategy

Server and worker code must not import from `client/` directly for Phase 4
paths. The replacement model is:

- move the runtime logic into `shared/`
- update server/worker imports to target `@shared/*`
- leave thin client compatibility shims in place so existing client and test
  imports keep working without behavior drift

### 3. No Runtime Authority Expansion

This batch stays on the accepted Phase 0A ADR:

- authoritative surface: `registerRoutes()`
- non-authoritative surfaces unchanged:
  - `server/app.ts`
  - `api/[[...slug]].ts`
  - `api/funds.ts`

### 4. Solo-Maintainer Checkpoints

Phase 4 stays one sequential phase, but execution is evaluated in two internal
checkpoints:

- `4A` route ownership normalization
- `4B` shared extraction and boundary cleanup

These checkpoints can land in one branch and one batch, but each needs an
independent rollback decision. If `4A` preserves the canonical HTTP contract but
`4B` introduces a shared-module regression, revert only the extraction work.

### 5. Ownership Must Be Machine-Checked

For this repo size and current team size, the practical version of the route
ownership manifest is a checked TypeScript module:

- `server/contracts/funds-endpoint-ownership.ts`

Readable evidence remains in `docs/evidence/endpoint-ownership.md`, but the
manifest is the authoritative machine-checked source for the Phase 4 canonical
surface.

### 6. Boundary Regression Guard Is Focused And Runnable

Worker lint is still noisy enough that broad `eslint .` is not a reliable
boundary gate for this batch. The lightweight solo-developer control is:

- keep a zero-warning strict lint gate for the clean Phase 4 files
- add a warning-ratchet guard for the three noisy worker files
- add a focused contract test over the normalized Phase 4 files

The focused import guard covers the files that are authoritative in this phase,
including the canonical route owner and the ownership manifest.

### 7. Validation Entry Points Must Be Named

Phase 4 should validate through named repo scripts, not only pasted one-off
commands. The canonical entry points are:

- `npm run test:phase4`
- `npm run lint:phase4`
- `npm run validate:phase4`

### 8. Compatibility Sunset Must Stay Explicit

Temporary legacy acceptance remains allowed only for the current migration path:

- legacy marker: top-level `basics`
- canonical marker: top-level `name`

Removal trigger:

- once the wizard submits canonical `FundCreateV1` directly, delete the legacy
  `basics` acceptance path before introducing any new public write DTO version

## Replacement Table

| Importer                                          | Old import                                     | Replacement                           | Additional work                           | Validation                       |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------- | ----------------------------------------- | -------------------------------- |
| `server/routes.ts`                                | `../client/src/core/reserves/ReserveEngine.js` | `@shared/core/reserves/ReserveEngine` | none after extraction                     | funds route tests + engine tests |
| `server/routes.ts`                                | `../client/src/core/pacing/PacingEngine.js`    | `@shared/core/pacing/PacingEngine`    | none after extraction                     | funds route tests + engine tests |
| `server/routes.ts`                                | `../client/src/core/cohorts/CohortEngine.js`   | `@shared/core/cohorts/CohortEngine`   | none after extraction                     | engine tests                     |
| `server/routes/calculations.ts`                   | `../../client/src/lib/fund-calc.js`            | `@shared/lib/fund-calc`               | add shared deterministic fund-calc module | fund-calc unit tests             |
| `server/services/projected-metrics-calculator.ts` | client reserve/pacing/cohort engines           | shared reserve/pacing/cohort engines  | none after extraction                     | targeted ESLint + engine tests   |
| `workers/reserve-worker.ts`                       | `../client/src/core/reserves/ReserveEngine`    | `@shared/core/reserves/ReserveEngine` | none after extraction                     | targeted ESLint                  |
| `workers/pacing-worker.ts`                        | `../client/src/core/pacing/PacingEngine`       | `@shared/core/pacing/PacingEngine`    | none after extraction                     | targeted ESLint                  |
| `client/src/core/reserves/ReserveEngine.ts`       | local implementation                           | thin re-export to shared              | preserve existing client/test imports     | reserve engine tests             |
| `client/src/core/pacing/PacingEngine.ts`          | local implementation                           | thin re-export to shared              | preserve existing client/test imports     | pacing engine tests              |
| `client/src/core/cohorts/CohortEngine.ts`         | local implementation                           | thin re-export to shared              | preserve existing client/test imports     | cohort engine tests              |
| `workers/cohort-worker.ts`                        | `../client/src/utils/resilientLimit`           | `@shared/utils/resilientLimit`        | extract pLimit + resilientLimit to shared | boundary guard test              |
| `client/src/lib/fund-calc.ts`                     | local implementation                           | thin re-export to shared              | preserve existing client/test imports     | fund-calc unit tests             |
| `client/src/utils/resilientLimit.ts`              | local implementation                           | thin re-export to shared              | preserve existing client/test imports     | boundary guard test              |
| `client/src/utils/pLimit.ts`                      | local implementation                           | thin re-export to shared              | preserve existing client/test imports     | boundary guard test              |

## Sandbox Implementation

The implementation made these structural changes:

1. Added shared runtime modules:
   - `shared/core/reserves/ReserveEngine.ts`
   - `shared/core/pacing/PacingEngine.ts`
   - `shared/core/cohorts/CohortEngine.ts`
   - `shared/lib/fund-calc.ts`
   - `shared/utils/pLimit.ts`
   - `shared/utils/resilientLimit.ts`
2. Converted the original client runtime files into compatibility re-exports.
3. Moved canonical `GET /api/funds` and `GET /api/funds/:id` handlers into
   `server/routes/funds.ts`.
4. Removed the matching inline GET handlers from `server/routes.ts`.
5. Added `server/contracts/funds-endpoint-ownership.ts` as the machine-checked
   canonical ownership manifest for the funds surface.
6. Added `tests/unit/contract/funds-boundary-guard.test.ts` with:
   - file-level import scanning for all 8 authoritative Phase 4 files
   - alias-bypass detection (`@/core/`, `@/lib/`, `@/utils/` → client/src/)
   - synthetic pattern unit tests proving the guard catches both raw paths and
     alias paths while allowing `@shared/` imports
   - shim re-export completeness checks for the shared/client compatibility
     modules introduced in this phase
7. Added named Phase 4 harness scripts in `package.json`:
   - `test:phase4`
   - `lint:phase4`
   - `validate:phase4`
8. Added `scripts/guardrails/phase4-worker-eslint-ratchet.mjs` plus
   `.baselines/phase4-worker-eslint-baseline.json` so worker-warning drift is
   ratcheted instead of accepted as undifferentiated warning-only output.
9. Extended route ownership smoke proof to cover GET /api/funds and a real
   boot-path POST -> GET /api/funds/:id round-trip on `registerRoutes()`.
10. Added create -> detail-readback proof (POST → GET /api/funds/:id by numeric
    ID) to the funds snapshot suite.
11. Fixed DB mock `generateId()` to return serial integers instead of UUIDs,
    matching the `serial('id')` primary key contract in `shared/schema.ts`.
12. Updated the endpoint ownership evidence doc to reflect the normalized owner.

## Validation

### Behavioral Validation

Server validation command:

```powershell
npm run test:phase4:server
```

Observed result:

- `7` test files passed
- `154` tests passed
- `2` tests skipped

Client validation command:

```powershell
npm run test:phase4:client
```

Observed result:

- `1` test file passed
- `19` tests passed
- existing React `act(...)` warnings remain non-failing harness noise

Integration validation command:

```powershell
npm run test:phase4:integration
```

Observed result:

- `1` integration test file passed
- submit, concrete results navigation, and persisted reload remained green

Combined behavioral entry point:

```powershell
npm run test:phase4
```

Observed result:

- server, client, and integration Phase 4 proof set remained green end to end

### Static Validation

Strict zero-warning lint command:

```powershell
npm run lint:phase4:strict
```

Observed result:

- exit code `0`
- clean Phase 4 files remained at `0` warnings and `0` errors

Worker-warning ratchet command:

```powershell
npm run guard:phase4:workers:check
```

Observed result:

- exit code `0`
- ratchet held at `55` warnings total:
  - `workers/cohort-worker.ts`: `21`
  - `workers/pacing-worker.ts`: `4`
  - `workers/reserve-worker.ts`: `30`

Combined static validation entry point:

```powershell
npm run lint:phase4
```

Observed result:

- strict Phase 4 files stayed zero-warning
- noisy worker files did not regress past the committed Phase 4 baseline

## Exit Criteria

Phase 4 is satisfied when all of the following remain true:

- `server/routes/funds.ts` is the canonical owner of the mounted
  `GET/POST /api/funds` surface
- `server/contracts/funds-endpoint-ownership.ts` remains aligned with the
  canonical funds surface and its contract tests
- route prefixes remain internally consistent
- authoritative Phase 4 files no longer import runtime logic from `client/`
- clean Phase 4 files remain zero-warning under `npm run lint:phase4:strict`
- noisy Phase 4 workers do not regress past the committed warning baseline
- route-level create -> detail-readback proofs still pass for
  `GET /api/funds/:id` on both the snapshot-mounted router and the real
  `registerRoutes()` boot path
- wizard submit and persisted results readback still pass in sandbox validation

## Mechanical Rollback Triggers

Rollback the relevant Phase 4 checkpoint if any of the following occur:

- canonical endpoint snapshots drift for `GET/POST /api/funds` or
  `POST /api/funds/calculate`
- the ownership manifest no longer matches the canonical `registerRoutes()`
  surface
- any authoritative Phase 4 file reintroduces a direct runtime import from
  `client/src/*` or a server-side `@/` alias that resolves into `client/src/*`
- the clean-file zero-warning lint gate fails or the worker-warning ratchet is
  exceeded
- create -> readback no longer returns the authored fund identity through the
  canonical detail readback proof at `GET /api/funds/:id`

## Explicit Non-Goals

- Vercel parity work
- broader worker lint cleanup
- route-manifest CI hardening for secondary surfaces
- additional route registration beyond the canonical funds flow
