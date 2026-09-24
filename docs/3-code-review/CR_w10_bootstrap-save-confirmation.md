---
status: HISTORICAL
audience: both
last_updated: 2026-09-24
owner: '@nikhillinit'
---

# Code Review: F_1.15.1 bootstrap save confirmation

**Review Date**: 2026-09-24

**Version**: 1.6.0 (package unchanged). Reviewed object: commit `b79f64358`
(`fix(client): confirm uncertain bootstrap draft saves`) on
`codex/bootstrap-save-f1151`, three commits ahead of `origin/main` at
`9e552f0ac`; the two preceding commits carry the approved plan and its plan
review and are byte-identical in `docs/` to the reviewed plan commits. The
reviewed tree is clean and unpushed. This is an independent manual audit of the
implementation, separate from the in-loop Codex review that produced it.

**Files Reviewed**:

- `client/src/services/fund-draft-settlement.ts` (live-save registry,
  `isDraftSaveInFlight`)
- `client/src/hooks/useFundDraftSync.ts` (registry-guarded recovery effect,
  shared guard in `persistCurrentDraft`, timer consumption, dead export removed)
- `client/src/pages/FundBasicsStep.tsx` (store `uncertain` write, local message
  removed, Next guard and disable)
- `client/src/components/workspace/FundWorkspace.tsx` (store `uncertain` write)
- `tests/unit/pages/fund-basics-bootstrap.test.tsx` (mounted real `FundSetup`
  shell coverage, timer control, terminal replays, supersession)
- `tests/unit/components/workspace/fund-workspace.test.tsx` (dialog status,
  replay identity, supersession variants)
- `TODOS.md`, `docs/ARCHI.md`,
  `docs/1-plans/F_1.15.0_fund-draft-command-settlement.plan.md`,
  `docs/1-plans/F_1.15.1_bootstrap-save-confirmation.plan.md` (documentation
  edits named by the plan)

**Plan**: `docs/1-plans/F_1.15.1_bootstrap-save-confirmation.plan.md`

---

## Executive Summary

The change finishes the live-save registry candidate and makes the two direct
`saveDraftAndSettle` callers publish `uncertain` through the fund store, so the
mounted FundSetup shell owns recovery alerts and terminal replay state. Every
plan item is present, the shared dispatch guard closes the double-PUT window,
and an additional expired-debounce duplicate found during implementation is
fixed with its own red-to-green regression. Verified locally in this audit: the
five focused client suites (128 passed, no `act(...)` warnings), `npm run check`
(0 new errors), ESLint on all six changed files, `git diff --check`, and the
changed-path classifier (`financialCalcRelevant: false`,
`heavyCiRelevant: true`). APPROVED with observations; source admission still
requires `CI Gate Status` on this exact head.

---

## Changes Overview

Source diff is small and matches the plan mechanism: a module-local `Set` of
live saves keyed by session and full command identity, consulted by the hook's
recovery effect (no false `uncertain` while a PUT is live), by
`persistCurrentDraft`, and by the Fund Basics Next handler (one dispatcher at a
time). Fund Basics and the workspace dialog write `uncertain` to the store
synchronously in their outcome callbacks; Fund Basics drops its step-local
uncertainty text and disables Next while the store status is `uncertain`, so the
shell's "Check save status" is the only exit from uncertainty.
`persistCurrentDraft` now consumes the pending debounce timer before either
in-flight guard returns, so a fired timer cannot be re-flushed by the
step-change effect. Tests add a real-shell harness (wouter mock gains
`useSearch`), the held-replay/one-PUT journey, `stale` and `rejected` replay
variants, supersession controls in both suites, and a fake-timer control for the
expired-debounce case.

---

## Findings

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

1. **Stale queued-save flag on the registry-guard path.**
   `client/src/hooks/useFundDraftSync.ts:117-124` sets `queuedSaveRef` when the
   other dispatcher (Next) owns the live PUT, but only the hook's own `finally`
   consumes that flag. When Next's save completes and navigates, the flag stays
   set until the hook's next own save, whose follow-up `persistCurrentDraft`
   then short-circuits on the last-saved signature without a PUT. Disposition:
   accepted; no extra write is possible (the signature check guards it) and the
   mounted one-PUT and step-change tests cover the observable behaviour. Worth a
   one-line comment in a future hook touch.
2. **TODOS.md evidence points at untracked local files.** The new "Duplicate
   autosave after a fast direct bootstrap save" entry cites
   `fast-debounce-*.log` and a diagnostic patch that are not in the repository
   (the tree is clean). The reproduction recipe in the same entry is complete
   enough to rebuild them. Disposition: accepted; the entry correctly scopes the
   defect as pre-existing on `origin/main` and outside this repair.

### Suggestions

- `client/src/services/fund-draft-settlement.ts:73` reads
  `fundStore.getState().pendingCommand!` after `prepareFundCommand`. The
  non-null assertion is sound (`beginCommand` ran and the storage-failure path
  threw earlier) and lint accepts it; returning the pending command from
  `prepareFundCommand` would remove the assertion if that helper is touched
  again.
- `persistCurrentDraft` now clears the debounce timer before the "already saved,
  set `synced`" early return. Behaviour-neutral (the timer callback is the
  caller), noted so a future reader does not read it as a scheduling change.
- The plan file was updated in the implementation commit (to-dos ticked, local
  validation record, the review-found duplicate). Consistent with the F_1.15.0
  precedent; Phase 3 items remain open pending hosted CI.

---

## Checklist

- [x] 1. Functional Requirements — passed: all plan sections 1-4 implemented;
      acceptance journey (held save, no false alert, same-mount `uncertain`, one
      PUT with replay held, identical replay identity, `synced` without
      navigation, Next-then-navigate without a new save) is asserted against the
      real `FundSetup` shell.
- [x] 2. Code Quality — passed: 23 net source lines, no new state beyond the
      registry, dead `STORAGE_UNAVAILABLE_MESSAGE` removed, ESLint clean at
      `--max-warnings 0`.
- [x] 3. Architectural Compliance — passed: caller-owned status per
      `docs/ARCHI.md` section 5 preserved; helper contract and outcome union
      unchanged; ARCHI note updated in the same commit.
- [ ] 4. Error Handling — passed with caveat: terminal replay outcomes (`stale`,
      `rejected`) are covered; the stale queued flag (Minor 1) is benign but
      undocumented in code.
- [x] 5. Security — passed: no wire, schema, or auth change; candidate SHA
      absent from tracked docs; classifier reports no financial-calculation
      relevance.
- [x] 6. Performance — passed: registry scan is over a set that holds at most
      one entry per live PUT; entries removed in `finally`.

Approval gate (`checklist.md`): functional requirements complete; no critical or
major issues; typecheck green; affected suites green (128/128 rerun here;
16,725-test `npm test`, `validate:core`, Preact build and PostgreSQL batch-b
journey reported by the implementer, not rerun in this audit); new logic has
direct coverage; documentation updated per the plan's Documentation Impact.

---

## Verdict

**APPROVED with observations**

The implementation is admissible on local evidence. Hosted `CI Gate Status` on
exact head `b79f64358` (heavy lanes activate: `heavyCiRelevant: true`) is still
required before merge, per the governing policy; no earlier run qualifies. The
pre-existing fast-save duplicate stays in `TODOS.md` and is not a condition of
this change. Merge, deploy, and production remain owner actions.
