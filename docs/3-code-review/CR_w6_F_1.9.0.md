---
status: HISTORICAL
audience: both
last_updated: 2026-08-31
owner: '@nikhillinit'
---

# Code Review: F_1.9.0 Workspace Context Rail (issue #1288)

**Review Date**: 2026-08-31 **Version**: plan-keyed F_1.9.0 (no release tag;
package version remains 1.6.0) **Files Reviewed**:

- `client/src/contexts/FundWorkspaceContext.tsx` (new)
- `client/src/hooks/useFundWorkspaceContext.ts` (new)
- `client/src/components/fund-results/WorkspaceContextRail.tsx` (new)
- `client/src/components/fund-results/workspace-context-rail-view-model.ts`
  (new)
- `client/src/pages/fund-model-results/workspace-nav.tsx`
- Eight mounting pages (`fund-model-results*`, `fund-scenario-workspace`,
  `financial-modeling`, `portfolio-modern`)
- `tests/unit/` context/rail/contract-parity/page suites;
  `tests/e2e/fixtures/qa-audit-api.ts`;
  `tests/e2e/route-fund-context-fidelity.spec.ts`

**Plan**: `docs/1-plans/F_1.9.0_workspace-context-rail.plan.md`

---

## Executive Summary

Implements issue #1288: the shared `FundWorkspaceContext` ({fundId,
vehicleId|null, asOfDate, currentPlanVersionId|null, viewPreset}),
`useFundWorkspaceContext`, and the `WorkspaceContextRail` mounted on eight
workspace pages, with five documented implementation-slice deviations (bridge
panel, recompute control, and evidence navigation ship disabled-with-reason; no
sticky as-of; active-basis snapshot short-hash deferred). Issue #1288 has no
recorded owner approval for those deviations. Codex loop: round 1
REQUEST_CHANGES (6 Major), round 2 REQUEST_CHANGES (1 residual Major), round 3
APPROVED. Verdict: APPROVED.

---

## Changes Overview

Context derives strictly from served data: `currentPlanVersionId` and `asOfDate`
come only from the dual-forecast response's optional `currentForecastV2` block
(a present `held` block is a served golden state rendering pinned basis identity
plus disclosure); the latest-facts read supplies freshness metadata and vehicle
roster only. The provider takes the resolved route fund id (null disables all
queries) and never reads ambient fund state. The rail reserves a 320px column at
`xl` (dashboard-modern two-column pattern), slides over at 1024-1279px, and
collapses to an info-button below 1024px per the approved #1284 prototype
record; focus treatment is solid `#292929`, `#2563EB` reserved for Info status.
View-model states distinguish pending, error, and settled absence at both basis
and identity levels. Presets drive presentation-only section ordering.

---

## Findings

### Critical Issues

None.

### Major Issues

- **Ingress schema rejected persisted participation-term variants** (policy 1.1+
  structured refs) — addressed: type-derived string-or-structured union; parity
  test runtime-parses all five persisted policy versions and pins the union
  cardinality.
- **Rail could query/display ambient fund instead of route fund** — addressed:
  provider requires resolved route `fundId`; mismatch passes null; reports
  identity pin re-tightened with the prior exemption removed.
- **Evidence mixed latest facts with served-basis provenance** — addressed:
  evidence rows are served-basis-only; uncorrelated records render
  unavailable-with-reason pending a correlated read (deviation 5).
- **Desktop rail overlaid content** — addressed: reserved-width sticky grid
  column; approved responsive tiers preserved.
- **Pending/error reads collapsed into domain absence** (two rounds: basis
  slots, then identity slots) — addressed: `forecastStatus`/`factsStatus` drive
  distinct loading/error/absent presentations everywhere; absence wording only
  after a settled read proves it.
- **Presets were behaviorally inert** — addressed: per-preset section ordering,
  presentation-only, with rendered-difference test.

### Minor Issues

None.

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — passed
- [x] 2. Architecture & Plan Conformance — passed (five deviations documented
      without claiming owner approval; no new backend routes or contracts)
- [x] 3. Code Quality — passed (`ContextTrigger` forwardRef fix for Radix
      `asChild`; preact/compat-safe throughout)
- [x] 4. Error Handling — passed (loading/error/absent modeled distinctly at
      basis, freshness, and identity levels)
- [x] 5. Security — passed (no ambient fund leakage; authorization unchanged;
      presets presentation-only)
- [x] 6. Performance — passed
- [x] 7. Testing — passed (client project 213 files / 1,716 tests; contract
      parity across five persisted policy versions; e2e golden live, golden
      held, and unavailable paths 15/15; smoke 25/25 under NODE_ENV=test)
- [x] 8. Documentation — passed (plan updated; this record; changelog)

---

## Verification Evidence

At the reviewed candidate (uncommitted worktree diff on
`feat/workspace-context-rail`, base `aa355aaf7`), `TZ=UTC`:

- Full client project: 213 files passed / 1 skipped, 1,716 tests passed / 5
  skipped, 0 failed.
- `npm run check`: 0 errors. `npm run lint`: pass. `npm run build:web` (Preact
  production bundle): pass — confirms no Node-only contract leak.
- Playwright `route-fund-context-fidelity.spec.ts --project=smoke`: 15/15 under
  `NODE_ENV=test` (CI-equivalent); full smoke 25/25. A plain local
  production-mode run fails pre-existing at the auth gate with zero F_1.9.0
  involvement (verified via `basic-smoke.spec.ts` control).

Review loop: codex-code-review, gpt-5.6-sol xhigh (fast tier), rounds 1-2
REQUEST_CHANGES -> round 3 APPROVED.

Deviation follow-ons recorded in the plan for later scope: authorized bridge
read contract, idempotency-keyed recompute command (the existing POST's missing
idempotency is a pre-existing defect candidate), correlated basis-evidence read.
#1290 owns backend route work.
