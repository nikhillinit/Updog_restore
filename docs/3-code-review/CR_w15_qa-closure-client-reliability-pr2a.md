---
status: HISTORICAL
audience: both
last_updated: 2026-10-30
owner: '@nikhillinit'
---

# Code Review: F_1.17.0 PR 2a QA closure client reliability

**Review Date**: 2026-10-30

**Version**: 1.6.0 (package unchanged). Reviewed object: `8e859fe83..722d815c7`
on `fix/f1170-pr2a-client-reliability`, twelve commits ahead of `origin/main` at
`8e859fe83` (#1671), from the plan split `ee0a81dda` through the review fix
`722d815c7`
(`fix(client): clear alert results when the default baseline changes`).

**Plan**: `docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md`, PR 2a
(codex-plan-review 2026-10-29 round 1 APPROVED at `ee0a81dda`). PR 2b (Task 6b,
the C5 exact-baseline analysis state) is out of scope.

**Review loop**: Codex code review, 2 rounds -> APPROVED, then a synthesis pass
(thread `01a18b64-b2b7-7980-9d72-44d8df1a4f49`). Round 1 ran against the
explicit committed range `8e859fe83..HEAD`.

## Verdict

APPROVED. One Major finding in round 1, addressed in `722d815c7`. No open
findings.

| Dimension               | Result | Evidence                                                                                                              |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Functional requirements | Pass   | C1, C4, C5 client half, C6, C7, C9, and C10 match the PR 2a plan sections and to-dos.                                 |
| Code quality            | Pass   | Existing components reused (empty-state card, analytics `ErrorState`); no new dependency.                             |
| Architecture            | Pass   | No `server/**`, `shared/**`, `client/src/lib/**`, or pinned matrix source changed; route definitions unchanged.       |
| Error handling          | Pass   | Query and verification failures render inline with a retry or the server message; no failure reads as an empty state. |
| Security                | Pass   | Share and verify HTTP contract unchanged; no authentication or authorization boundary changed.                        |
| Performance             | Pass   | The deals query no longer runs without a fund; `ErrorState` is imported by module, not the recharts barrel.           |

## Findings

- **Round 1, Major, addressed: old-baseline empty alerts during a default
  switch.** `useSetDefaultBaseline` first invalidated the fund's alerts queries,
  which keeps cached data, so the current scope could show "No Current-Baseline
  Alerts" for the previous default while the refetch ran. `722d815c7` resets the
  `['/api/funds', fundId, 'alerts']` prefix instead; the page shows its skeleton
  until the new response arrives. The hook test asserts both scopes clear and
  another fund's data stays.

## Implementation review notes

- Every C-item started with a focused test that failed for the expected reason:
  C9 `expected false to be true` and no Help link during setup; C7 no region
  named "Scenario comparison table"; C1 no fund prompt and a deals request with
  a null fund; C4 no "Time series unavailable" / "Breakdown unavailable"; C5 no
  "Alerts unavailable", no neutral sentence, and no alerts invalidation; C6 no
  label-linked input, no `role="alert"` error, and no "Verifying..." button (the
  form unmounted).
- Decisions recorded in the plan's implementation notes: the C5 unavailable
  state also covers the overview "Recent Alerts" card, and empty-alert copy
  waits for a response; `verifyPasskey` returns a typed outcome (HTTP contract
  unchanged); C10 replaced 200 lines and kept 27 decorative matches, with the
  shared-dashboard `Eye` and `Clock` icons given their old color explicitly.
- C10 was delegated to codex-implement. Review checks: every changed line
  differs only by the class token, and each touched file is content-equivalent
  apart from the token and the pre-commit prettier rewrap. One retained match
  (`ScenarioComparisonTable.tsx:161`, a separator span holding a readable
  percentage) was corrected to the muted token.
- No `.impeccable/` directory exists in this worktree, and no agent state was
  staged.

## Gate (final head `722d815c7`)

- `npm run check`: 0 new TypeScript errors.
- `npm run lint` (with `NODE_OPTIONS=--max-old-space-size=8192`): clean, all
  guardrails pass.
- `npm test` (alias of `npm run test:unit`): 1219 files passed, 6 skipped; 17318
  tests passed, 90 skipped, 0 failed.
- `npm run build:web`: passes.
- Playwright `accessibility` project: 15 passed (plus 33 smoke dependencies).
- `visual-audit-screenshots.spec.ts` (`gp-usability` project): 32 route
  screenshots passed, 12 LP screenshots skipped (LP flag off). One smoke
  dependency, `route-fund-context-fidelity.spec.ts:841` (context rail, not
  touched by PR 2a), timed out once and passed on retry; it passed in the three
  other local runs.
- Scope: no `server/**`, `shared/**`, or `client/src/lib/**` path; no source
  listed in `audit/surface-contract-matrix/source-inventory.json`; no path that
  `isFinancialPath` selects, so the hosted `Financial Truth` job is expected to
  skip.

## Residual risk

- No screenshot baselines are tracked; the screenshot spec attaches images
  without comparison. Spot checks of the shared-dashboard and variance
  screenshots show darker muted copy and unchanged icon colors; no pixel diff
  against `main` was run.
- The axe route scan covers the navigation `aside` and selected controls, not
  every readable-copy element on the C10 routes.
- The reviewer did not rerun tests or a browser; the gate results above come
  from the implementer's runs.
