---
status: ACTIVE
last_updated: 2026-06-22
---

# Secondary Surface Decisions

## Summary

| Surface                                                                                                            | State                                   | Owner Path                                                          | Exposure Control                                                                                                                           | Rollback                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `planning`                                                                                                         | Archived redirect                       | `client/src/App.tsx`, `client/src/app/route-governance-registry.ts` | explicit route redirect                                                                                                                    | restore only via a new owned implementation and route decision                               |
| `kpi-manager`                                                                                                      | Archived redirect                       | `client/src/App.tsx`, `client/src/app/route-governance-registry.ts` | explicit route redirect                                                                                                                    | restore only via a new owned implementation and route decision                               |
| `kpi-submission`                                                                                                   | Archived redirect                       | `client/src/App.tsx`, `client/src/app/route-governance-registry.ts` | explicit route redirect                                                                                                                    | restore only via a new owned implementation and route decision                               |
| `/reserves-demo`                                                                                                   | Deleted (Branch B)                      | removed in branch chore/remove-mock-surface-pages                   | not mounted in any environment; `scripts/check-prod-bundle.mjs` guards reintroduction                                                      | re-create only via an owned implementation and a fresh route decision                        |
| `/allocation-manager`, `/cash-management`, `/portfolio-analytics`, `/cap-tables`                                   | Deleted (Branch B)                      | removed in branch chore/remove-mock-surface-pages                   | not mounted in any environment; `scripts/check-prod-bundle.mjs` guards reintroduction                                                      | re-create only via owned implementations and fresh route decisions                           |
| `/shared/:shareId`                                                                                                 | Public contract                         | `client/src/App.tsx`, `client/src/app/route-governance-registry.ts` | intentional public mount                                                                                                                   | remove only with an explicit external-link migration                                         |
| `/portal/:rest*`                                                                                                   | Public contract                         | `client/src/App.tsx`, `client/src/app/route-governance-registry.ts` | intentional public mount to access denied                                                                                                  | change only with an explicit portal activation or deprecation plan                           |
| Compass                                                                                                            | Experimental and unmounted              | `server/compass/routes.ts` plus future server mount gate            | no server mount                                                                                                                            | mount only behind an explicit activation decision                                            |
| Portfolio snapshot/version API (`/api/funds/:fundId/portfolio/snapshots`, `/api/snapshots/:snapshotId/versions/*`) | Archived (deleted; unmounted dead code) | removed in branch chore/archive-snapshot-version-surface            | never mounted in any environment (vestigial `server/routes/portfolio/index.ts` barrel imported by nobody; `lots.ts` mounted independently) | restore only via an owned implementation + an explicit makeApp/registerRoutes mount decision |

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

## Deleted Mock Operational Surfaces

Supersession (2026-06-18/19, Branch B): `/reserves-demo` and the four mock
operational surfaces (`/allocation-manager`, `/cash-management`,
`/portfolio-analytics`, `/cap-tables`) plus their transitively-dead component
closure have been **deleted entirely**. The firebreak first build-excluded them
as dev-only; the follow-up removed the page modules and their exclusive
components outright. They are no longer mounted in any environment.
`scripts/check-prod-bundle.mjs` (`QUARANTINED_MODULES`) remains as a permanent
guard against reintroduction into the production bundle.

- White: the pages existed, but they were mock/sample-backed or nav-orphaned and
  implied product capabilities the platform could not truthfully support.
- Red: leaving them mounted or bundled let users, QA, and future agents mistake
  sample-backed surfaces for product commitments.
- Yellow: each concept may return later, but only as an owned implementation
  with live contracts and a fresh route decision.
- Black: preserving dev-only route exceptions after deletion would keep stale
  documentation and tests alive.
- Green: delete the route/page/component closure and keep bundle quarantine as
  the anti-regression guard.
- Blue: final decision is Branch B deletion. Reintroduction requires a new owned
  implementation, route-policy entry, tests, and production-bundle verification.

Benefits: removes false product promises and shrinks the production trust
surface. Trade-off: these surfaces are no longer recoverable at runtime without
re-implementation. Rollback: revert the deletion branch or rebuild behind a new
owned route decision.

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

## Portfolio Snapshot / Version History API

- White: `server/routes/portfolio/{snapshots,versions}.ts` (+ the `index.ts`
  barrel that mounted them, plus `snapshot-version-service`,
  `version-comparison-service`, and the `version-pruning-worker`) were fully
  implemented but the barrel was never imported, so none of the routes were ever
  mounted. `lots.ts` is mounted on its own.
- Red: carrying an unmounted 15-route version-history API plus an unregistered
  daily pruning worker is dead weight that implies a capability the app does not
  expose.
- Yellow: the live `/api/timeline` router and the live `snapshot-service` (used
  by `shares.ts`) already cover the real, wired snapshot needs; the
  `forecastSnapshots` table is retained for them.
- Black: the only client caller, `useRestoreSnapshotVersion`, was an exported
  but uncalled hook; shipping it kept a 404-on-call path one wire away from
  users.
- Green: delete the unmounted routes, the barrel, the two exclusive services,
  the unregistered worker, the exclusive `version-schemas`, the dead client
  hook, and the three tests that target the deleted modules. Keep all DB tables
  (no migration).
- Blue: final decision is to archive (delete) the surface; git history preserves
  it if portfolio version-history is ever wired with an owned implementation and
  a real mount.

Benefits: removes ~15 uncalled routes, an unregistered worker, and a dead client
hook with zero impact on any live endpoint. Trade-off: the version-history
backend is no longer a recoverable runtime surface without re-implementation.
Rollback: revert the branch; the `snapshotVersions` table is left intact, so no
data is lost.

## Verified-Orphan Cleanup (PR-6)

Two zero-importer orphan files removed after parallel closure analysis +
adversarial verification across all nine reference channels (static/dynamic
import, path-string read, route registry, navigation-config, redirect map,
Playwright testMatch across all configs, server mount, worker registration):

- `server/routes/public/flags.ts` — DELETED. `@deprecated` legacy flags route,
  superseded by the secure `flagsRouter` (`server/routes/flags.ts`) mounted at
  `/api/flags` in both `app.ts` and `routes.ts`; `server.ts` had already removed
  it. Zero callers, tests, or registry hits.
- `client/src/components/common/ComingSoonPage.tsx` — DELETED. Pure-orphan
  minimal duplicate (legacy CSS) of `client/src/components/ComingSoonPage.tsx`.
- `client/src/components/ComingSoonPage.tsx` — KEPT as inventory. Richer variant
  with hub-specific named exports; currently unimported but retained by decision
  for future integration.

Follow-up completed: LP-sibling routes
(`lp-{capital-calls,distributions,documents,notifications}.ts`) are now mounted
for the live `/lp/dashboard` widgets in both active server surfaces. Keep them
covered by mount-parity tests so the 404 regression does not return.
`NotionIntegrationHub` + `notion-integration.tsx` remain dormant per the
keep-registry. The other nine `@deprecated` symbols have live callers and are
retained.
