---
status: HISTORICAL
audience: both
last_updated: 2026-09-24
owner: '@nikhillinit'
---

# Code Review: F_1.15.1 bootstrap save confirmation plan

**Review Date**: 2026-09-24

**Version**: 1.6.0 (package unchanged). Reviewed object: plan commit `a25d0f567`
on `claude/trip-1-plan-review-2dacd6`, a documentation-only change adding
`docs/1-plans/F_1.15.1_bootstrap-save-confirmation.plan.md`. No source files
changed. Findings were verified against `origin/main` at `9e552f0ac`.

**Files Reviewed**:

- `docs/1-plans/F_1.15.1_bootstrap-save-confirmation.plan.md` (the change)
- `client/src/pages/FundBasicsStep.tsx` (Next guard, local error render)
- `client/src/hooks/useFundDraftSync.ts` (retry guard, outcome arms)
- `client/src/stores/fundStore.ts` (`prepareFundCommand` pending reuse)
- `client/src/services/fund-workflow.ts` (retry contract)
- `docs/governance/solo-internal-change-and-production-policy.md` (merge gate)

**Plan**: `docs/1-plans/F_1.15.1_bootstrap-save-confirmation.plan.md`

---

## Executive Summary

A manual review of the F_1.15.1 plan found two Major and two Minor design gaps
before implementation started: a double-dispatch window between Next and "Check
save status", stale step-local uncertainty text after a terminal replay,
misplaced evidence, and a loose admission order. All four are addressed in the
plan revision committed with this record. NEEDS REVISION as submitted; the
revised plan was re-reviewed by Codex (thread
`01a0d46f-3aaa-7771-961c-dc9154d2b230`) and is APPROVED with observations.

---

## Changes Overview

The plan finishes a local candidate that suppresses a false "Save not confirmed"
alert during the Fund Basics bootstrap save, and adds the missing store
`uncertain` transition in the two direct `saveDraftAndSettle` callers. Scope is
client-only: settlement module, autosave hook, Fund Basics step, workspace
dialog, two unit suites, and `TODOS.md`.

---

## Findings

### Critical Issues

None.

### Major Issues

1. **Overlapping saves can recreate the false alert.**
   `client/src/pages/FundBasicsStep.tsx:483` (Next guarded only by local
   `bootstrapStage`), `client/src/hooks/useFundDraftSync.ts:110` (retry guarded
   only by hook-local `saveInFlightRef`), `client/src/stores/fundStore.ts:1415`
   (`prepareFundCommand` reuses the pending key, body, and ETag). After an
   uncertain outcome both controls are live and can dispatch the same command
   concurrently. Disposition: addressed. The plan now uses the candidate's
   registry (`isDraftSaveInFlight`) as the shared guard in the Next handler and
   in `persistCurrentDraft`, and the mounted-shell case asserts one PUT while
   the replay is held.
2. **Terminal replay leaves contradictory text.** The submitted plan cleared the
   step-local "Save not confirmed" message only when `draftServerReady` became
   true; a replay ending `stale` or `rejected` never sets it, so the old message
   would sit beside the shell's terminal alert. Disposition: addressed by
   deletion. The Fund Basics `uncertain` arm no longer writes a local message;
   the FundSetup shell's `draft-uncertain` alert owns the text and clears on
   every later status. The existing unit test that asserted the local text moves
   to a store-status assertion, and `stale`/`rejected` replay variants are added
   to the mounted harness. The plan's description of `retry_same_key` was also
   corrected: it retains the pending command
   (`client/src/services/fund-workflow.ts:45`).

### Minor Issues

3. **Evidence placement.** The no-alert supersession assertion was specified in
   a test that renders Fund Basics without the shell, where no alert can appear;
   and the batch-b journey replays after a reload, so it cannot prove same-mount
   behaviour. Disposition: addressed. The alert assertion moves to a
   mounted-shell sibling; batch-b is labelled replay-contract evidence and the
   mounted regression is named as the acceptance.
4. **Admission order.** Phase 3 said "hosted CI" without naming the gate, and
   the documentation edits and TODO deletion were unsequenced. Disposition:
   addressed. The plan now requires `CI Gate Status` success on the exact final
   head (policy: sole aggregate merge gate), places the `docs/ARCHI.md` and
   F_1.15.0 banner edits before that run, restores the TODO right after the
   cherry-pick, and deletes it only in the acceptance-green commit.

5. **Raised by Codex on the revision (P1): Next-first terminal replay.** With
   Next still able to replay from `uncertain`, a terminal outcome on that path
   would leave the shell status falsely `uncertain`. Disposition: addressed.
   Next is disabled while the store status is `uncertain`, so the shell's "Check
   save status" (hook `retry`) is the only dispatcher out of uncertainty and its
   arms already write every terminal status; the mounted case asserts Next
   disabled during uncertainty and enabled after the acknowledged replay.

### Suggestions

- The candidate baseline run (five client suites, 121 passed) shows two React
  `act(...)` warnings in the workspace suite the plan extends. Clear them while
  touching that test; not a gate.

---

## Checklist

- [ ] 1. Functional Requirements — passed with caveats: plan-level review; the
      two Major findings were requirement gaps in the plan, now closed.
- [x] 2. Code Quality — not applicable (no source change in the reviewed
      object).
- [x] 3. Architectural Compliance — passed: caller-owned status per
      `docs/ARCHI.md` section 5 preserved; shared guard reuses existing
      registry, no new state.
- [ ] 4. Error Handling — passed with caveats: terminal replay outcomes were
      unhandled in the presentation plan; addressed by removing the local
      message.
- [x] 5. Security — not applicable; candidate SHA kept out of tracked docs
      (public repository).
- [x] 6. Performance — not applicable.

---

## Verdict

**NEEDS REVISION** as submitted at `a25d0f567`; **APPROVED with observations**
after the revision in the same branch.

The revision replaces the earlier "clear on server-ready" effect with removal of
the step-local uncertainty message, which also retires one Codex round-1 fix.
The one-PUT guard and the terminal replay variants are now acceptance items in
the plan, so TRIP-2 must show them red-first on the cherry-picked candidate.
Nothing here grants merge, deploy, or production authority.
