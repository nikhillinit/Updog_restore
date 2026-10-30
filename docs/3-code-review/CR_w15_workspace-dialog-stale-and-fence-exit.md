---
status: HISTORICAL
audience: both
last_updated: 2026-10-29
owner: '@nikhillinit'
---

# Code Review: F_1.15.3 workspace dialog stale recovery and fence exit

**Review Date**: 2026-10-29

**Version**: 1.6.0 (package unchanged). Reviewed object: `6a180dc1e..HEAD` on
`fix/f1153-workspace-stale-dialog`, two commits ahead of `origin/main` at
`6a180dc1e`: `3a82ea6ab`
(`fix(client): start a new fund directly from a fenced workspace session`) and
`6f80c2e78` (`fix(client): give the workspace dialog a durable stale exit`).

**Plan**: `docs/1-plans/F_1.15.3_workspace-dialog-stale-and-fence-exit.plan.md`
(Codex plan review APPROVED after 2 rounds).

**Review loop**: Codex code review, 1 round -> APPROVED. No synthesis pass was
needed because the loop converged on turn 1.

## Verdict

APPROVED. No findings.

| Dimension               | Result | Evidence                                                                                                     |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Functional requirements | Pass   | Stale and missing-draft exits, exact pending-save replay, and the direct fence exit match the plan.          |
| Code quality            | Pass   | The dead pre-start hydration fetch is removed; no new dependency or extra path.                              |
| Architecture            | Pass   | Settlement stays shared; the dialog writes durable stale state and the setup shell keeps Load and Overwrite. |
| Error handling          | Pass   | 412 and missing-draft outcomes give a usable exit; the other outcome branches are unchanged.                 |
| Security                | Pass   | No authentication, authorization, or API boundary changed.                                                   |
| Performance             | Pass   | One redundant fetch removed from every fenced New Fund path; no new hot-path work.                           |

## Implementation review notes

- Phase 1 red regressions (the `:607` rewrite and two fenced-session cases)
  failed by assertion on `6a180dc1e`: 3 failed, 21 passed.
- Phase 2 red regressions failed by assertion on `3a82ea6ab`: 5 failed, 71
  passed across the workspace and draft-sync suites. The pending-replay
  companion case is a guard and passed on both commits, as did the shell
  hand-off contract test, which the plan expected to pass on `main`.
- Mutation check: removing the missing-draft reset in `handleNewFund` turns the
  "asks to save again when New Fund reopens after a missing draft" test red.
- Implementer-side fixes during batch review: `discardReason` dropped a
  redundant `blockedCommand` term, because a blocked command already implies a
  pending command; prettier on the selector tuple. One phase 1 test assertion
  used `toMatchObject({ fundName: undefined })`, which fails after
  `startNewFundSession` removes the key; it now uses `toBeUndefined()`.
- An untracked `.impeccable/` directory created by a design hook during
  delegation was left out of both commits.

## Gate

- `npm run check`: 0 new TypeScript errors.
- `npm run lint` (with `NODE_OPTIONS=--max-old-space-size=8192`): clean, all
  guardrails pass.
- Full `npm test`: 17293 passed, 90 skipped, 0 failed.
- Affected suites (5 files): 154 passed.

## Residual risk

- The reviewer did not rerun tests or exercise a live browser; the gate results
  above come from the implementer's runs.
- One accepted path (plan, Edge cases): a fenced replay rejected for a reason
  other than a missing draft leaves the save copy and label in the open dialog,
  and the next click starts a new fund without saving. No local values exist in
  that state, and reopening New Fund skips the dialog.
