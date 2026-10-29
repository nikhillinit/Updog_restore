---
status: HISTORICAL
audience: both
last_updated: 2026-10-29
owner: '@nikhillinit'
---

# Changelog - Week 15, 29-10-2026, Draft Save Acknowledgement and Stale Exit

**Release status**: source changes committed on branch
`fix/f1152-draft-save-ack-stale-exit` and opened as a pull request against
`main`; merge is owner-gated behind `CI Gate Status`. **Package version**:
1.6.0, unchanged; no new application version or release tag. **Object**:
fix(client): share draft save acknowledgement with autosave; fix(client): give
stale bootstrap saves a durable recovery path. **Code review**:
[Code review](../3-code-review/CR_w15_draft-save-ack-stale-exit.md) (Codex loop,
1 round -> APPROVED). **Plan**:
`docs/1-plans/F_1.15.2_draft-save-ack-and-stale-exit.plan.md`.

## Changes

- Add a module-local acknowledgement record to
  `client/src/services/fund-draft-settlement.ts`, bound to session, fund,
  content signature, and ETag. `saveDraftAndSettle` writes it on every accepted
  `saved` outcome; the autosave hook reads it instead of its own
  `lastSavedSignatureRef`. A direct save that is acknowledged before the 600 ms
  debounce expires no longer triggers a second, redundant PUT, and "Overwrite
  saved draft" no longer reports `synced` without writing when local content
  equals an acknowledgement at an older ETag.
- A 412 on the Fund Basics bootstrap save, or on a hook-owned save, now sets
  `draftServerReady` and `draftSyncStatus: 'stale'`. The setup shell's "Load
  server draft" / "Overwrite saved draft" banner owns recovery, and a reload
  rebuilds `stale` through the existing ETag comparison.
- The autosave hook cancels an armed debounce when the status becomes `stale`
  and drops timer or step-change flushes while `stale` or `hydrating`. Explicit
  Overwrite still dispatches.
- Fund Basics Next is disabled and live-checked while the status is `uncertain`,
  `stale`, `hydrating`, or `error`. This is an intended gating change: a
  server-ready draft can no longer leave step 1 while the hook reports `error`.
- `TODOS.md`: remove the fixed duplicate-autosave entry; add the deferred
  FundWorkspace dialog stale-handling entry.
- Tests: 14 new regressions across the bootstrap, draft-sync, and settlement
  suites; the acknowledgement record is cleared in `beforeEach` of the three
  hook suites that reuse one session id. One bootstrap test renamed and
  re-asserted for the gating change.

## Verification

- `npm run check`: clean. `npm run lint`: clean (needs
  `NODE_OPTIONS=--max-old-space-size=8192` on a fresh worktree).
- `npm run test:unit`: 17282 passed, 90 skipped, 0 failed.
