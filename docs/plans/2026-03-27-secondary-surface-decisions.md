---
status: ACTIVE
last_updated: 2026-03-27
---

# Secondary Surface Decisions

## Summary

| Surface          | State                      | Owner Path                                                                                                              | Exposure Control                               | Rollback                                                                   |
| ---------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `planning`       | Quarantined by default     | `client/src/App.tsx`, `client/src/components/layout/navigation-config.ts`, `client/src/lib/secondary-surface-policy.ts` | route redirect + nav removal via feature flags | set `FF_HIDE_PLANNING_SURFACE=false` or `VITE_HIDE_PLANNING_SURFACE=false` |
| `kpi-manager`    | Quarantined by default     | `client/src/App.tsx`, `client/src/lib/secondary-surface-policy.ts`                                                      | route redirect via feature flags               | set `FF_HIDE_KPI_SURFACES=false` or `VITE_HIDE_KPI_SURFACES=false`         |
| `kpi-submission` | Quarantined by default     | `client/src/App.tsx`, `client/src/lib/secondary-surface-policy.ts`                                                      | route redirect via feature flags               | set `FF_HIDE_KPI_SURFACES=false` or `VITE_HIDE_KPI_SURFACES=false`         |
| Compass          | Experimental and unmounted | `server/compass/routes.ts` plus future server mount gate                                                                | no server mount                                | mount only behind an explicit activation decision                          |

## Planning

- White: `planning` was still a full-nav destination in legacy navigation and a
  direct route in `App.tsx`, but the page uses mock data and TODO-only actions.
- Red: leaving it exposed makes the app promise persisted planning work that
  does not exist.
- Yellow: the reserve-planning use case still has value through
  `/portfolio?tab=reserve-planning`.
- Black: keeping the page live increases support burden and undermines trust in
  the rest of the modeling flow.
- Green: redirect the route and remove the nav destination by default while
  keeping an explicit opt-back-in switch.
- Blue: final decision is quarantine by default with redirect to the truthful
  reserve-planning destination.

Benefits: removes a dead-end primary-nav promise without deleting the
implementation. Trade-off: the standalone planning workspace is no longer a
default entry point. Rollback: re-enable with `FF_HIDE_PLANNING_SURFACE=false`
or `VITE_HIDE_PLANNING_SURFACE=false`.

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
- Green: gate both KPI routes together and send them to a neutral safe
  destination.
- Blue: final decision is to quarantine both routes together and redirect them
  to `/dashboard` by default.

Benefits: removes misleading direct-route exposure while preserving a fast
opt-back-in path for future work. Trade-off: KPI pages are no longer casually
discoverable until ownership returns. Rollback: re-enable with
`FF_HIDE_KPI_SURFACES=false` or `VITE_HIDE_KPI_SURFACES=false`.

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
