---
status: ACTIVE
last_updated: 2026-03-28
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
- `/shared/:shareId` is an intentional public shared-link contract
- `/portal/:rest*` is an intentional public entrypoint that currently resolves
  to access denied
- Compass remains experimental and unmounted on the server

## Development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run validate:core
```

## Authoritative Docs

- [Build Readiness](docs/BUILD_READINESS.md)
- [Secondary-Surface Decisions](docs/plans/2026-03-27-secondary-surface-decisions.md)

## Historical Note

Older roadmap and audit material elsewhere in the repo should be treated as
historical context unless it matches the documents above and the live app
routing/navigation behavior.
