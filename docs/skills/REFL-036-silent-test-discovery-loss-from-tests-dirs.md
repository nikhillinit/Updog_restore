---
id: REFL-036
title: Silent Test Discovery Loss From __tests__ Directories Outside tests/unit/
severity: high
category: Test Infrastructure
discovered: 2026-04-07
tags:
  [
    test-discovery,
    vitest-config,
    silent-failure,
    dead-code,
    prevention-gate,
    scoping,
  ]
error_codes: []
last_updated: 2026-04-07
---

# REFL-036: Silent Test Discovery Loss From **tests** Directories Outside tests/unit/

## Anti-Pattern

Test files placed in `__tests__/` directories outside `tests/unit/` are silently
skipped by the root vitest config (which only includes `tests/unit/**`
patterns). Authors edit these files thinking they are live; they have not run
for the lifetime of the orphaning. The failure compounds because there is no
error message - vitest just does not discover the files.

## What Happened

In October 2025 the repo migrated from per-directory `__tests__` to centralized
`tests/unit/`. The migration moved most files but left 13 in
`client/src/lib/__tests__/` AND ~20 other `__tests__` directories elsewhere in
the repo. Authors continued editing the orphaned files as recently as 2026-03-27
(per git log) thinking they were live tests. Phase A (commit `01b87889`) and
Phase C (commit `ef3672ee`) resurrected the `lib/` files, finding 3 real
production bugs surfaced by previously-dead tests.

## Detection

The symptom is vitest reporting `No test files found` when running an explicit
file path that exists on disk. Or, more insidiously, no symptom at all - the
dead file just never runs and authors never know. Two diagnostic commands:

1. Compare git log dates of files in `__tests__` directories against their last
   test run.
2. Run vitest with `--reporter=verbose` and look for missing file names.

## Prevention

The new pre-push gate at `scripts/check-orphan-tests.mjs` scans the diff for any
new files matching `__tests__/*.{test,spec}.{ts,tsx,js,jsx}` outside
`packages/*/src/`. If found, the push is blocked with a remediation hint.
Existing orphans are tolerated because the gate only inspects changed files, not
the whole repo. New orphans are caught at push time. To bypass for legitimate
package-level tests, place them under `packages/<name>/src/` which is allowed by
the gate.

## Outstanding Backlog

List of the ~20 still-orphaned `__tests__` directories that future sessions
should triage (resurrect, dedup, or delete):

- ai/eval/**tests**
- client/src/components/**tests**
- client/src/components/portfolio/tabs/**tests**
- client/src/components/portfolio/tabs/hooks/**tests**
- client/src/core/capitalAllocation/**tests**
- client/src/core/flags/**tests**
- client/src/core/reserves/**tests**
- client/src/core/reserves/adapter/**tests**
- client/src/core/selectors/**tests**
- client/src/lib/chart-theme/**tests**
- client/src/providers/**tests**
- client/src/services/**tests**
- client/src/utils/pdf/**tests**
- server/lib/auth/**tests**
- server/routes/**tests**
- server/services/**tests**
- server/utils/**tests**
- shared/utils/**tests**
- src/core/selectors/**tests**
- src/utils/**tests**

Each one needs the same Phase A/C treatment: diff against any sibling in
`tests/unit/`, decide between resurrect-as-is vs dedup vs delete-as-stale, fix
any test drift from production changes, commit. Reference Phase A commit
`01b87889` and Phase C commit `ef3672ee` as templates.

## Related

REFL-005 (stale test files with API mismatch) is a sibling failure mode. The
"Client Test File Placement" memory entry covers this topic but only for the
`lib/` slice.

## References

Commits `01b87889` (Phase A), `ef3672ee` (Phase C), and the current Phase D
commit. `scripts/check-orphan-tests.mjs` is the prevention point.
