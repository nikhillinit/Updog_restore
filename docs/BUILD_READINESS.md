---
status: ACTIVE
last_updated: 2026-07-12
---

# Build Readiness Verification Report

## Current Readiness

The repo is judged by live lifecycle, active validation lanes, production-bundle
verification, route policy, and current API contracts — not by older roadmap
checkpoints.

Authoritative product surface:

- routed fund setup is the production modeling flow
- review publishes before routing to results
- model results is the post-publish destination
- `planning`, `kpi-manager`, and `kpi-submission` are archived redirect-only
  entrypoints, not live product surfaces
- `/reserves-demo`, `/allocation-manager`, `/cash-management`,
  `/portfolio-analytics`, and `/cap-tables` are deleted;
  `scripts/check-prod-bundle.mjs` (`QUARANTINED_MODULES`) guards reintroduction
  by matching source-path substrings (`reserves-demo`, `allocation-manager`,
  `cash-management`, `portfolio-analytics`, `CapTables`) — a re-added surface is
  caught only if its module path contains one of those tokens (note `CapTables`,
  the module name, not the `/cap-tables` route)
- `/shared/:shareId` remains an intentional public shared-link contract
- `/portal/:rest*` remains an intentional public entrypoint that currently
  resolves to access denied
- Compass is unmounted and experimental, not part of build readiness
- Plan 2's identity slice and D4 browser transport are implemented: browser
  login sets a 24-hour HttpOnly JWT cookie plus signed jti-bound CSRF, while
  machine Bearer JWT compatibility remains explicit. `jti` revocation, per-user
  roles and grants, inactive-user rejection, fail-closed fund scope, and
  external production provisioning remain enforced; see ADR-036/ADR-037.
- Investment round create/list/read routes enforce fund scope through the parent
  investment before returning round data
- LP dashboard/profile widget routes are mounted in both active server surfaces
- LP Reporting Surface-A report-package JSON/CSV exports in
  `server/routes/lp-reporting/metric-runs.ts` are production-trust-qualified:
  partner/admin role gates, fund-scope checks, locked/exported workflow gates,
  H9/evidence blockers, `h9Stamp`, and `contentHash` provenance are enforced.
  ADR-027 scopes visual watermarking out for these machine-readable artifacts;
  `workers/report-worker.ts` is deleted, and the live `lp-report-generation`
  queue remains the separate legacy PDF/XLSX/CSV report path.
- `/api/lp/reports/*` generation/download in `server/routes/lp-api.ts` remains
  the LP-access report-center path backed by `lp-report-generation`. It is not
  the PRD #996 Surface-A export surface, and any future PDF/report-center
  watermark requirement needs its own issue or PRD amendment.

## Required Validation Commands

```bash
npm run check
npm run validate:core
npm run build && npm run build:verify
npm run release:check   # canonical release gate (Docker/WSL2; --skip-db is diagnostic only)
```

`npm run build:verify` executes `scripts/check-prod-bundle.mjs`; it must fail if
any quarantined module appears in the production bundle or if source maps are
emitted without `VITE_SOURCEMAP=true`.

`npm run release:check` (`scripts/release-check.mjs`) is the authoritative
end-to-end release gate — build, typecheck, prod-bundle verifier, and a
Testcontainers Postgres proof. CI green is baseline health, not release proof;
it needs Docker (WSL2 on Windows). The `--skip-db` subset is diagnostic only and
is not release proof.

CI exposes those contracts as two deliberately different lanes:

- `Static Release Diagnostic` runs `release:check -- --skip-db` for code PRs and
  is required by `CI Gate Status`, but its name and summary never call it
  release proof.
- `.github/workflows/release-proof.yml` runs the unmodified DB-backed command
  for merge groups, weekly main verification, and protected production releases.

## Production Schema Audit Gate

The production schema audit is a separate deployment gate run through the
reusable `.github/workflows/prod-schema-reconcile.yml` workflow and its
`production-schema` environment. Audit mode now fails unless every manifest has
exactly one clean `SKIP` decision. Apply remains explicit, operator-gated, and
outside `release:check`.

A full release requires a green, non-skipped `release:check` (including the
DB-backed partial-drift reconciliation proof), a clean production schema audit
(exactly one `SKIP` decision per manifest; workflow success alone is
insufficient), and an authenticated smoke against the deployed application.

`.github/workflows/release-production.yml` enforces the order against one exact
main SHA: full release proof, clean production schema audit, authenticated smoke
against the staged production deployment, Vercel promotion, then authenticated
smoke against the canonical production URL. Both smoke passes require health,
metrics, and dedicated login credentials before Playwright starts, so missing
credentials cannot produce a skipped green run.

Vercel's `Auto-assign Custom Production Domains` setting must remain disabled;
otherwise the Git integration can bypass this workflow and serve a main-branch
build before the schema audit. `Production` holds the promotion token and smoke
credentials, while `production-schema` holds only `PRODUCTION_DATABASE_URL`.

## Surface Status

- `planning`: archived route that redirects to `/portfolio?tab=reserve-planning`
- `kpi-manager`: archived route that redirects to `/dashboard`
- `kpi-submission`: archived route that redirects to `/dashboard`
- `/reserves-demo`: deleted; restore requires a new owned implementation and
  route decision
- `/allocation-manager`, `/cash-management`, `/portfolio-analytics`,
  `/cap-tables`: deleted; restore requires owned implementations and route
  decisions
- `/moic-analysis`: compatibility route only; canonical fund-context placement
  is tracked in the current-state roadmap
- `/shared/:shareId`: public contract preserved for shared dashboard links
- `/portal/:rest*`: public contract preserved as the access-denied portal
  entrypoint
- `server/compass/routes.ts`: explicit experimental/unmounted status

## Authoritative References

- [README](../README.md)
- [Secondary-Surface Decisions](plans/2026-03-27-secondary-surface-decisions.md)
- [Current-State Steelman Roadmap](plans/2026-06-22-current-state-steelman-roadmap.md)

## Historical Note

Earlier build-readiness audit content has been superseded by the commands,
surface-status rules, route-policy work, and production-bundle verifier above.
Treat older references as historical unless they align with the current docs and
live route behavior.
