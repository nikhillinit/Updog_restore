---
status: ACTIVE
last_updated: 2026-03-28
---

# Build Readiness Verification Report

## Current Readiness

The repo is currently judged by the live lifecycle and active validation lanes,
not by older roadmap checkpoints.

Authoritative product surface:

- routed fund setup is the production modeling flow
- review publishes before routing to results
- model results is the post-publish destination
- `planning`, `kpi-manager`, and `kpi-submission` are archived redirect-only
  entrypoints, not live product surfaces
- `/shared/:shareId` remains an intentional public shared-link contract
- `/portal/:rest*` remains an intentional public entrypoint that currently
  resolves to access denied
- Compass is unmounted and experimental, not part of build readiness

## Required Validation Commands

```bash
npm run validate:core
```

## Surface Status

- `planning`: archived route that redirects to `/portfolio?tab=reserve-planning`
- `kpi-manager`: archived route that redirects to `/dashboard`
- `kpi-submission`: archived route that redirects to `/dashboard`
- `/shared/:shareId`: public contract preserved for shared dashboard links
- `/portal/:rest*`: public contract preserved as the access-denied portal entrypoint
- `server/compass/routes.ts`: explicit experimental/unmounted status

## Authoritative References

- [README](../README.md)
- [Development Spec Set](plans/2026-03-26-development-spec-set.md)
- [Secondary-Surface Decisions](plans/2026-03-27-secondary-surface-decisions.md)

## Historical Note

Earlier build-readiness audit content has been superseded by the commands and
surface-status rules above. Treat older references as historical unless they
align with the current docs and live route behavior.
