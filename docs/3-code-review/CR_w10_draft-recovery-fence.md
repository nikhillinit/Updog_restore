---
status: HISTORICAL
audience: both
last_updated: 2026-09-24
owner: '@nikhillinit'
---

# Code Review: Fund draft recovery fence (`needsServerHydration`)

**Review Date**: 2026-09-24

**Version**: 1.6.0 (package unchanged). Reviewed object: the three merged PRs
that introduced and repaired the recovery fence, read as one logical change:
#1567 `defd02073`, #1568 `293a88c02`, #1569 `feddcf403`. Live behaviour verified
against `main` at `bdbded543`, which is after the F_1.15.0 settlement refactor
(#1572) rewrote two of the touched files.

**Files Reviewed**:

- `client/src/stores/fundStore.ts` (merge fallback, `resolveCommand`,
  `prepareFundCommand` fence)
- `client/src/schemas/fund-workspace-schema.ts` (identity field)
- `client/src/hooks/useFundDraftSync.ts` (hydration effect, autosave gate,
  `retry`)
- `client/src/components/workspace/FundWorkspace.tsx` (`hydrateThenStartNew`)
- `client/src/pages/FundBasicsStep.tsx` (bootstrap replay under fence)
- `client/src/pages/fund-setup.tsx` (`recoveryBlocksEditing` gate)
- `tests/unit/components/workspace/fund-workspace.test.tsx`
- `tests/unit/hooks/useFundDraftSync-canonical.test.tsx`
- `tests/unit/pages/fund-basics-bootstrap.test.tsx`
- `tests/unit/pages/fund-setup-draft-sync.test.tsx`
- `tests/unit/stores/fund-workspace-envelope.test.tsx`
- `tests/e2e/fund-workspace-real-backend.spec.ts` (read only, not run)

**Plan**: no plan — unplanned change. This is the manual `/TRIP-review` audit
path; the three PRs shipped without a `docs/3-code-review/` record. Neighbouring
unplanned PRs #1566 (a11y headings), #1570 (CI test-full lanes) and #1571 (D13
wizard journeys) also lack review records and are out of scope here.

---

## Executive Summary

The change adds a persisted boolean, `needsServerHydration`, to the fund
workspace identity. The store sets it when session storage held a valid identity
but invalid form values, so the tab recovers the draft id, ETag and any pending
command while discarding local values. While the fence is set, new writes are
refused, autosave is suspended, the wizard hides step content, and the server
snapshot is fetched before editing resumes. The exact pending command may still
replay. Verdict: **APPROVED with observations**.

---

## Changes Overview

`fundStore.merge` now runs the full envelope parse first and falls back to the
identity-only parse, setting the fence when a draft id or pending command
survives. `prepareFundCommand` throws `FUND_DRAFT_HYDRATION_MESSAGE` for a fresh
command while fenced, and `resolveCommand` keeps the fence alive only while a
draft id exists. The sync hook re-runs its hydration effect while fenced even
after a prior verify, applies the server snapshot unconditionally when fenced,
and blocks the autosave subscription. `FundWorkspace` fetches the server draft
before "start new" when fenced, and `fund-setup.tsx` replaces the step body with
a "Recover the saved draft before editing" notice while navigation is disabled.
#1572 later moved the save path into `services/fund-draft-settlement.ts`; the
fence now reaches the hook through the `saved` outcome's `needsHydration` field
(`useFundDraftSync.ts:143`) and the shared `applyDraftSnapshot` clears it.

---

## Findings

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

1. **Workspace dialog has no exit when the fenced fund's draft is gone.**
   `client/src/components/workspace/FundWorkspace.tsx:341-353`. When
   `needsServerHydration` is set with no pending command, the "Save draft and
   start new" button only calls `hydrateThenStartNew`, so a `NO_ACTIVE_DRAFT`
   response (fund already finalized) surfaces as a dialog error and
   `startNewFund` never runs. The "Discard and start new" label is only shown
   when `draftFundId` is null, which a fenced session never is. The wizard page
   does offer an exit for this state (`fund-setup.tsx:346-367`, "Start a new
   fund" under the missing-draft alert), so the user is not stuck, only
   misdirected. Disposition: open. Suggested fix: treat `isMissingDraftError` in
   the fence branch as "nothing to save" and start the new session.

2. **No changelog or architecture note for the fence.** `CHANGELOG.md` has no
   entry for #1567, #1568 or #1569, and the F_1.15.0 paragraph in
   `docs/ARCHI.md` section 5 describes the settlement module without mentioning
   that recovery is gated by `needsServerHydration`. The field is persisted in
   the envelope schema, so it is now part of the client storage contract.
   Disposition: open; one sentence in ARCHI section 5 plus three changelog
   lines.

3. **Commit titles for #1568 and #1569 are not conventional commits.**
   `Codex/pr1567 draft recovery repairs` and
   `Claude/fundworkspace hydration error 0uhiou` are branch names, not
   `fix(client): ...` subjects. Historical; nothing to change now, noted so the
   pattern is not repeated on squash merge.

### Suggestions

1. **`hydrateThenStartNew` does work that `startNewFundSession` discards.** Both
   fence branches in `FundWorkspace.tsx` (no-pending at line 341 and `saved`
   with `needsHydration` at line 371) fetch the draft, apply the snapshot, then
   immediately call `startNewFund`, which replaces the whole store with fresh
   identity. Nothing reads the hydrated values in between. The fetch adds a
   round trip and a failure path that can block starting a new fund when there
   are no local edits to lose. Going straight to `startNewFund` after the save
   is confirmed would also remove Minor 1. Kept as a suggestion because the
   current shape is tested and the extra read is cheap at this scale.

2. **Adjacent open item, not introduced here.** #1567 moved `pendingCommand`
   from a `getState()` read into the hook's selector tuple and added it to the
   hydration effect's dependency list. The effect still returns early once the
   fund is verified, so this did not create the false "Save not confirmed" alert
   tracked in `TODOS.md` (observed 2026-09-22, before #1567 merged). That item
   stays where it is.

---

## Checklist

Criteria: `.claude/skills/TRIP-review/checklist.md`.

- [x] 1. Functional Requirements — passed. Fence set only from the identity-only
      fallback; replay of the exact pending command allowed; autosave, wizard
      editing and fresh commands blocked; server snapshot applied on retry. Each
      behaviour has a unit test.
- [ ] 2. Code Quality — passed with caveats. `fundStore.ts` is about 1,400 lines
      and the sync hook about 470; both pre-date this change. Two merge titles
      are not conventional commits (Minor 3).
- [x] 3. Architectural Compliance — passed. Fence lives in the identity slice of
      the envelope with a `.default(false)`, so pre-fence envelopes still parse.
      Command replay semantics from ARCHI section 5 preserved. #1572 folded the
      write path into the settlement module without changing the fence contract.
- [ ] 4. Error Handling — passed with one open observation. Hydration failure
      after a confirmed save uses distinct wording from a save failure (#1569).
      Fetch failures under the fence keep the recovery controls visible. See
      Minor 1 for the one dead end.
- [x] 5. Security — not applicable. No new inputs cross a trust boundary; the
      fence only narrows client-side writes.
- [x] 6. Performance — passed. One extra draft read per fenced recovery
      (Suggestion 1). Subscriptions are torn down on effect cleanup.

Approval gate:

- Functional requirements implemented: yes, per PR bodies and tests.
- No critical or major issues: yes.
- Build successful: `CI Gate Status` is `SUCCESS` on #1567, #1568 and #1569 (not
  re-run locally).
- Affected unit tests pass: yes, on `bdbded543`:

  ```text
  Test Files  5 passed (5)
       Tests  141 passed (141)
  ```

  Command:
  `TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native` over
  the five unit files listed above. The first attempt failed with
  `Cannot read properties of null (reading 'useEffect')` from a stale worktree
  `node_modules`; `npm ci` fixed it. The e2e spec
  `fund-workspace-real-backend.spec.ts` needs a live backend and was not run.

- New logic has test coverage: yes (fence set on invalid envelope, fence blocks
  `prepareFundCommand`, replay permitted, retry hydrates, wizard gate, workspace
  dialog under fence, rejected create clears fence).
- Documentation updated: no (Minor 2); accepted because this is a post-merge
  audit of code already on main, with the debt recorded above.

---

## Verdict

**APPROVED with observations**

The fence closes a real data-loss path: a tab recovering an identity-only
envelope could previously autosave default values over a populated server draft.
The design is small, persisted with a backward-compatible default, and fully
covered by unit tests that still pass after the F_1.15.0 refactor. Open items
are the workspace dialog dead end when the server draft is missing (Minor 1),
the missing changelog and ARCHI note (Minor 2), and the optional removal of the
pre-navigation hydrate (Suggestion 1). None block anything; fold them into the
next touch of `FundWorkspace.tsx`. The documentation minimum in the approval
gate is unmet and accepted for the same reason: the code shipped before this
audit, and the gap is tracked as Minor 2.
