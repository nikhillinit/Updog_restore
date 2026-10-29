---
status: HISTORICAL
audience: both
last_updated: 2026-10-29
owner: '@nikhillinit'
---

# Code Review: F_1.15.2 draft save acknowledgement and stale bootstrap exit

**Review Date**: 2026-10-29

**Version**: 1.6.0 (package unchanged). Reviewed object: `86d8002e4..HEAD` on
`fix/f1152-draft-save-ack-stale-exit`, two commits ahead of `origin/main` at
`86d8002e4`: `5f0398378`
(`fix(client): share draft save acknowledgement with autosave`) and `18f400690`
(`fix(client): give stale bootstrap saves a durable recovery path`).

**Plan**: `docs/1-plans/F_1.15.2_draft-save-ack-and-stale-exit.plan.md` (Codex
plan review APPROVED after 2 rounds).

**Review loop**: Codex code review, 1 round -> APPROVED. No synthesis pass was
needed because the loop converged on turn 1.

## Verdict

APPROVED. No blocking findings.

| Dimension               | Result | Evidence                                                                                                                |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Functional requirements | Pass   | Accepted saves record an ETag-bound acknowledgement; a bootstrap 412 enters stale recovery and blocks Next.             |
| Code quality            | Pass   | Uses the existing settlement module and hook; no new dependency.                                                        |
| Architecture            | Pass   | Save settlement, autosave, and shell recovery keep their responsibilities; FundWorkspace follow-up deferred as planned. |
| Error handling          | Pass   | A failed recovery leaves Next blocked.                                                                                  |
| Security                | Pass   | Session, fund, command, and ETag checks remain in place.                                                                |
| Performance             | Pass   | The acknowledgement check reads one in-memory record; stale timers are cancelled or dropped.                            |

## Implementation review notes

- Phase 1 red regressions were confirmed failing by assertion before the hook
  change: both bootstrap duplicate-PUT cases (two `saveFundDraft` calls) and the
  draft-sync Overwrite case (zero calls).
- Phase 2 red regressions (seven) were confirmed failing by assertion before the
  Fund Basics and hook change.
- One pre-existing bootstrap test encoded the old Next gating
  (`reenables Next without navigating when a save belongs to a replaced session`).
  It was renamed and now asserts Next is disabled while the replacement session
  reports `error`, per the plan's "Next gating change (intended)". Exits remain:
  shell Retry, any edit, or a reload.
- Implementer-side fixes during batch review: the superseded-acknowledgement
  unit test now also asserts against the superseded session id; a doubled
  `TODOS.md` separator was removed; the hook's three repeated stale/hydrating
  status checks were folded into `isRecoveryPending()`.

## Gate

- `npm run check`: 0 new TypeScript errors.
- `npm run lint` (with `NODE_OPTIONS=--max-old-space-size=8192`; the default
  heap runs out of memory on a fresh worktree): clean, all guardrails pass.
- Full `npm test`: 17282 passed, 90 skipped, 0 failed.
- Affected suites (11 files): 230 passed.

## Residual risk

- The reviewer did not rerun tests or exercise a live browser; the gate results
  above come from the implementer's runs.
- The FundWorkspace "Save draft and start new" dialog still handles `stale`
  locally; tracked in `TODOS.md`.
