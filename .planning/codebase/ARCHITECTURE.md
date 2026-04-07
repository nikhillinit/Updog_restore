# Architecture — Updog

> Generated 2026-04-07.

## Pattern

**Three-tier feature-organized monorepo** with explicit boundaries:

```
client/  ──┐
shared/  ──┤── strict ESLint boundary (no client→server, no server→client)
server/  ──┘
```

- **Frontend:** React 18 SPA with file-based feature organization, lazy-loaded
  routes via `wouter`, server state via `@tanstack/react-query`, client state
  via `zustand` + XState wizards
- **Backend:** Express 5 API + BullMQ workers + Postgres (Drizzle ORM) + Redis
  (ioredis or memory://)
- **Shared core:** Pure TypeScript calculation engines (reserves, pacing,
  cohorts, capital allocation, graduation, MOIC, optimization, liquidity) —
  single source of truth for fund math (Milestone 3 outcome)
- **Internal packages:** `packages/agent-core/`, `packages/codex-review-agent/`,
  `packages/test-repair-agent/`, `packages/bundle-optimization-agent/`,
  `packages/memory-manager/`, `packages/bmad-integration/`

## Process Topology

```
                          ┌──────────────────────────┐
                          │   Vite dev server         │
   browser ─────HTTP────► │   client/index.html       │
                          │   port 5173 (proxied)     │
                          └────────────┬─────────────┘
                                       │ /api/* proxy
                                       ▼
                          ┌──────────────────────────┐
                          │   Express API             │
                          │   server/main.ts          │
                          │   → bootstrap()           │
                          │   → createServer()        │
                          │   port 5000 (default)     │
                          └────┬────────────┬────────┘
                               │            │
                  ┌────────────┘            └─────────┐
                  ▼                                    ▼
         ┌─────────────────┐                ┌─────────────────┐
         │   PostgreSQL    │                │      Redis      │
         │  (Drizzle ORM)  │                │   (BullMQ +     │
         │   schema.ts +   │                │    rate limit)  │
         │  schema-lp-*.ts │                │   memory:// fb  │
         └─────────────────┘                └────────┬────────┘
                                                     │
                                            ┌────────┴────────┐
                                            │ BullMQ workers  │
                                            │ (server/workers)│
                                            └─────────────────┘
```

## Bootstrap Sequence (`server/bootstrap.ts`)

`server/main.ts` invokes `bootstrap()` which runs five named phases:

1. **PHASE 0: START** — log startup
2. **PHASE 1: ENV LOAD** — `loadEnv()` from `server/config/index.ts`; validates
   `DATABASE_URL`, `REDIS_URL`, JWT secrets, queue toggles
3. **PHASE 2: PROVIDERS** — `buildProviders(cfg)` from `server/providers.ts`
   builds cache, rate limit store, queue clients (single source of truth for
   runtime mode: `redis | memory`)
4. **PHASE 3: SERVER CREATE** — `createServer(cfg, providers)` from
   `server/server.ts`, returns http.Server with WebSocket attached
5. **PHASE 4: LISTEN** — `server.listen(cfg.PORT)` then `setReady(true)`; writes
   `TEST_READY_FILE` for integration test handshake (machine-readable contract
   per Milestone 0A — see ADR / `docs/STABILIZATION-ROADMAP.md` Milestone 0A)

Graceful shutdown: SIGTERM/SIGINT → `setReady(false)` → `server.close()` →
`providers.teardown()` → `process.exit(0)`. 10s force-close fallback.

## Express App Layers (`server/app.ts:33` → `makeApp()`)

```
helmet (CSP, HSTS, COEP)
  ↓
custom security headers (X-Frame-Options, Referrer-Policy, X-XSS-Protection)
  ↓
strict CORS (no wildcards in prod; dev allows localhost)
  ↓
content-type validation (POST/PUT/PATCH must be application/json)
  ↓
request id (`crypto.randomUUID()`) → `req.rid`
  ↓
express-rate-limit (window/max from RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX env)
  ↓
JSON body parser
  ↓
route mounts:
  /api/v1/reserves        → routes/v1/reserves.ts
  /api/flags              → routes/flags.ts
  /api/cashflow           → routes/cashflow.ts
  /api/health             → routes/health.ts
  /api/calculations       → routes/calculations.ts
  /api/ai                 → routes/ai.ts
  /api/interleaved-thinking
  /api/scenario-analysis
  /api/allocations
  /api/allocation-scenarios
  /api/deal-pipeline
  /api/cohort-analysis
  /api/sensitivity
  ... (~50+ route modules in server/routes/)
  ↓
swagger-jsdoc spec at /docs (config in server/config/swagger.ts)
  ↓
bull-board UI at /admin/queues
  ↓
error handler
```

## Data Flow

### Read path (server-rendered metric)

```
React component (e.g. client/src/pages/dashboard.tsx)
  → useQuery hook (TanStack Query)
  → fetch('/api/funds/:id/metrics')
  → Vite dev proxy ──► Express
    → middleware (auth, RLS context, rate limit)
    → server/routes/<resource>.ts
    → server/services/<resource>-service.ts
    → server/db.ts (Drizzle)
    → PostgreSQL
  ← JSON response
  ← TanStack Query cache
  ← React re-render
```

### Calculation path (heavy compute)

```
Wizard / form submit
  → POST /api/calculations
  → server/routes/calculations.ts validates with Zod
  → enqueue BullMQ job (server/queues/simulation-queue.ts)
  → server/workers/scenarioGeneratorWorker.ts (or piscina pool)
  → invokes shared/core/{reserves,pacing,cohorts,capitalAllocation}/...
  → writes calc-run record (server/services/calc-run-tracking.ts)
  → completion handler (server/services/calc-run-completion-handlers.ts)
  → snapshot service (server/services/snapshot-service.ts) writes versioned result
  → client polls /api/calc-runs/:id or subscribes via WebSocket
```

### Mutation path (idempotent)

```
Client store (zustand)
  → adapter (client/src/adapters/fund-store-adapters.ts) maps store → CreateV1/DraftWriteV1
  → POST /api/funds with Idempotency-Key
  → server/contracts/funds-endpoint-ownership.ts validates ownership
  → server/services/fund-persistence-service.ts (idempotent writes)
  → optimistic locking via configVersion column
  → snapshot version service publishes new state
```

## Key Abstractions

### Calculation Engines (`shared/core/`)

Pure functions, no I/O. Single source of truth per Milestone 3:

| Module                   | Entry                                              | Purpose                                                     |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------------------- |
| Reserves                 | `shared/core/reserves/ReserveEngine.ts`            | Reserve allocation, follow-on optimization (`reserves-v11`) |
| ConstrainedReserveEngine | `shared/core/reserves/ConstrainedReserveEngine.ts` | Reserves under constraints                                  |
| Pacing                   | `shared/core/pacing/PacingEngine.ts`               | Deployment pacing curves                                    |
| Cohorts                  | `shared/core/cohorts/CohortEngine.ts`              | Vintage cohort grouping                                     |
| Capital Allocation       | `shared/core/capitalAllocation/`                   | Period-loop capital deployment                              |
| Graduation               | `shared/core/graduation/`                          | Stage progression rates                                     |
| MOIC                     | `shared/core/moic/`                                | Multiple on invested capital                                |
| Liquidity                | `shared/core/liquidity/`                           | Liquidity event modeling                                    |
| Optimization             | `shared/core/optimization/`                        | Portfolio optimization                                      |

Mirrored at `client/src/core/*` for direct browser execution (e.g., wizard
previews).

### Phoenix probabilistic system (Phase 2)

- **Truth cases:** `tests/unit/truth-cases/` — `npm run phoenix:truth` is the
  canonical command (count is in drift; do not quote stale numbers per CHANGELOG
  note 2026-04-05)
- **Specialized agents:** `phoenix-precision-guardian`,
  `phoenix-truth-case-runner`, `phoenix-probabilistic-engineer`,
  `phoenix-capital-allocation-analyst`, `phoenix-reserves-optimizer`,
  `phoenix-xirr-fees-validator`, `phoenix-waterfall-ledger-semantics`
- **Routing:** `/phoenix-truth` and `/phoenix-phase2` slash commands

### Server services (`server/services/`)

Domain services sit between routes and the DB. ~70 modules. Naming:
`{domain}-service.ts` or `{domain}-calculator.ts`. Examples:

- `fund-persistence-service.ts`, `fund-state-derivation.ts`,
  `fund-state-read-service.ts`
- `monte-carlo-{engine,orchestrator,service-unified,simulation,streaming-engine}.ts`
- `variance-{tracking,calculator,alert-automation,alert-evaluation}.ts`
- `pdf-generation-service.ts` + `pdf-generation/` (sync builders, async fetch —
  see memory)
- `cache-{invalidation,warming,stats}-service.ts`
- `lp-{calculator,queries,cache,notification-service,audit-logger}.ts`

### React data layer

- **Server state:** TanStack Query — cache key conventions in
  `client/src/lib/queryClient.ts`
- **Client state:** zustand `useFundStore`
  (`client/src/stores/useFundStore.ts`); legacy `state/useFundStore` is
  **forbidden** by ESLint
- **Selectors:** `useFundSelector` wrapper (defaults to shallow equality) —
  direct `useFundStore(...)` with object/array return is rejected by ESLint
  `no-restricted-syntax` rules
- **Wizards:** XState state machines in `client/src/machines/`
- **Feature flags:** `client/src/core/flags/{unifiedClientFlags,flagAdapter}.ts`
  only

### Validation

- **Zod 3.25.76** at all I/O boundaries
- **Drizzle-Zod** generates request/response schemas from DB tables
- **Path-aware schema files:** `shared/schemas/`, `server/contracts/`,
  `client/src/schemas/`
- **Boundary contracts:** `server/contracts/funds-endpoint-ownership.ts`,
  `server/contracts/funds-boundary-guard.ts` (tested under
  `tests/unit/contract/`)

## Entry Points

| Surface             | Entry file                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Server (dev/prod)   | `server/main.ts` → `server/bootstrap.ts`                                                              |
| Server build output | `dist/index.js` (built by `scripts/build-server.mjs`)                                                 |
| Web app (dev)       | `client/index.html` → `client/src/main.tsx` → `client/src/App.tsx`                                    |
| Web app (prod)      | `dist/public/` (built by `vite build`)                                                                |
| Workers             | `server/workers/{capital-call-status-worker,lp-materialized-view-refresh,scenarioGeneratorWorker}.ts` |
| CLI (AI tools)      | `scripts/ai-tools/index.js` via `npm run ai`                                                          |
| Cron / scheduled    | (BullMQ delayed jobs; no separate scheduler)                                                          |

## Cross-cutting Concerns

- **Ready file handshake:** `TEST_READY_FILE` env var — bootstrap writes JSON
  `{port, baseUrl, pid}` after `setReady(true)`. Integration tests poll for this
  file instead of parsing logs (per Milestone 0A engineering rule).
- **Provider injection:** `server/providers.ts` is the single place where
  runtime mode (redis/memory, queue enabled/disabled) is decided. Tests mock
  providers via `tests/setup/test-infrastructure.ts`.
- **Logging:** Pino throughout (ADR-019). Winston is dependency-resident only —
  stub-mocked in client builds.
- **Error budget:** `server/routes/error-budget.ts`
- **Circuit breaker:** `server/infra/circuit-breaker/`
- **Rate limiter:** `express-rate-limit` + `rate-limit-redis` with
  `trust proxy 1` (REFL-010)
- **CSP:** `server/config/csp.ts` — `CSP_REPORT_ONLY=1` toggles report-only mode

## Authority Migration (Milestones 3-5)

Per `docs/STABILIZATION-ROADMAP.md`:

- **Milestone 3** — shared domain logic became authoritative; client and server
  now consume the same `shared/core/*` modules
- **Milestone 4** — finalization authority moved to server; one request owns the
  full lifecycle
- **Milestone 5** — backend boundaries cleaned; modular route registration; no
  fake persistence

## Architectural Drift Hazards

1. **Three alias maps** must stay in sync (`tsconfig.json`, `vite.config.ts`,
   `vitest.config.ts`) — see ADR-009
2. **Schema split** (`shared/schema.ts` + `schema-lp-reporting.ts` +
   `schema-lp-sprint3.ts`) means a new entity must be added in the right file or
   `drizzle-kit push` will miss it — see also `server/db-schema.ts` for
   centralized refs
3. **Engine duplication** — `client/src/core/*` mirrors `shared/core/*`. ADR-016
   / Milestone 3 declared `shared/core/*` authoritative; client copies are kept
   thin or re-export
4. **Two state-management eras** — XState wizards + zustand store + TanStack
   Query. Adding new flows: prefer XState for multi-step wizards, zustand for
   cross-page state, TanStack for server-derived state
