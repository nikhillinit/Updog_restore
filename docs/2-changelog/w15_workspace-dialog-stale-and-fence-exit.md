---
status: HISTORICAL
audience: both
last_updated: 2026-10-29
owner: '@nikhillinit'
---

# Changelog - Week 15, 29-10-2026, Workspace Dialog Stale Recovery and Fence Exit

**Release status**: source changes committed on branch
`fix/f1153-workspace-stale-dialog`; push, pull request, and merge are
owner-gated, with merge behind `CI Gate Status`. **Package version**: 1.6.0,
unchanged; no new application version or release tag. **Object**: fix(client):
start a new fund directly from a fenced workspace session; fix(client): give the
workspace dialog a durable stale exit. **Code review**:
[Code review](../3-code-review/CR_w15_workspace-dialog-stale-and-fence-exit.md)
(Codex loop, 1 round -> APPROVED). **Plan**:
`docs/1-plans/F_1.15.3_workspace-dialog-stale-and-fence-exit.plan.md`.

## Changes

- A fenced FundWorkspace session (`needsServerHydration`) with no pending
  command now starts a new fund directly from New Fund, with no dialog and no
  fetch. A confirmed replay that reports `needsHydration` also starts the new
  fund directly. `hydrateThenStartNew` is deleted: `startNewFundSession`
  replaced the store, so its fetch was never read, and a 404 or any fetch
  failure left the user on a dialog error (CR_w10 Minor 1, Suggestion 1).
- A 412 on the "Start another fund?" save now sets `draftServerReady` and
  `draftSyncStatus: 'stale'`, the same two writes as the autosave hook and the
  Fund Basics bootstrap save. The dialog switches to "Discard my changes and
  start new" or Keep editing; Keep editing opens the setup shell, whose banner
  rebuilds the conflict from ETags and owns Load and Overwrite. Before, every
  retry returned 412 again, and Keep editing could reach the wizard with no
  banner.
- A session already in `stale` with no pending command opens the dialog in the
  discard variant, without a save that is certain to fail. A pending
  `save_draft` still replays its exact command; discard never drops an unsettled
  command.
- A rejected save with `missingDraft` (409 `NO_ACTIVE_DRAFT`) shows the same
  discard variant with its own copy. New Fund clears that state on reopen,
  because a published fund can get a new draft later.
- The dialog description is an `aria-live="polite"` region, so a switch to a
  discard variant while the dialog is open is announced.
- `TODOS.md`: remove the "Workspace: stale draft dialog needs durable recovery"
  entry. `docs/ARCHI.md` section 5: describe the dialog's 412 writes. `CR_w10`:
  Minor 1 closed, Suggestion 1 adopted.
- Tests: 9 new cases and 1 rewrite. 8 new workspace cases, plus the
  identity-only replay test rewritten to expect no fetch. 1 shell hand-off
  contract test in the draft-sync suite.

## Verification

- `npm run check`: clean. `npm run lint`: clean (needs
  `NODE_OPTIONS=--max-old-space-size=8192` on a fresh worktree).
- `npm test`: 17293 passed, 90 skipped, 0 failed.
