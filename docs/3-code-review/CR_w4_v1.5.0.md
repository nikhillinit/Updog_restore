# Code Review: boot-proof clean-room documentation and regression assertions (main working tree)

**Review Date**: 2026-08-19 **Version**: 1.5.0 **Files Reviewed**:

- `audit/surface-contract-matrix/README.md` (+8 lines)
- `tests/regressions/ci-fail-closed.test.ts` (+8 lines)

**Plan**:
`docs/superpowers/plans/2026-08-19-pr-1385-canary-residue-reconciliation.md`
(which mandates, line 26: "Implement only in
`/Users/nikhil/code/Updog_restore/.worktrees/child-f`") **Changelog**: no
related entry in `docs/2-changelog/` (grep for boot-proof/clean-room: no hits)

---

## Executive Summary

The uncommitted diff in the main checkout adds README documentation and four
regression-test assertions describing a clean-room worktree wrapper in
`audit/surface-contract-matrix/scripts/boot-proof.mjs` — but that implementation
exists only on the unmerged branch `feat/child-f-g4-readiness`, not on `main`.
The new test code also references an undefined `fs` binding, so the affected
regression test fails with a `ReferenceError` before any assertion runs.
Verdict: **NEEDS REVISION**.

---

## Changes Overview

Two tracked files carry hand-copied fragments of `feat/child-f-g4-readiness`
content: a README paragraph describing the boot-proof clean-room invocation
contract (snapshot manifests, detached worktree at HEAD, guarded
`--internal-clean-room`, atomic copy-back, fail-closed fingerprint checks), and
four `toContain` assertions in the
`fails closed on exact-SHA and provider identity proof before promotion` test
binding the regression suite to the clean-room implementation strings. No
implementation change accompanies them on this branch.

---

## Findings

### Critical Issues

None.

### Major Issues

1. **Undefined `fs` binding — test fails with ReferenceError** —
   `tests/regressions/ci-fail-closed.test.ts:4574`. The file imports named
   helpers from `node:fs/promises` only (line 2); there is no `fs` default
   import. The branch source this was copied from uses `await readFile(...)` —
   the copy was mangled to `fs.readFileSync` in transcription. Verified by
   targeted run:
   `TZ=UTC npx vitest run tests/regressions/ci-fail-closed.test.ts --project=server -t 'fails closed on exact-SHA...'`
   → `1 failed`, `ReferenceError: fs is not defined`. Disposition: open.
2. **Assertions target strings absent from this branch's implementation** —
   `tests/regressions/ci-fail-closed.test.ts:4578-4581`. `boot-proof.mjs` on
   `main` (1,097 lines) contains zero occurrences of `clean`, `worktree`,
   `--internal-clean-room`, or `SURFACE_BOOT_PROOF_INTERNAL_CLEAN_ROOM`
   (verified via grep; `origin/main` likewise). The implementation exists only
   on unmerged `feat/child-f-g4-readiness` (line 4880 of that branch's copy of
   this test). Fixing the `fs` import would still leave the test red on `main`.
   Disposition: open.
3. **README documents unimplemented behavior and diverges from the branch's own
   wording** — `audit/surface-contract-matrix/README.md:51-58`. The paragraph
   describes runtime behavior `main`'s `boot-proof.mjs` does not have (e.g.,
   "Direct `--internal-clean-room` use fails" — the flag is simply unknown on
   `main`). The wording is a paraphrase of, not identical to, the branch's
   README hunk, and the working tree omits the branch's second README hunk
   (regeneration-commands section), so merging `feat/child-f-g4-readiness` will
   conflict or silently diverge here. Disposition: open.

### Minor Issues

1. **Plan isolation rule violated** — the governing plan (line 26) requires
   implementing only in `.worktrees/child-f`; these edits sit in the main
   checkout's working tree. Consistent with the known shared-worktree collision
   failure mode. Disposition: open.

### Suggestions

1. Discard both working-tree hunks in the main checkout
   (`git checkout -- audit/surface-contract-matrix/README.md tests/regressions/ci-fail-closed.test.ts`)
   and let `feat/child-f-g4-readiness` land the documentation, assertions, `fs`
   import, and implementation atomically. Do not fix-forward on `main` — the
   assertions cannot pass without the implementation.

---

## Checklist

Per `.claude/skills/TRIP-review/checklist.md`:

- [ ] 1. Functional Requirements — failed: asserted and documented behavior does
      not exist on this branch (Major 2, Major 3)
- [ ] 2. Code Quality — failed: undefined `fs` reference, runtime error in test
      code (Major 1)
- [ ] 3. Architectural Compliance — failed with caveat: no ARCHI.md pattern
      violated, but doc/test/implementation atomicity is broken across branches
      and the plan's worktree-isolation rule was bypassed (Minor 1)
- [x] 4. Error Handling — not applicable: no runtime error paths introduced
      beyond test assertions
- [x] 5. Security — passed: no security surface touched
- [x] 6. Performance — passed: negligible (one file read inside a test)

---

## Verdict

**NEEDS REVISION**

**Post-review verification (2026-08-19, agent run in `.worktrees/child-f` at
`b37e67d29`)**: the branch's copy of the test uses `await readFile` from
`node:fs/promises`, and its `boot-proof.mjs` contains the clean-room
implementation (`SURFACE_BOOT_PROOF_INTERNAL_CLEAN_ROOM` line 1112,
`--internal-clean-room`, worktree add/remove pair) — the clean-room assertions
themselves are satisfiable there. Note: the same named test is currently red on
the branch on an orthogonal assertion
(`not to contain 'cohortCalculationInvoked'` at line 4775, against committed
`release-proof.yml`), consistent with the known-red characterization state
expected to clear at Task 11 — separate from the findings above.

This diff is a partial hand-copy of unmerged `feat/child-f-g4-readiness` content
into the main checkout. Committing it to `main` would break the required
`ci-fail-closed` regression suite (proven red: ReferenceError at line 4574, and
string assertions unsatisfiable against `main`'s `boot-proof.mjs`) and introduce
documentation for behavior that does not exist on the deployed branch. The
correct resolution is reverting these two files in the main working tree; the
same content ships correctly and atomically when the child-f branch merges. No
override was applied; all findings remain open pending the owner's decision to
revert.

**Resolution note (2026-08-19, post-review)**: both working-tree hunks were
reverted externally (not by this review session — `git status` now shows both
files clean at `main @ de932a2af`). The reviewed diff no longer exists in the
working tree; findings are resolved by removal. This record stands as the audit
trail.
