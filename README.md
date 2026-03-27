---
status: ACTIVE
last_updated: 2026-03-27
---

# POVC Fund-Modeling Platform

## Current Product Truth

The authoritative user flow is:

`/fund-setup -> review -> publish -> /fund-model-results/:fundId`

Current secondary-surface exposure is intentionally narrow:

- `planning` is quarantined by default and redirects to
  `/portfolio?tab=reserve-planning`
- `kpi-manager` and `kpi-submission` are quarantined by default and redirect to
  `/dashboard`
- Compass remains experimental and unmounted on the server

## Development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run baseline:check
npm run test:publish-orchestration
npm run test:phase4
npm run lint:phase4
```

## Authoritative Docs

- [Build Readiness](docs/BUILD_READINESS.md)
- [Development Spec Set](docs/plans/2026-03-26-development-spec-set.md)
- [Secondary-Surface Decisions](docs/plans/2026-03-27-secondary-surface-decisions.md)

## Historical Note

Older roadmap and audit material elsewhere in the repo should be treated as
historical context unless it matches the documents above and the live app
routing/navigation behavior.
