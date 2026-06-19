---
status: ACTIVE
last_updated: 2026-06-18
---

# Secondary Surface Decisions

## Summary

| Surface                                                                          | State                      | Owner Path                                                          | Exposure Control                                                      | Rollback                                                              |
| -------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `planning`                                                                       | Archived redirect          | `client/src/App.tsx`, `client/src/app/route-governance-registry.ts` | explicit route redirect                                               | restore only via a new owned implementation and route decision        |
| `kpi-manager`                                                                    | Archived redirect          | `client/src/App.tsx`, `client/src/app/route-governance-registry.ts` | explicit route redirect                                               | restore only via a new owned implementation and route decision        |
| `kpi-submission`                                                                 | Archived redirect          | `client/src/App.tsx`, `client/src/app/route-governance-registry.ts` | explicit route redirect                                               | restore only via a new owned implementation and route decision        |
| `/reserves-demo`                                                                 | Deleted (Branch B)         | removed in branch chore/remove-mock-surface-pages                   | not mounted in any environment; bundle verifier guards reintroduction | re-create only via an owned implementation and a fresh route decision |
| `/allocation-manager`, `/cash-management`, `/portfolio-analytics`, `/cap-tables` | Deleted (Branch B)         | removed in branch chore/remove-mock-surface-pages                   | not mounted in any environment; bundle verifier guards reintroduction | re-create only via owned implementations                              |
| `/shared/:shareId`                                                               | Public contract            | `client/src/App.tsx`, `client/src/app/route-governance-registry.ts` | intentional public mount                                              | remove only with an explicit external-link migration                  |
| `/portal/:rest*`                                                                 | Public contract            | `client/src/App.tsx`, `client/src/app/route-governance-registry.ts` | intentional public mount to access denied                             | change only with an explicit portal activation or deprecation plan    |
| Compass                                                                          | Experimental and unmounted | `server/compass/routes.ts` plus future server mount gate            | no server mount                                                       | mount only behind an explicit activation decision                     |

## Planning

- White: `planning` was still a full-nav destination in legacy navigation and a
  direct route in `App.tsx`, but the page uses mock data and TODO-only actions.
- Red: leaving it exposed makes the app promise persisted planning work that
  does not exist.
- Yellow: the reserve-planning use case still has value through
  `/portfolio?tab=reserve-planning`.
- Black: keeping the page live increases support burden and undermines trust in
  the rest of the modeling flow.
- Green: redirect the route and remove the nav destination completely instead of
  leaving a local re-enable escape hatch.
- Blue: final decision is an archived redirect to the truthful reserve-planning
  destination.

Benefits: removes a dead-end primary-nav promise without deleting the
implementation. Trade-off: the standalone planning workspace is no longer a
recoverable runtime surface. Rollback requires a new owned implementation and a
fresh route-mount decision.

## KPI Manager And KPI Submission

- White: both routes are still reachable, but the manager has placeholder
  modals, TODO save logic, mock tab enablement, and local-only state; submission
  is also local-only.
- Red: users can reach half-live KPI surfaces that imply workflow completion and
  persistence that are not real.
- Yellow: the KPI concept may still be worth a later narrow slice, so outright
  deletion is premature.
- Black: quarantining only one of the two pages would leave the KPI surface
  inconsistent.
- Green: archive both KPI routes together and send them to a neutral safe
  destination instead of keeping a local override.
- Blue: final decision is to keep both routes as archived redirects to
  `/dashboard`.

Benefits: removes misleading direct-route exposure while preserving a fast
future reactivation path in source control. Trade-off: KPI pages are no longer
recoverable through client-side flags. Rollback requires a new owned
implementation and route decision.

## Reserves Demo

> Supersession (2026-06-18, Branch B): /reserves-demo and the four mock
> operational surfaces (/allocation-manager, /cash-management,
> /portfolio-analytics, /cap-tables) plus their transitively-dead component
> closure have been DELETED entirely. PR-1 (the firebreak) first build-excluded
> them as dev-only; this follow-up removes the page modules and 12 dead
> components outright. They are no longer mounted in any environment.
> scripts/check-prod-bundle.mjs (QUARANTINED_MODULES) remains as a permanent
> guard against reintroduction into the production bundle.

- White: `/reserves-demo` is a direct smoke-tested surface backed by a real page
  component, but it was missing from the mounted app route list.
- Red: leaving the page file unmounted makes CI pass depend on implementation
  luck instead of route truth.
- Yellow: it is not a core workflow destination or sidebar item, but it is still
  a deliberate demo surface that should remain directly reachable.
- Black: treating the demo as an accidental page guarantees future regressions
  in build-only and smoke lanes.
- Green: keep it mounted as an intentional internal-live route and cover it in
  route-perimeter tests.
- Blue: final decision is to preserve `/reserves-demo` as an intentionally
  mounted demo surface, separate from the core workflow perimeter.

Benefits: keeps the smoke target honest and makes the mounted route explicit in
governance. Trade-off: one non-core demo route remains directly reachable by
design. Rollback: remove only with an explicit demo retirement decision.

## Public Contracts

- White: `/shared/:shareId` and `/portal/:rest*` are not sidebar destinations,
  but they are still mounted entrypoints.
- Red: treating them like incidental leftovers risks breaking externally
  addressable links during perimeter reduction.
- Yellow: the portal is not active product scope yet, but the catch-all is still
  the current auth/access-denied entrypoint.
- Black: deleting either route without an explicit contract decision would
  create accidental regressions while hiding them from internal navigation
  review.
- Green: keep both routes mounted and label them as public contracts in the
  governance registry and active docs.
- Blue: final decision is to preserve `/shared/:shareId` and `/portal/:rest*` as
  intentional public contracts during stabilization.

Benefits: makes the perimeter reduction honest without breaking external entry
points. Trade-off: two non-core routes remain mounted by design. Rollback:
replace only through an explicit deprecation or activation plan.

## Compass

- White: Compass route files exist on the server, but they are explicitly
  mock-backed and not mounted.
- Red: counting unmounted mock endpoints as delivered product scope distorts
  planning and docs.
- Yellow: the underlying valuation sandbox logic may still be useful later.
- Black: mounting it prematurely would create a second unfinished surface during
  core lifecycle stabilization.
- Green: keep it unmounted and label it experimental until an activation
  decision is made.
- Blue: final decision is experimental and unmounted, not part of the live
  product surface.

Benefits: reduces false scope and keeps Sprint 4 focused on real exposure.
Trade-off: Compass remains intentionally out of the shipped surface. Rollback:
add a separate activation spec and server mount gate before exposing it.
