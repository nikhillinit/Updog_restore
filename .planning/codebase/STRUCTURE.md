# Directory Structure — Updog

> Generated 2026-04-07.

## Top-level Layout

```
C:\dev\Updog_restore\
├── client/                 # React 18 SPA (Vite root)
├── server/                 # Express 5 API + workers
├── shared/                 # Authoritative TypeScript domain logic
├── schema/                 # Standalone schema package (path alias @schema)
├── tests/                  # ALL test files (NOT alongside source)
├── packages/               # Internal monorepo packages
├── migrations/             # Drizzle SQL migrations
├── scripts/                # Build, validation, codegen, AI tooling
├── docs/                   # Documentation (REFLs, plans, ADRs, skills)
├── cheatsheets/            # 30+ how-to guides (`cheatsheets/INDEX.md`)
├── .planning/              # GSD planning artifacts (this folder)
├── .claude/                # Claude Code agent skills + discovery map
├── .a5c/                   # Babysitter project profile
├── .github/workflows/      # GitHub Actions
├── .husky/                 # Git hooks
├── .baselines/             # Performance / quality baselines
├── .backtest-worktrees/    # Backtest isolation worktrees
├── .devcontainer/          # VS Code devcontainer config
├── api/                    # Vercel-style serverless function adapter (lint-ignored)
├── archive/                # Legacy code preserved for reference (lint-ignored)
├── ml-service/             # Standalone Python ML service (separate compose)
├── tools/                  # Tooling, including custom ESLint plugins
├── types/                  # Ambient .d.ts files
├── workers/                # Top-level worker scripts (legacy / lint-ignored)
├── assets/                 # Static assets (alias @assets)
├── dist/                   # Build output (gitignored)
├── coverage/               # Test coverage reports (gitignored)
└── node_modules/           # (gitignored)
```

## `client/` — React SPA

```
client/
├── index.html              # Vite entry HTML
├── tsconfig.json           # Client-specific TS config
├── public/                 # Static assets served as-is
│   ├── fonts/
│   └── .well-known/
├── rum/                    # RUM browser snippets (lint-ignored)
└── src/
    ├── main.tsx            # ENTRY: createRoot + StrictMode + emergency rollback check
    ├── App.tsx             # Router + providers (Wouter, QueryClient, Tooltip, FundContext, LPContext, FeatureFlagProvider)
    ├── index.css
    ├── adapters/           # Store ↔ API payload mappers (e.g., fund-store-adapters)
    ├── ai/                 # Client-side AI integration helpers
    ├── api/                # Type-safe API clients (reserve-engine-client, etc.)
    ├── app/                # Route control flags, app-shell config
    ├── components/         # Reusable UI (feature-organized)
    │   ├── ui/             # shadcn/ui primitives (button, dialog, NumericInput, etc.)
    │   ├── layout/         # sidebar, dynamic-fund-header, navigation-config
    │   ├── reports/        # tear-sheet-dashboard, k1, capital-account
    │   ├── onboarding/     # GuidedTour
    │   └── demo/           # DemoBanner, etc.
    ├── config/             # Runtime config (client/src/config/runtime.ts)
    ├── contexts/           # FundContext, LPContext (React Context, not Zustand)
    ├── core/               # MIRROR of shared/core/* (authority lives in shared/)
    │   ├── reserves/       # ConstrainedReserveEngine, computeReservesFromGraduation, ReserveEngine
    │   ├── pacing/         # PacingEngine
    │   ├── cohorts/        # CohortEngine, resolvers
    │   ├── capitalAllocation/  # periodLoopEngine
    │   ├── graduation/     # GraduationRateEngine
    │   ├── moic/, liquidity/, optimization/
    │   └── flags/          # unifiedClientFlags, flagAdapter (CANONICAL flag entry)
    ├── debug/              # fetch-tap, wizard-trace
    ├── domain/             # Domain types
    ├── engines/            # Wizard engines / formula calculators
    ├── features/           # Feature-organized component bundles
    ├── hooks/              # Custom hooks (use* prefix)
    ├── lib/                # Pure utility libs (cashflow, fee-calculations, fund-calc-v2, queryClient, decimal-config, etc.)
    ├── machines/           # XState wizard state machines (modeling-wizard, etc.)
    ├── metrics/            # Client metric helpers
    ├── monitoring/         # Sentry shim (noop.ts when DSN absent)
    ├── pages/              # Route components (lazy-loaded via React.lazy)
    │   ├── dashboard.tsx, portfolio.tsx, performance.tsx
    │   ├── fund-setup.tsx, fund-model-results.tsx
    │   ├── reports.tsx, financial-modeling.tsx
    │   ├── sensitivity-analysis.tsx, reserves-demo.tsx, pipeline.tsx
    │   ├── settings.tsx, help.tsx, not-found.tsx
    │   ├── lp/             # LP portal (dashboard, fund-detail, capital-account, performance, reports, settings)
    │   ├── admin/          # ui-catalog
    │   ├── portal/         # access-denied
    │   └── shared-dashboard.tsx
    ├── providers/          # FeatureFlagProvider, etc.
    ├── schemas/            # Client-only Zod schemas
    ├── selectors/          # zustand selectors
    ├── services/           # Client services
    ├── shared/             # Shared client modules
    ├── state/              # DEPRECATED state/useFundStore (forbidden by ESLint)
    ├── stores/             # zustand stores (CANONICAL: useFundStore)
    ├── styles/             # brand-tokens.css, demo-animations.css
    ├── theme/              # Chart theme provider
    ├── types/              # Client-side TS types
    ├── utils/              # pLimit, resilientLimit, etc.
    └── workers/            # Browser web workers (simulation.worker.ts, strategy.worker.ts)
```

## `server/` — Express API + Workers

```
server/
├── main.ts                 # ENTRY: invokes bootstrap()
├── bootstrap.ts            # 5-phase startup (env → providers → server → listen)
├── server.ts               # createServer(cfg, providers) — http.Server with WebSocket
├── app.ts                  # makeApp() — Express middleware chain
├── providers.ts            # buildProviders(cfg) — DI for cache/queue/rate-limit stores
├── routes.ts               # Route mounting helper
├── config.ts, env.ts       # Env loading (loadEnv)
├── db.ts, db-serverless.ts # Drizzle Postgres client (Neon serverless OR pg)
├── db-schema.ts            # Centralized table refs
├── storage.ts, storage-runtime-policy.ts
├── flags.ts                # Server feature flags
├── logger.ts, errors.ts    # Pino logger + error types
├── metrics.ts              # prom-client registry
├── health.ts               # Healthz/readyz state machine
├── otel.ts                 # OpenTelemetry SDK init
├── http.ts                 # HTTP utility helpers
├── redis.ts                # Redis connection
├── seed-demo-data.ts       # Demo data seeder
├── version.ts              # App version helper
├── vite.ts                 # Vite middleware for dev SSR (Replit/dev only)
├── websocket.ts            # Socket.io server entry
├── nats-bridge.ts          # NATS message bridge
│
├── adapters/               # External adapter implementations
├── agents/                 # AI agent server endpoints
├── api/                    # API spec helpers
│   └── specs/              # OpenAPI specs
├── cache/                  # Cache abstraction
├── compass/                # Compass internal feature
├── config/                 # CSP, swagger, env loading
├── contracts/              # API contract guards (funds-endpoint-ownership, funds-boundary-guard)
├── core/                   # Server-side mirror of domain logic
│   ├── market/, reserves/
├── data/                   # Data fixtures / static reference data
├── database/, db/          # Migration runners + schema split
│   └── schema/, migrations/
├── docs/                   # Server-specific docs
├── engine/                 # Engine adapters, fault-injector (test-only)
├── examples/               # Lint-ignored example code
├── health/                 # Healthz state machine
├── infra/                  # Infrastructure helpers
│   ├── circuit-breaker/, observability/
├── lib/                    # Server libraries
│   ├── auth/, crypto/, redis/, request-values.ts, logger.ts
├── metrics/                # Domain metrics (variance-metrics, etc.)
├── middleware/             # Express middleware (auth, RLS, validation)
├── migrations/             # Server-side migration helpers
├── observability/          # OTel/metrics-demo
├── openapi/                # OpenAPI generation
├── otel/                   # OTel resources
├── queues/                 # BullMQ queues (backtesting, report-generation, simulation, redis-connection, registry)
├── routes/                 # ~50 route modules
│   ├── admin/, portfolio/, public/, v1/
│   ├── __tests__/          # Co-located route tests (server-side, in addition to tests/)
│   └── *.ts                # ai, allocations, backtesting, calculations, cashflow, cohort-analysis, dashboard-summary, deal-pipeline, error-budget, flags, fund-config, funds, health, interleaved-thinking, investments, liquidity, lp-*, metrics-rum*, monte-carlo, operations, performance-api, portfolio-companies, scenario-analysis, sensitivity, etc.
├── rum/                    # Server-side RUM endpoints
├── security/               # Security utilities (lint-exempted: integration-guide.ts)
├── services/               # ~70 domain services (see ARCHITECTURE.md)
│   ├── pdf-generation/     # PDF builder modules (sync, pure)
│   └── __tests__/
├── shared/                 # Server-only shared utilities
├── telemetry/              # Telemetry helpers
├── types/                  # Server TS types
├── utils/                  # Server utilities (singleflight-enhanced, etc.)
│   └── __tests__/
├── validators/             # Input validators
├── websocket/              # WebSocket modules (dev-dashboard, etc.)
└── workers/                # Background workers (capital-call-status, lp-materialized-view-refresh, scenarioGeneratorWorker)
```

## `shared/` — Authoritative Domain Code

```
shared/
├── schema.ts               # Drizzle schema (root)
├── schema-lp-reporting.ts  # LP reporting tables
├── schema-lp-sprint3.ts    # Sprint 3: capital calls, distributions, documents, notifications
├── core/                   # AUTHORITATIVE calculation engines
│   ├── reserves/           # ReserveEngine, ConstrainedReserveEngine, reserves-v11
│   ├── pacing/             # PacingEngine
│   ├── cohorts/            # CohortEngine
│   ├── capitalAllocation/
│   ├── graduation/
│   ├── moic/, liquidity/, optimization/
├── lib/                    # Shared libraries
│   ├── decimal-config.ts   # CANONICAL decimal.js wrapper (enforced by ESLint)
│   ├── finance/, fund-calc.ts, reserves-v11.ts
├── charting/               # Chart helpers
├── config/                 # Shared config
├── constants/              # Shared constants
├── contracts/              # Shared contracts
├── examples/               # Reference examples
├── feature-flags/, flags/  # Flag definitions
├── generated/              # Codegen output
├── migrations/             # Migration helpers
├── privacy/                # Privacy utilities
├── schemas/                # Zod schemas
│   └── examples/
├── security/               # Security primitives
├── types/                  # Shared TS types
├── utils/                  # Shared utilities
│   ├── __tests__/, pLimit.ts, resilientLimit.ts
└── validation/             # Validation helpers
```

## `tests/` — All Test Files Live Here

```
tests/
├── unit/                   # 100+ test files; project-routed by extension
│   ├── adapters/, api/, app/, auth/, bootstrap/
│   ├── bug-fixes/, cache/, cohorts/, components/, config/
│   ├── contexts/, contract/, core/, data/, database/
│   ├── debug/, engines/, flags/, hooks/, legacy/
│   ├── lib/, machines/, middleware/, monitoring/, pages/
│   ├── performance/, phase2a/, phase2b/, phase3/
│   ├── portfolio-optimization/, queues/, reserves/
│   ├── routes/, routing/, schema/, scripts/, security/
│   ├── server/, services/, shared/, storage/, stores/
│   ├── tool-evaluation/, truth-cases/, utils/, validation/
│   ├── websocket/, workers/
│   └── __snapshots__/
├── integration/            # ~45 integration tests (own vitest config)
│   ├── global-setup.ts     # GLOBAL bootstrap (Milestone 0A migration done 2026-03-26)
│   ├── setup.ts            # Per-worker hydration
│   ├── in-process-route-harness.ts
│   ├── base-url.ts
│   └── *.test.ts, *.spec.ts (40+ files)
├── e2e/                    # Playwright tests
├── perf/                   # Performance benchmarks (Node scripts, lint-ignored)
│   └── baselines/
├── chaos/                  # Toxiproxy + WASM simulator chaos tests
│   └── wasm-simulator/, docker-compose.toxiproxy.yml
├── rls/                    # Row Level Security tests
├── api/, agents/, a11y/    # API contract, agent, accessibility tests
├── factories/, fixtures/   # Test data factories
│   ├── excel-parity/, golden-datasets/
├── helpers/, mocks/, utils/, shared/
│   ├── mocks/upstash-redis.ts, metrics-mock.ts, server-logger.ts
├── parallel/               # Parallel test orchestration
├── quarantine/             # 37 documented quarantine files (REPORT.md)
├── regressions/            # Reflection system regression tests
├── setup/                  # Setup files used by all configs
│   ├── vitest.setup.ts, jsdom-setup.ts, node-setup.ts, node-setup-redis.ts
│   ├── test-infrastructure.ts, db-delegate-link.ts, global-teardown.ts
│   ├── reserves-setup.ts, global-setup.testcontainers.ts
├── synthetics/             # Synthetic monitoring tests
├── load/, k6/, performance/ # Load/k6 tests (separate runtime, lint-ignored)
├── visual/, smoke/         # Visual regression / smoke
├── eslint/, types/         # ESLint rule tests, type tests
├── migrations/             # Migration tests
└── constants/              # Test constants
```

## Naming Conventions

| Element            | Convention                        | Example                                      |
| ------------------ | --------------------------------- | -------------------------------------------- |
| React component    | PascalCase                        | `DashboardCard.tsx`                          |
| Page file          | kebab-case                        | `fund-setup.tsx`, `fund-model-results.tsx`   |
| Service            | kebab-case                        | `fund-persistence-service.ts`                |
| Route              | kebab-case                        | `deal-pipeline.ts`                           |
| Hook               | `use` prefix, camelCase           | `useFundData.ts`, `useGraduation.tsx`        |
| Test file          | matches source + `.test.{ts,tsx}` | `useFundStore.test.ts`                       |
| Spec file          | `.spec.ts` (mostly integration)   | `monte-carlo-2025-market-validation.spec.ts` |
| Quarantine         | `*.quarantine.test.ts(x)`         | `operations-endpoint.quarantine.test.ts`     |
| Worker file        | kebab-case + `-worker`            | `capital-call-status-worker.ts`              |
| Schema file        | `schema*.ts`                      | `schema-lp-reporting.ts`                     |
| Custom ESLint rule | `eslint-rules/no-*.cjs`           | `no-hardcoded-fund-metrics.cjs`              |

## Path Aliases

| Alias       | Resolves To                              |
| ----------- | ---------------------------------------- |
| `@/*`       | `client/src/*`                           |
| `@/core/*`  | `client/src/core/*`                      |
| `@/lib/*`   | `client/src/lib/*`                       |
| `@shared/*` | `shared/*`                               |
| `@server/*` | `server/*` (TS only, not Vitest)         |
| `@schema`   | `schema/src/index.ts` or `shared/schema` |
| `@assets`   | `assets/`                                |

## Test File Placement Rules (CRITICAL)

- **Server tests:** `tests/unit/**/*.test.ts` — must be `.ts` extension
- **Client tests:** `tests/unit/**/*.test.tsx` — must be `.tsx` extension (jsdom
  env)
- **Integration:** `tests/integration/**/*.test.ts` (separate config:
  `vitest.config.int.ts`)
- Co-located tests in `client/src/<dir>/__tests__/` are **NOT picked up** by the
  client vitest project — they must be moved to `tests/unit/**` (per memory note
  "Client Test File Placement"). Recently `lib/__tests__/` files were moved to
  `tests/unit/lib/` (commit `01b87889`).
- Server tests under `server/<dir>/__tests__/` are also **not auto-discovered**
  by the unit project — those `__tests__/` folders exist but rely on the
  integration runner or are vestigial.

## Lint-Ignored Directories

From `eslint.config.js:46-125`:

- `dist/`, `coverage/`, `.vite/`, `.vercel/`, `.claude/`, `node_modules/`,
  `build/`
- `scripts/`, `auto-discovery/`, `workers/`, `types/`, `tools/`
- `ai-utils/`, `server/examples/`, `docs/`, `msw/`
- `eslint-rules/`, `*.cjs`, `src/`, `k6/`, `tests/k6/`, `tests/perf/`,
  `tests/performance/*.js`
- `archive/`, `_archive/`, `.migration-backup/`, `.backup/`
- `Default Parameters/`, `anthropic-cookbook/`, `api/`, `.venv/`
- `vitest.config.*.ts`, `*.config.ts`, `*.config.js`, `drizzle.config.ts`
