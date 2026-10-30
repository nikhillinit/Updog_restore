---
status: HISTORICAL
audience: both
last_updated: 2026-10-30
owner: '@nikhillinit'
---

# Changelog - Week 15, 30-10-2026, QA Closure Client Reliability (F_1.17.0 PR 2a)

**Release status**: source changes committed on branch
`fix/f1170-pr2a-client-reliability`; push, pull request, and merge are
owner-gated, with merge behind `CI Gate Status`. **Package version**: 1.6.0,
unchanged; no new application version or release tag. **Object**: fix(client):
client reliability and accessibility repairs C1, C4, C5 client half, C6, C7, C9,
and C10. **Code review**:
[Code review](../3-code-review/CR_w15_qa-closure-client-reliability-pr2a.md)
(Codex loop, 2 rounds -> APPROVED; round 1 Major addressed in `722d815c7`).
**Plan**: `docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md` (PR 2a;
codex-plan-review round 1 APPROVED at `ee0a81dda`).

## Changes

- **C1 pipeline:** the deals query runs only with a selected fund. Without one,
  the empty-state card asks for a fund, the header Add/Import buttons are
  disabled and described by that prompt, and the Add/Import modals do not mount.
  No `/api/deals/opportunities` request is sent without a fund.
- **C4 performance:** a failed time series or breakdown shows its own
  "unavailable" state with a retry that refetches only that query. The other
  dataset stays usable, and the header refresh still refetches both.
- **C5 variance tracking (client half):** a failed alerts request shows "Alerts
  unavailable" with a retry in both alert scopes and in the overview "Recent
  Alerts" card, never empty-state copy. The current-scope sentence is now "No
  open alerts returned for this scope." and appears only after a successful
  empty response; it no longer claims acceptable variance. Setting a default
  baseline resets the fund's alerts queries, so the previous default's result
  never shows while the new one loads. The exact-baseline analysis copy is PR
  2b.
- **C6 shared dashboard:** passkey verification has its own pending flag, so the
  form stays mounted with a disabled "Verifying..." button. Every verification
  failure (400, 401, 404, 410, 429, 503, network) stays inline with the server's
  message, or "Failed to verify passkey" on a network failure, instead of a
  blanket "Invalid passkey". The input keeps its value, regains focus, and is
  linked to its label and `role="alert"` error.
- **C7 scenario comparison:** the horizontal-scroll wrapper is a named,
  keyboard-focusable region with the charcoal focus ring.
- **C9 navigation:** Help stays enabled in desktop and mobile navigation while
  fund setup is incomplete. Route definitions are unchanged.
- **C10 contrast:** 200 readable-copy lines in the 24 named files move from
  `text-charcoal-400/500` to `text-presson-textMuted`. Icons, spinners,
  separators, and disabled-control colors keep their classes; the shared
  dashboard `Eye` and `Clock` icons keep their old color explicitly. The
  Tailwind charcoal scale is unchanged.
- `TODOS.md`: the done reallocation 500-envelope entry is removed and its
  quarantine note becomes an owner-decision entry; "QA closure PR C" now tracks
  only PR 2b.

## Verification

- `npm run check`: 0 new errors. `npm run lint` (with
  `NODE_OPTIONS=--max-old-space-size=8192`): clean, all guardrails pass.
- `npm run test:unit` and `npm test` (an alias): 17318 passed, 90 skipped, 0
  failed.
- `npm run build:web`: passes.
- Playwright `accessibility` project (axe): 15 passed.
  `visual-audit-screenshots.spec.ts`: 32 route screenshots passed, 12 LP
  screenshots skipped (LP flag off), 0 failed. One unrelated smoke dependency
  (`route-fund-context-fidelity.spec.ts:841`) passed on retry. No screenshot
  baselines are tracked, so no baseline file changes.
- All results above are from the final head `722d815c7`.
