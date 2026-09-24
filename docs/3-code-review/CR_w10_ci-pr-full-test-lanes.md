---
status: HISTORICAL
audience: both
last_updated: 2026-09-24
owner: '@nikhillinit'
---

# Code Review: Full test lanes on heavy pull requests

**Review Date**: 2026-09-24

**Version**: 1.6.0 (package unchanged). Reviewed object: PR #1570, merge commit
`95f5715b2`. Live behaviour verified against `main` at `bdbded543`.

**Files Reviewed**:

- `.github/workflows/ci-unified.yml`
- `tests/integration/wizard-to-results-e2e.test.ts`
- `tests/regressions/ci-fail-closed.test.ts`
- `tests/regressions/ci-unified-playwright-install.test.ts`

**Plan**: PR1 of the stabilize-and-qualify roadmap (design items D12 and D13).
The design doc lives outside the repository; there is no `docs/1-plans/` entry.
Manual `/TRIP-review` audit; the PR shipped without a `docs/3-code-review/`
record.

---

## Executive Summary

`main` had been red since #1562 because `wizard-to-results-e2e.test.ts` faked
`fundStore` with a `getState`-only object while `ReviewStep` had started calling
`prepareFundCommand` and reading identity fields. The break was admitted because
`test-full` only ran on `main`, schema changes, or an explicit dispatch. This
change makes the integration test use the real, actor-bound store, and makes
`test-full` run its `integration` and `validate-core` groups on every heavy pull
request, with `CI Gate Status` requiring both the affected lane and the full
lanes. Verdict: **APPROVED with observations**.

---

## Changes Overview

The `changes` job gains a `groups` step that emits `full_suite` and a JSON
`test_full_groups` list: all three groups for `main`, `run_full_suite`, or a
schema change; `integration` and `validate-core` otherwise. `test-full` now
admits `pull_request` events when `heavy_ci_relevant` is true, and its matrix is
`fromJSON(needs.changes.outputs.test_full_groups)`. The gate computes
`test_full_expected` from schema or heaviness and feeds it to the existing
`require_result` line. The heavy clause is scoped to `pull_request` because the
classify step forces heaviness on every `workflow_dispatch`. The two regression
suites pin the clause, the matrix expression, the gate line, and execute the
selector script in `bash` over a five-row truth table. The integration test now
binds a test actor, seeds the real store, and asserts the review step is
submittable before clicking.

---

## Findings

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

1. **Wall-clock cost is about ten times the estimate.** The PR left the measured
   delta as a pending acceptance item and estimated 10 to 25 seconds. On #1572,
   the first heavy pull request after this landed, the lanes ran in parallel
   with these spans:

   | Lane                 | Started  | Completed | Duration |
   | -------------------- | -------- | --------- | -------- |
   | Test (Affected Only) | 05:43:30 | 05:45:42  | 2m 12s   |
   | Test integration     | 05:44:06 | 05:47:43  | 3m 37s   |
   | Test validate-core   | 05:43:29 | 05:48:20  | 4m 51s   |

   The test critical path grows from about 2m 12s to about 4m 51s per heavy pull
   request. Acceptable for a team of five, but the estimate in the PR body is
   wrong and should not be reused. Disposition: recorded; no change.

2. **`e2e` stays off ordinary pull requests.** By design, but the PR title "run
   test-full lanes on heavy pull requests" reads as full coverage. A heavy pull
   request still gets no Playwright run until it merges to `main`. Disposition:
   recorded; the `groups` step comment states it.

### Suggestions

1. **The truth-table test shells out to `bash`.**
   `tests/regressions/ci-unified-playwright-install.test.ts` runs the selector
   script with `execFile('bash', ...)`. Fine on the ubuntu runners and on macOS;
   on a Windows checkout without `bash` on `PATH` the five cases fail for an
   environment reason. Guard with a `bash` availability check that skips, or
   document that the regression project expects a POSIX shell.

2. **Gate on `push` to `main` never requires `test-full`.** The
   `require_result "Test (full integration)"` line sits inside
   `if is_pr && run_full_suite != true`. Pre-existing and unchanged here; `main`
   still relies on the job's own red status rather than the gate. Worth a
   follow-up if the gate is meant to be the single authority.

---

## Checklist

Criteria: `.claude/skills/TRIP-review/checklist.md`.

- [x] 1. Functional Requirements — passed. Heavy pull requests run both groups,
      the gate requires both lanes, schema and `main` paths are unchanged, and
      the selector truth table executes the real script.
- [x] 2. Code Quality — passed. Workflow change is 34 lines; the test rewrite
      removes 45 lines of fake store and adds pre-assertions.
- [x] 3. Architectural Compliance — passed. Follows the gate
      authority-versus-reporting rule (no `continue-on-error` on the run step,
      pinned by the new test) and the fail-closed pattern.
- [x] 4. Error Handling — passed. `set -euo pipefail` in the selector; a skipped
      `test-full` on a heavy pull request fails the gate (truth table row
      `skipped` expects `failed`).
- [x] 5. Security — not applicable. No new secrets or permissions.
- [ ] 6. Performance — passed with caveat. Critical path per heavy pull request
      roughly doubles (Minor 1).

Approval gate:

- Functional requirements implemented: yes.
- No critical or major issues: yes.
- Build successful: `CI Gate Status` is `SUCCESS` on #1570. `main` runs for
  `95f5715b2`, `707d99035` and `eb9352108` are all `success`, so the pending
  "next `main` run must be green" acceptance is met.
- Affected unit tests pass: yes, on `bdbded543`, the two regression suites ran
  locally as part of an eight-file batch (332 passed). The integration test was
  not run locally; it needs the integration config and services, and the PR gate
  ran it.
- New logic has test coverage: yes, including an executable truth table for the
  selector.
- Documentation updated: no living document describes lane selection, and no
  document was found that now states the old behaviour as current; historical
  plans under `docs/superpowers/plans/` mention the old main-gated `test-full`
  in past-tense context. Nothing to update.

---

## Verdict

**APPROVED with observations**

The admission gap is closed and pinned by tests that execute the selector rather
than string-match it. The two observations are cost and scope: heavy pull
requests now pay about two and a half extra minutes, and `e2e` remains
`main`-only. Both are acceptable at this team's scale and both are now written
down.
