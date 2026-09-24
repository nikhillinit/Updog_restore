---
status: HISTORICAL
audience: both
last_updated: 2026-09-24
owner: '@nikhillinit'
---

# Changelog - Week 10, 24-09-2026, Fund Draft Command Settlement

**Release status**: source changes committed on branch
`claude/fund-draft-command-settlement-a27359` and opened as a pull request
against `main`; merge is owner-gated behind `CI Gate Status`. **Package
version**: 1.6.0, unchanged; no new application version or release tag.
**Object**: refactor(client): settle fund draft commands through one module
**Code review**:
[Consolidated review](../3-code-review/CR_w10_fund-draft-command-settlement.md)
(Codex loop, 2 rounds -> APPROVED, then PROMOTION_READY synthesis). **Plan**:
`docs/1-plans/F_1.15.0_fund-draft-command-settlement.plan.md`.

## Changes

- Add `client/src/services/fund-draft-settlement.ts`: `saveDraftAndSettle`
  prepares the `save_draft` command, dispatches the prepared (or replayed) body
  through `saveFundDraft`, fences the result on session id, draft fund id, and
  command key, settles the command journal, and delivers one typed outcome
  (`saved`, `stale`, `uncertain`, `retry_same_key`, `rejected`, `superseded`,
  `not_dispatched`) to a synchronous callback in the same turn.
  `applyDraftSnapshot` is the shared seven-field hydration patch.
- Rewire the wizard autosave hook (`useFundDraftSync.ts`), the Fund Workspace
  "save before starting another fund" dialog, and the Fund Basics bootstrap save
  to consume the helper. Each caller keeps only its continuation and switches
  exhaustively on the outcome kind.
- Behavior changes (rulings R5 and R9): superseded-command error text is no
  longer shown in the workspace dialog and Fund Basics re-enables Next after a
  superseded save; recovered pending saves compare canonical JSON, so equal
  values with reordered nested keys no longer trigger the "Save the newer
  changes" refusal.
- Tests: 26-case outcome table for the helper; 12 caller regressions across the
  workspace, bootstrap, and draft-sync suites; one interrupted-save replay
  journey in `tests/e2e/fund-workspace-real-backend.spec.ts` (server commits,
  client sees a lost response, reload replays the same `Idempotency-Key` and
  `If-Match`, revision advances once).

## Verification

- `npm run lint`, `npm run check`: clean.
- `npm run test:unit`: 16699 passed; 17 pre-existing failures reproduce only
  when the checkout path contains the word `command` (sanitizer assertions),
  none on a sibling checkout.
- `tests/integration/wizard-to-results-e2e.test.ts`: passed.
- `npm run test:e2e:batch-b` (testcontainers Postgres): passed, including the
  new replay journey.
- `tests/e2e/fund-setup-workflow.spec.ts` (core): 35 passed; one unchanged,
  pre-existing expectation (`fundSize: 75`) disagrees with the whole-dollar
  contract from #1564 and is deferred as its own fix.
