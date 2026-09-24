---
status: HISTORICAL
audience: both
last_updated: 2026-09-24
owner: '@nikhillinit'
---

# Code Review: Fund Draft Command Settlement (post-merge manual audit)

**Review Date**: 2026-09-24  
**Version**: 1.6.0 (package unchanged). Audited object: merge commit `eb9352108`
of PR #1572, the squash of `7192de975` (refactor) and `33ed13f48` (test
expectation correction), against base `707d99035`.  
**Files Reviewed**:

- `client/src/services/fund-draft-settlement.ts` (new)
- `client/src/hooks/useFundDraftSync.ts`
- `client/src/components/workspace/FundWorkspace.tsx`
- `client/src/pages/FundBasicsStep.tsx`
- `tests/unit/services/fund-draft-settlement.test.tsx` (new)
- `tests/unit/components/workspace/fund-workspace.test.tsx`
- `tests/unit/pages/fund-basics-bootstrap.test.tsx`
- `tests/unit/pages/fund-setup-draft-sync.test.tsx`
- `tests/e2e/fund-workspace-real-backend.spec.ts`
- `tests/e2e/fund-setup-workflow.spec.ts`
- `CHANGELOG.md`, `TODOS.md`, `docs/ARCHI.md`
- `docs/1-plans/F_1.15.0_fund-draft-command-settlement.plan.md`
- `docs/2-changelog/w10_fund-draft-command-settlement.md`
- `docs/3-code-review/CR_w10_fund-draft-command-settlement.md`
- `docs/_generated/router-fast.json`

**Plan**: `docs/1-plans/F_1.15.0_fund-draft-command-settlement.plan.md`

**Provenance**: This record is the manual fallback/audit path of
`.claude/skills/TRIP-review`, run independently of the Codex loop that produced
[CR_w10_fund-draft-command-settlement.md](CR_w10_fund-draft-command-settlement.md).
That file is HISTORICAL and is not modified. No review target was named, so the
audit target is the just-merged F_1.15.0 change. Criteria, severity scale, and
approval gate are those of `.claude/skills/TRIP-review/checklist.md`.

---

## Executive Summary

Three `save_draft` callers (wizard autosave hook, Fund Workspace dialog, Fund
Basics bootstrap) now dispatch through one settlement helper that prepares or
replays the command, fences the result on session, fund, and command key,
settles the store journal, and hands each caller one typed outcome in the same
turn. The eleven divergence rulings in the plan are implemented as written; the
two declared behavior changes (R5 canonical comparison, R9 silent superseded)
are present and tested. Two minor documentation and hygiene findings; nothing
functional. APPROVED with observations.

---

## Changes Overview

`saveDraftAndSettle` (`client/src/services/fund-draft-settlement.ts:24-109`)
owns the command lifecycle: wrong-fund and preparation failures become
`not_dispatched` without releasing a pre-existing command; the transport call
carries the prepared key and ETag; the post-await fence (`:70-75`) reports
`superseded` when the session, fund, or pending key moved; a confirmed save
advances the ETag, resolves the journal, and reports `newerEdits` by canonical
JSON (`:76-86`); stale and definitive rejections resolve the journal while
`uncertain` and `retry_same_key` keep the key (`:87-106`). `applyDraftSnapshot`
(`:111-121`) is the shared seven-field hydration patch and never writes
`draftSyncStatus`.

Callers keep only their continuation and switch exhaustively on `outcome.kind`
with a `never` default: `useFundDraftSync.ts:129-183`,
`FundWorkspace.tsx:358-405`, `FundBasicsStep.tsx:226-268`. The hook's queued
re-dispatch `finally` (`useFundDraftSync.ts:184-198`) and the dialog's
`setDialogSaving(false)` survive unchanged. A 26-case outcome table, 12 caller
regressions, and one real-backend interrupted-save replay journey were added.

---

## Findings

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

- **Changelog and Codex review misstate the Fund Setup spec as unchanged** —
  `docs/2-changelog/w10_fund-draft-command-settlement.md` (Verification) and
  `docs/3-code-review/CR_w10_fund-draft-command-settlement.md` (Suggestions,
  Checklist item 1) both say `tests/e2e/fund-setup-workflow.spec.ts` is
  unchanged and its `fundSize: 75` expectation is deferred. The merged diff
  changes that line to `fundSize: 75_000_000` (commit `33ed13f48`, "test:
  correct fund setup draft size expectation"), which is outside the plan's Files
  to Modify list; the plan to-do "diff for files outside the expected list" was
  ticked before the ride-along landed. The correction itself is right: it
  matches the whole-dollar contract from #1564, and the corrected spec passed in
  full during this audit (36 tests). **Disposition: open, documentation only.**
  Both documents are HISTORICAL, so the discrepancy is recorded here rather than
  edited there. Process note: name ride-along commits in the changelog before
  squash.
- **Dead export after the rewire** — `client/src/hooks/useFundDraftSync.ts:30`
  exports `STORAGE_UNAVAILABLE_MESSAGE`, whose only consumer was the removed
  preparation-error branch. No consumer remains under `client/` or `tests/`, and
  the `FUND_COMMAND_STORAGE_MESSAGE` import at `:6` exists only to feed it. The
  plan to-do covered unused imports, not exports. **Disposition: open.**
  One-line deletion, no behavior change; fold into the next touch of the hook.

- **Plan says `docs/ARCHI.md` changes are none; the merge adds 13 lines** —
  `docs/1-plans/F_1.15.0_fund-draft-command-settlement.plan.md:594-596`
  (Documentation Impact: "`docs/ARCHI.md` ... none") versus `docs/ARCHI.md`
  section 5 note in the merged diff. The PR description discloses the note; the
  plan, the w10 changelog Changes list, and the Codex review's Files Reviewed
  list do not, so the note landed without a recorded review. Content is
  accurate. **Disposition: open, documentation only.**
- **`router-fast.json` regeneration misdescribed** — the PR description says the
  file was "regenerated for the three new docs"; the merged diff changes only
  `generatedAt` (2026-09-16 to 2026-09-24) and adds no entries. The plan's rule
  was "commit it only if it changed", which a timestamp satisfies literally but
  not usefully. **Disposition: open, documentation only.**
- **Unstated-diff sweep (2026-09-24, post-merge)**: merged files not covered by
  the plan's expected-diff list are `tests/e2e/fund-setup-workflow.spec.ts`
  (undeclared, contradicts the PR's Explicit Non-Goals), `docs/ARCHI.md`
  (declared in the PR only), and the two TRIP-3 release records (changelog w10,
  CR_w10; declared in the PR, conventional). Four of seventeen merged files are
  absent from the Codex review's Files Reviewed list: those same four. Inside
  the declared files, every hunk maps to plan sections 1-4 or rulings R1-R11;
  the one edit to a pre-existing assertion
  (`fund-workspace-real-backend.spec.ts:557`, final as-of date now the replayed
  value) is a consequence of the added journey. Test-count claims (+26, +4, +7
  blocks, +1 case and +1 assertion) match the diff.

### Suggestions

- **Generated-file churn** — `docs/_generated/router-fast.json` changed by
  timestamp only. Exclude regenerated files with no content change from feature
  commits.
- **Derive the command type** — `fund-draft-settlement.ts:38-42` spells out the
  `{ payload, key, etag }` shape inline; `ReturnType<typeof prepareFundCommand>`
  would follow a shape change without a second edit.
- **Pin the same-turn contract beside the code** — the rule that callers act
  inside the callback and never stash the outcome past a later await lives only
  in the plan's Technical Considerations. A two-line JSDoc on
  `saveDraftAndSettle` would keep the invariant with the function.

---

## Checklist

Criteria from `.claude/skills/TRIP-review/checklist.md`.

- [x] 1. Functional Requirements — passed. Rulings verified against the diff: R1
      (`applyDraftSnapshot` writes no status; workspace sets `synced` after,
      `FundWorkspace.tsx:336-337`), R3 (`draftServerReady` caller-owned,
      `useFundDraftSync.ts:142`, `FundWorkspace.tsx:369`,
      `FundBasicsStep.tsx:240,247`), R4 (`needsHydration` read after resolve,
      `:85`), R5 (canonical compare, `:82-84`), R8 (ETag, resolve, then
      callback, `:77-78`), R9 (superseded silent in all three; bootstrap resets
      stage, `FundBasicsStep.tsx:231-232`), R11 (callers enter their saving
      state before the helper). Corrected Fund Setup spec: 36 passed.
- [ ] 2. Code Quality — passed with caveat: dead export
      `STORAGE_UNAVAILABLE_MESSAGE` (Minor above). Typing is exact, no dynamic
      types, exhaustive switches, no duplication left across the three callers.
- [x] 3. Architectural Compliance — passed. Helper sits in
      `client/src/services/` beside the transport it composes (ARCHI.md section
      5); no React import, so Preact-safe; no server, schema, route, flag, or
      matrix-fingerprinted file changed; ARCHI.md section 5 note added;
      idempotency key and `If-Match` travel unchanged through `saveFundDraft`.
- [x] 4. Error Handling — passed. Preparation and transport failures arrive as
      outcomes, never as rejections; `not_dispatched` never releases a
      pre-existing command; `uncertain` and `retry_same_key` keep the key for
      replay; a handler throw propagates without reclassifying a settled save
      (tested).
- [x] 5. Security — passed. Client-only change; no new input at a trust
      boundary; authentication, idempotency, and optimistic-locking headers
      unchanged.
- [x] 6. Performance — passed. Two canonical-JSON serializations per save, as
      before; single in-flight save per hook instance preserved; no new store
      subscriptions.

---

## Verification (this audit)

Run in worktree `caveman-ponytail-full-eabf8a`, whose path does not contain the
word `command`, at `eb9352108`:

- `npm run check`: 0 errors across client, server, shared.
- `eslint` on the four changed sources: clean.
- Four affected suites: 4 files, 115 passed.
- `npm run test:unit`: 1200 files passed, 16717 tests passed, 0 failed, 90
  skipped. This confirms the release worktree's 17 failures were checkout-path
  artifacts, which the Codex loop could not verify from inside that worktree.
- `playwright test tests/e2e/fund-setup-workflow.spec.ts --project=core`: 36
  passed, including the corrected `fundSize` expectation. The PR rollup has no
  Playwright lane, so this is the first recorded run of the corrected spec.
- PR #1572 check rollup on the head: every required check passed
  (`CI Gate Status`, lint, typecheck, unit-fast, Test (Affected Only), Test
  integration, Governance Guards, Validate Discovery Routing).
- Environment note: the first unit run failed 89 tests with
  `TypeError: Cannot read properties of null (reading 'useEffect')` because the
  managed worktree resolved React from the parent checkout; `npm ci` in the
  worktree fixed it. Not a code defect.

---

## Verdict

**APPROVED with observations**

The merged change matches the plan's rulings and the approval gate: all
functional requirements are implemented, no critical or major findings, build
and typecheck clean, affected and full unit suites pass, new logic is covered by
the outcome table and caller regressions, and documentation was updated
(CHANGELOG, changelog w10, ARCHI.md, router index). Two minor items remain open:
the w10 changelog and Codex review describe the Fund Setup spec as unchanged
although commit `33ed13f48` corrected it, and the hook carries one dead export.
The false "Save not confirmed" bootstrap alert stays a deferred TODOS item by
plan design.
