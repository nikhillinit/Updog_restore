---
status: ACTIVE
last_updated: 2026-08-18
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

## Architecture

- **Frontend (`/client`)**: React SPA with feature-based component organization,
  custom hooks, and analytical engines (ReserveEngine, PacingEngine,
  CohortEngine)
- **Backend (`/server`)**: Express.js API with Zod validation, modular routes,
  and storage abstraction layer
- **Shared (`/shared`)**: Common TypeScript types, Drizzle ORM schemas, and Zod
  validation schemas
- **Data Flow**: React -> TanStack Query -> Express API -> PostgreSQL/Redis ->
  Worker processes for background calculations
- **Workers**: Background job processing with BullMQ for reserve calculations,
  pacing analysis, and Monte Carlo simulations

### Key Directories

- `client/src/components/` - Reusable UI components (feature-organized)
- `client/src/core/` - Analytics engines (reserves, pacing, cohorts)
- `client/src/pages/` - Application routes and page components
- `server/routes/` - API endpoint definitions
- `tests/` - Comprehensive test suite (API, performance, UI)

For the deep architecture-grounding reference (deployment surfaces, schema
inventory, routing mechanisms), see [docs/ARCHI.md](docs/ARCHI.md).

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Shadcn/ui, TanStack
  Query, Recharts/Nivo, React Hook Form
- **Backend**: Node.js, Express.js, TypeScript, PostgreSQL, Drizzle ORM,
  BullMQ + Redis, Zod validation
- **Testing**: Vitest (test.projects: server/Node.js + client/jsdom), React
  Testing Library
- **Infrastructure**: Docker Compose, Prometheus monitoring, Winston logging
- **Dev Tools**: ESLint, TypeScript strict mode, concurrent dev servers

## Coding Conventions

- **Components**: PascalCase files (`DashboardCard.tsx`), functional components
  with hooks
- **Files**: kebab-case for multi-word files (`fund-setup.tsx`)
- **Hooks**: `use` prefix (`useFundData`)
- **API**: RESTful endpoints, Zod validation, consistent error responses
- **Imports**: Path aliases (`@/` for client, `@shared/` for shared types)
- **Testing**: Tests alongside source files, comprehensive coverage with Vitest
- **Patterns**: Composition over inheritance, custom hooks for business logic,
  error boundaries
- **Type Safety**: TypeScript strict mode enabled, NEVER use `any` type
  (`@typescript-eslint/no-explicit-any: 'error'`)
- **Quality Gates**: Run `/pre-commit-check` before commits - linting, type
  checking, and tests MUST pass

### Path Aliases (vite.config.ts)

- `@/` -> `client/src/`
- `@shared/` -> `shared/`

## Development

```bash
npm install
npm run dev
```

### Health Checks

- `npm run doctor` - Complete health check (all systems)
- `npm run doctor:quick` - Fast module resolution check
- Windows canonical verification path:
  `& .\scripts\windows-node-env.ps1 npm.cmd run doctor`

### Node.js Compatibility

- **Supported contract**: Node.js `>=20.19.0` and npm `>=10.8.0` per
  `package.json engines`
- **Preferred local baseline**: `.nvmrc` pins local development to `v20.19.5`
- **Pinned automation/toolchain line**: `package.json volta` pins Node `20.19.0`
  and npm `10.9.2`
- **Tolerated but non-baseline**: newer Node lines such as Node 22 may satisfy
  `engines`; re-verify with the doctor path before relying on them

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
