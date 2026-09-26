---
status: HISTORICAL
audience: both
last_updated: 2026-09-25
owner: '@nikhillinit'
---

# Code Review: QA Closure Client Reliability

**Review Date**: 2026-09-25  
**Version**: 1.6.0 (package unchanged). Reviewed object: the staged diff on
`feat/f1170-pr1-mutation-error-boundary` against `origin/main` at `cc91110b5`
(F_1.17.0 PR 1: C3 and C8). In-loop Codex code review, four rounds:
REQUEST_CHANGES (two Critical, one Major), REQUEST_CHANGES (one Major),
REQUEST_CHANGES (one Major), then APPROVED.  
**Files Reviewed**:

- `.github/path-filters.yml`
- `TODOS.md`
- `audit/surface-contract-matrix/README.md`
- `client/src/components/portfolio/tabs/CompanySelectionTable.tsx`
- `client/src/components/portfolio/tabs/ReallocationTab.tsx`
- `client/src/hooks/useReallocationCommit.ts`
- `client/src/hooks/useReallocationPreview.ts`
- `client/src/lib/reallocation-utils.ts`
- `client/src/types/reallocation.ts`
- `docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md`
- `docs/PORTFOLIO_TABS_ARCHITECTURE.md`
- `docs/components/reallocation-tab-implementation.md`
- `docs/fund-allocation-phase1b.md`
- `docs/reallocation-api-quickstart.md`
- `server/routes/dual-forecast.ts`
- `server/routes/reallocation.ts`
- `server/services/allocation-write-service.ts`
- `tests/config/testcontainers-test-paths.mjs`
- `tests/integration/reallocation.pg.test.ts`
- `tests/unit/components/portfolio/reallocation-tab.test.tsx`
- `tests/unit/routes/dual-forecast-route.test.ts`
- `tests/unit/routes/reallocation.contract.test.ts`
- `tests/unit/server/route-surface-inventory.test.ts`

**Plan**: `docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md`

---

## Executive Summary

PR 1 implements C3 row-scoped reallocation concurrency and C8 dual-forecast
error redaction. Five review findings were addressed across iterative rounds; no
blocking findings remain.

APPROVED with observations

---

## Changes Overview

Reallocation requests now carry per-company expected versions, lock and update
only proposed rows, preserve omitted caps, and return deterministic row-scoped
conflict, version, and audit data. Client preview and commit state is fenced by
generation and fingerprint, including invalid input, resets, fund changes, stale
callbacks, and pending mutation observers. Dual-forecast responses now redact
internal failure details while retaining stable response codes.

---

## Findings

### Critical Issues

- **Concurrent allocation-cap overwrite — Addressed.** The tab previously resent
  a selected company’s stale cap, allowing a retry with a refreshed version to
  overwrite a concurrent cap change. Proposals now omit caps at
  `client/src/components/portfolio/tabs/ReallocationTab.tsx:73-85`; omitted caps
  are preserved by `server/routes/reallocation.ts:586-594`; payload assertions
  are cap-free at
  `tests/unit/components/portfolio/reallocation-tab.test.tsx:190-203`.

- **Blank or invalid allocation retained a committable preview — Addressed.**
  Invalid raw input previously failed to notify the parent, leaving the previous
  proposal active. Invalid state now propagates at
  `client/src/components/portfolio/tabs/CompanySelectionTable.tsx:73-95`,
  invalidates stored preview state at
  `client/src/components/portfolio/tabs/ReallocationTab.tsx:112-116`, and is
  covered at
  `tests/unit/components/portfolio/reallocation-tab.test.tsx:329-350`.

### Major Issues

- **Fund switch retained hidden selection and input state — Addressed.** Fund
  changes now clear selections, preview, reason, and mutation state at
  `client/src/components/portfolio/tabs/ReallocationTab.tsx:93-110`; the company
  table is remounted per fund. Cross-fund behavior is covered at
  `tests/unit/components/portfolio/reallocation-tab.test.tsx:422-499`.

- **Late fund-A callbacks could mutate a fund-B draft — Addressed.** Preview
  callbacks are generation/fingerprint-fenced at
  `client/src/components/portfolio/tabs/ReallocationTab.tsx:151-191`; commit
  callbacks are generation-fenced at
  `client/src/components/portfolio/tabs/ReallocationTab.tsx:238-271`. Successful
  commit invalidation remains bound to the originating fund at
  `client/src/hooks/useReallocationCommit.ts:21-33`.

- **Fund-A pending state disabled fund-B controls — Addressed.** Switching funds
  now resets both TanStack mutation observers at
  `client/src/components/portfolio/tabs/ReallocationTab.tsx:93-110`, detaching
  the old pending requests. The regression test proves fund B’s Preview control
  is enabled before either fund-A request resolves at
  `tests/unit/components/portfolio/reallocation-tab.test.tsx:450-464`.

### Minor Issues

None.

### Suggestions

- **Pre-existing reallocation 500 message disclosure — Accepted override and
  deferred.** Generic preview and commit failures still serialize raw exception
  messages at `server/routes/reallocation.ts:451-456` and
  `server/routes/reallocation.ts:675-679`. C8 is scoped to dual forecast;
  follow-up acceptance is recorded at `TODOS.md:211-229`.

- **Quarantined legacy scalar-contract test — Accepted override.**
  `tests/unit/reallocation-api.test.ts` remains environment-gated and obsolete;
  active contract and PostgreSQL suites are authoritative. Owner disposition is
  recorded at `TODOS.md:223-228` and
  `docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md:1166-1169`.

- **Matrix reseed and approval — Planned post-review work.** The anticipated
  source-hash mismatch is resolved only after the atomic green source commit
  through the sanctioned non-fresh reseed, scoped review, owner approval,
  validation, and render sequence at
  `docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md:1214-1217`.

---

## Checklist

- [x] 1. Functional Requirements — passed; C3 and C8 plan requirements
      implemented.
- [x] 2. Code Quality — passed.
- [x] 3. Architectural Compliance — passed.
- [x] 4. Error Handling — passed for scoped changes; pre-existing reallocation
      500 envelope deferred.
- [x] 5. Security — passed for scoped C8 redaction and existing authorization
      boundaries.
- [x] 6. Performance — passed; deterministic row ordering and bounded
      selected-row operations.

---

## Verdict

**APPROVED with observations**

All Critical and Major findings are addressed. Reported lint, typecheck,
client/server tests, Testcontainers, Phoenix truth, internal-economics, and web
build gates pass; the single matrix source-hash failure is an expected
pre-reseed state. Matrix reseed, scoped approval, owner confirmation, commit,
push, hosted CI, merge, release, and production proof remain separate
post-review actions.
