---
status: HISTORICAL
audience: both
last_updated: 2026-09-24
owner: '@nikhillinit'
---

# Code Review: D13 wizard journeys on the real fund store

**Review Date**: 2026-09-24

**Version**: 1.6.0 (package unchanged). Reviewed object: PR #1571, merge commit
`707d99035`. Live behaviour verified against `main` at `bdbded543`.

**Files Reviewed**:

- `client/src/pages/fund-setup.test.tsx`
- `tests/unit/pages/fund-basics-bootstrap.test.tsx`
- `tests/unit/pages/fund-basics-evergreen.test.tsx`
- `tests/unit/pages/investment-rounds-step-v2-qa.test.tsx`
- `tests/unit/pages/review-step-draft-failure.test.tsx`
- `tests/unit/pages/review-step-finalize.test.tsx`

**Plan**: D13 of the stabilize-and-qualify roadmap. The design doc lives outside
the repository; there is no `docs/1-plans/` entry. Manual `/TRIP-review` audit;
the PR shipped without a `docs/3-code-review/` record.

---

## Executive Summary

Six wizard journey suites stop faking `@/stores/fundStore` and
`@/stores/useFundSelector` with hand-maintained state objects and instead bind a
test actor to the real store, seed it with `setState`, and reset and unbind
after each test. All 60 existing journey cases are preserved and assertions move
from "the setter mock was called" to "the store holds the value". No product
code changes. Verdict: **APPROVED**.

---

## Changes Overview

Each suite now calls `resetFundWorkspace()`, awaits
`bindFundWorkspaceActor(...)`, then seeds fields; `afterEach` unbinds, which
also clears the session-storage envelope so the next test cannot rehydrate a
previous test's identity. Storage-failure cases replace the `persistenceFailed`
flag on the fake with a `Storage.prototype.setItem` spy that throws, exercising
the real `guardedSessionStorage` path. Finalize assertions capture the pending
command at dispatch time and compare against the key the mocked service
received. `review-step-finalize` gains two behavioural checks the fakes could
not express: the publish button re-enables when sync settles, and a successful
finalize rotates `sessionId` and clears the draft. This is the same fake-drift
class that broke `main` in #1562 and that #1570 fixed for the integration test;
this change removes the remaining unit-level instances except one declared
non-goal (a focused logout store mock).

---

## Findings

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

None.

### Suggestions

1. **Shared seeding helper.** Five of the six suites open with the same
   `resetFundWorkspace` / `bindFundWorkspaceActor` / `setState` block and the
   same `cleanup` / `restoreAllMocks` / `unbind` tail. A ten-line helper in
   `tests/utils/` would make the next migration a one-line change. Left as a
   suggestion because the PR's non-goals excluded shared fixture changes and the
   duplication is inert.

2. **`stateBeforeSubmit` relies on object identity.** Two finalize tests capture
   `fundStore.getState()` before render and pass it to `toHaveBeenCalledWith`.
   That matcher compares structurally, so it holds, but a reader may assume
   identity. A comment or `expect.objectContaining` on the fields that matter
   would make the intent explicit.

---

## Checklist

Criteria: `.claude/skills/TRIP-review/checklist.md`.

- [x] 1. Functional Requirements — passed. 60 journey cases preserved, three new
      assertions added, no product code touched.
- [x] 2. Code Quality — passed. Net 206 lines removed; the remaining repetition
      is the per-suite seeding block (Suggestion 1).
- [x] 3. Architectural Compliance — passed. Matches the actor-bound store
      contract that `app-layout.tsx` uses in production and the pattern #1570
      set for the integration test.
- [x] 4. Error Handling — passed. Storage failure and rejected-command paths now
      run through the real store instead of a flag on a fake.
- [x] 5. Security — not applicable.
- [x] 6. Performance — passed. Each suite binds once per test; the eight-file
      batch including these six ran in normal time locally.

Approval gate:

- Functional requirements implemented: yes.
- No critical or major issues: yes.
- Build successful: `CI Gate Status` is `SUCCESS` on #1571; the `main` run for
  `707d99035` is `success`.
- Affected unit tests pass: yes, on `bdbded543`, the six suites ran locally as
  part of an eight-file batch (332 passed).
- New logic has test coverage: not applicable; the change is test code.
- Documentation updated: not applicable.

---

## Verdict

**APPROVED**

Test-only change that removes the last unit-level sibling fakes of the fund
store and replaces mock-call assertions with state assertions. Nothing is open.
The optional shared helper can wait for the next suite that needs the same
setup.
