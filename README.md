---
status: ACTIVE
last_updated: 2026-07-11
---

# POVC Fund-Modeling Platform

## Current Product Truth

The authoritative user flow is:

`/fund-setup -> review -> publish -> /fund-model-results/:fundId`

Current secondary-surface exposure is intentionally narrow:

- `planning` is an archived entrypoint and permanently redirects to
  `/portfolio?tab=reserve-planning`
- `kpi-manager` and `kpi-submission` are archived entrypoints and permanently
  redirect to `/dashboard`
- `/reserves-demo`, `/allocation-manager`, `/cash-management`,
  `/portfolio-analytics`, and `/cap-tables` are deleted;
  `scripts/check-prod-bundle.mjs` (`QUARANTINED_MODULES`) guards reintroduction
  by source-path substring (the cap-tables token is the module name `CapTables`,
  not the `/cap-tables` route)
- `/shared/:shareId` is an intentional public shared-link contract
- `/portal/:rest*` is an intentional public entrypoint that currently resolves
  to access denied
- Compass remains experimental and unmounted on the server
- MOIC rankings must come from the live fund-scoped contract with provenance;
  sample rankings are not a production fallback
- Browser auth uses a 24-hour HS256 JWT in a host-only HttpOnly cookie with a
  signed, jti-bound CSRF token. Plan 2's named identities, explicit grants,
  fail-closed fund checks, deactivation, and jti revocation remain enforced.
  Machine/service Bearer JWTs remain supported; mixed credentials are rejected.
  See ADR-036 and ADR-037 in [DECISIONS.md](DECISIONS.md)
- Investment round routes enforce fund scope on create, list, and read; the
  `enable_investment_rounds` flag remains off for production until explicit
  readiness gates are accepted
- LP dashboard/profile widget routes are mounted in both active server surfaces.
  LP Reporting Surface-A report-package JSON/CSV exports are
  production-trust-qualified for the PRD #996 Surface-A scope: partner/admin
  role gates, fund-scope checks, locked/exported workflow gates, H9/evidence
  blockers, `h9Stamp`, and `contentHash` provenance are enforced. ADR-027 scopes
  visual watermarking out for these machine-readable artifacts.
  `/api/lp/reports/*` remains a separate LP report-center path and any future
  PDF/report-center watermark requirement needs its own issue or PRD amendment.

## Development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run check
npm run validate:core
npm run build && npm run build:verify
npm run release:check   # canonical end-to-end release gate (Docker/WSL2)
```

## Authoritative Docs

- [Build Readiness](docs/BUILD_READINESS.md)
- [Secondary-Surface Decisions](docs/plans/2026-03-27-secondary-surface-decisions.md)
- [Current-State Steelman Roadmap](docs/plans/2026-06-22-current-state-steelman-roadmap.md)

## Historical Note

Older roadmap and audit material elsewhere in the repo should be treated as
historical context unless it matches the documents above and the live app,
route-policy, feature-flag, and API-contract behavior.
