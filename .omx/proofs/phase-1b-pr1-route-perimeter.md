# Phase 1B PR1 Route/Perimeter Proof

## Scope exercised

Validate the route/perimeter assumptions behind PR 1 from
`.omx/plans/2026-04-03-phase-1b-signoff-sandbox-proof-plan.md`.

## Files touched

- `client/src/config/routes.ts`
- `tests/unit/app/legacy-route-map.test.ts`

## Commands run

1. `npx vitest run tests/unit/app/legacy-route-map.test.ts tests/unit/app/route-governance-registry.test.tsx tests/unit/app/route-perimeter-governance.test.tsx`
2. `npm run check`
3. code search for stale `/forecasting`, `/scenario-builder`,
   `/financial-modeling`, and `/model` route references under `client/src/`

## Pass/fail evidence

### Passed

- Targeted route tests passed:
  - `tests/unit/app/legacy-route-map.test.ts`
  - `tests/unit/app/route-governance-registry.test.tsx`
  - `tests/unit/app/route-perimeter-governance.test.tsx`
- `npm run check` passed with 0 new TypeScript errors.
- `client/src/config/routes.ts` no longer maps the following deterministic
  legacy surfaces to dead `/model`:
  - `/planning`
  - `/forecasting`
  - `/scenario-builder`
  - `/financial-modeling`
  - `/allocation-manager`
  - `/moic-analysis`
  - `/return-the-fund`
  - `/partial-sales`
- `tests/unit/app/legacy-route-map.test.ts` now proves those deterministic
  surfaces do not imply a live `/model` destination while preserving still-owned
  non-model redirects.

### Remaining findings / partial failures

- `client/src/core/routes/ia.ts` still contains stale metadata mappings:
  - `/financial-modeling` -> `/model`
  - `/forecasting` -> `/model`
- `client/src/components/insights/data-driven-insights.tsx` still contains
  dormant internal links to:
  - `/forecasting`
  - `/scenario-builder`
- `DataDrivenInsights` does not appear to be mounted in the active runtime, so
  those links are not a live perimeter break today, but they are stale
  route-story debt and should be captured in the queue revision.

## Canonical vs legacy route matrix

| Route                         | Current disposition                                  | Evidence                                                                                |
| ----------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/dashboard`                  | canonical/live                                       | mounted app route + governance tests                                                    |
| `/portfolio`                  | canonical/live                                       | mounted app route + governance tests                                                    |
| `/pipeline`                   | canonical/live                                       | mounted app route + governance tests                                                    |
| `/reports`                    | canonical/live                                       | mounted app route + governance tests                                                    |
| `/sensitivity-analysis`       | internal-live                                        | governance registry test marks it intentionally mounted                                 |
| `/fund-model-results/:fundId` | canonical/live                                       | mounted app route + governance tests                                                    |
| `/planning`                   | archived-placeholder redirect                        | route-perimeter/governance tests                                                        |
| `/kpi-manager`                | archived-placeholder redirect                        | route-perimeter/governance tests                                                        |
| `/kpi-submission`             | archived-placeholder redirect                        | route-perimeter/governance tests                                                        |
| `/forecasting`                | dead/dormant deterministic legacy surface            | removed from `LEGACY_ROUTE_MAP`; stale references remain elsewhere                      |
| `/scenario-builder`           | dead/dormant deterministic legacy surface            | removed from `LEGACY_ROUTE_MAP`; stale dormant link remains                             |
| `/financial-modeling`         | unmounted canonical target, not live perimeter route | not in active governance perimeter; stale `/model` redirect metadata remains in `ia.ts` |

## Blockers

- No hard blocker was required to complete the PR1 proof slice.
- However, queue revision should explicitly capture that route/perimeter cleanup
  is not finished until stale metadata and dormant internal links are either
  removed, relabeled, or intentionally governed.

## Required queue revisions before sign-off

1. Add a queue note that PR 1 must clear **all stale `/model` route-story
   metadata**, not only `LEGACY_ROUTE_MAP`, including
   `client/src/core/routes/ia.ts`.
2. Add a queue note that dormant internal links to `/forecasting` and
   `/scenario-builder` in
   `client/src/components/insights/data-driven-insights.tsx` must be removed,
   relabeled, or explicitly retired as part of perimeter freeze.
3. Preserve the distinction between:
   - `financial-modeling` as the canonical deterministic target under review,
     and
   - dead/dormant deterministic legacy entrypoints like `/forecasting` and
     `/scenario-builder`.
4. Keep PR 2 and PR 3 from assuming final route semantics until this PR 1
   perimeter baseline is accepted.
