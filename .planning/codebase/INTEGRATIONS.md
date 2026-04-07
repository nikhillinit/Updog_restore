# External Integrations — Updog

> Generated 2026-04-07.

## Databases

### PostgreSQL (primary OLTP)

- **Schema location:** `shared/schema.ts`, `shared/schema-lp-reporting.ts`,
  `shared/schema-lp-sprint3.ts`
- **ORM:** Drizzle ORM `^0.45.1` with `drizzle-zod` for Zod schema generation
- **Migrations:** `migrations/` (managed by `drizzle-kit push`)
- **Drivers:**
  - Production / Vercel / Neon: `@neondatabase/serverless` `^0.10.4`
    (pooler-aware — JSON.stringify required for JSONB params per memory note)
  - Local docker / testcontainers: `pg` `8.17.1`
- **Connection module:** `server/db.ts`, `server/db-serverless.ts`
- **Schema split (server):** `server/db-schema.ts` (centralized table refs)
- **Multi-tenancy:** PostgreSQL Row Level Security (RLS) — see ADR-013,
  `docker-compose.rls.yml`, `tests/rls/`, `scripts/postgres-rls-init.sh`
- **Pool management:** `server/services/database-pool-manager.ts`
- **Cloud test DB:** Neon endpoint `ep-snowy-boat-ad1z3h07-pooler` (per memory:
  user's free-tier account)
- **Test mode:** Docker (`docker-compose.yml`) OR cloud Neon — Phase 0 dual-mode
  validated 2026-04-04
- **Studio:** `npm run db:studio` → drizzle-kit studio

### Redis

- **Primary use:** BullMQ queue backend, rate limiting (`rate-limit-redis`),
  session/cache layer
- **Driver:** `ioredis` `5.9.3` (preferred); `redis` `^4.7.1` legacy fallback
- **Connection module:** `server/queues/redis-connection.ts`,
  `server/lib/redis/`
- **Local:** `redis:7-alpine` via `docker-compose.yml` (port 6379, appendonly,
  256MB LRU)
- **Memory mode:** `REDIS_URL=memory://` activates an in-process stub; gated by
  `npm run verify:no-redis`
- **Upstash adapter:** `packages/agent-core/src/cache/UpstashAdapter.ts` (mocked
  in tests via `tests/mocks/upstash-redis.ts`)

## Queues / Background Jobs

- **Engine:** BullMQ `5.69.3`
- **Dashboard:** `@bull-board/express` 6.20.5 (mounted in `server/app.ts`)
- **Queue files:**
  `server/queues/{backtesting-queue,report-generation-queue,simulation-queue,redis-connection,registry}.ts`
- **Workers:**
  `server/workers/{capital-call-status-worker,lp-materialized-view-refresh,scenarioGeneratorWorker}.ts`
- **Anti-pattern enforcement:**
  `eslint-plugin-povc-security/require-bullmq-config` rule (warn) on
  `server/{workers,queues}/**`
- **PDF queue worker:** orchestrated via `report-generation-queue.ts` calling
  sync builders (`buildQuarterlyReportData`, `buildK1ReportData`,
  `buildCapitalAccountReportData`) — see memory note "PDF Generation Service
  Architecture"

## AI / LLM Providers

| Provider         | SDK                     | Version   | Server entrypoint                    |
| ---------------- | ----------------------- | --------- | ------------------------------------ |
| Anthropic Claude | `@anthropic-ai/sdk`     | `^0.71.2` | `server/services/ai-orchestrator.ts` |
| OpenAI           | `openai`                | `6.22.0`  | `server/services/ai-orchestrator.ts` |
| Google Gemini    | `@google/generative-ai` | `^0.24.1` | `server/services/ai-orchestrator.ts` |
| Ollama (local)   | `ollama`                | `0.6.3`   | `server/services/ai-orchestrator.ts` |

- **Routes:** `server/routes/ai.ts`, `server/routes/interleaved-thinking.ts`
- **Internal AI tooling CLI:** `npm run ai` → `node scripts/ai-tools/index.js`
- **AI agent packages:**
  `packages/{agent-core,codex-review-agent,test-repair-agent,bundle-optimization-agent,memory-manager}/`
- **Codex CLI:** External dependency (OpenAI's `codex` binary), invoked via
  `codex exec "..." --sandbox read-only` per memory reference; project-level
  wrapper at `packages/codex-review-agent/`

## Observability

### Tracing — OpenTelemetry

- `@opentelemetry/sdk-node` `^0.210.0`, auto-instrumentations, OTLP HTTP metrics
  exporter
- Server bootstrap: `server/otel.ts`, `server/observability/`,
  `server/telemetry/`
- Configurable via `docker-compose.observability.yml`

### Metrics — Prometheus

- `prom-client` `^15.1.3` registers metrics in `server/metrics.ts`
- Endpoints: `server/routes/metrics.ts`, `metrics-endpoint.ts`,
  `metrics-rum.ts`, `metrics-rum-v2.ts`
- Client builds receive a stub via `vite.config.ts:97-174` virtual plugin
  (avoids bundling `prom-client` into the SPA)
- Beware duplicate registration: see
  `docs/skills/REFL-022-prometheus-metrics-duplicate-registration.md`

### RUM / Web Vitals

- `web-vitals` `^5.1.0` loaded lazily in production
  (`client/src/main.tsx:66-69`)
- Endpoint: `server/routes/metrics-rum.ts`, `metrics-rum.guard.ts`
- Client RUM lives at `server/rum/`, `client/rum/`

### Error reporting — Sentry

- `@sentry/react` `10.39.0` — gated on `VITE_SENTRY_DSN`
- When DSN absent, all `@sentry/*` imports are aliased to
  `client/src/monitoring/noop.ts` at build time (`vite.config.ts:384`)
- Server-side import not present (Sentry is browser-only here)

### Logging — Pino

- `pino` + `pino-http` + `pino-pretty` (Pino is the standard per ADR-019)
- Server logger: `server/logger.ts`, `server/lib/logger.ts`
- Console-call ratchet at `scripts/guardrails/console-ratchet.mjs` (baseline 374
  disallowed calls)

## Authentication / Authorization

- **JWT:** `jsonwebtoken` `^9.0.3`, RS256 keys via `jwks-rsa` `3.2.2`
- **Default alg:** HS256 (test env); 32-char minimum `JWT_SECRET` enforced by
  `server/config.ts:16`
- **Issuer/audience defaults:** `updog` / `updog-app` (`server/config.ts:15`)
- **Auth modules:** `server/lib/auth/`, `server/middleware/` (rate limiting,
  request validation, RLS context)
- **Bypass switch:** `DISABLE_AUTH` env var (dev only)
- **Crypto:** `server/lib/crypto/`

## File Generation / Export

- **PDFs:** `@react-pdf/renderer` `4.3.2` — see
  `server/services/pdf-generation/` and
  `server/services/pdf-generation-service.ts`
- **Excel:** `exceljs` `4.4.0` — `server/services/xlsx-generation-service.ts`
- **CSV:** `csv-stringify`, `papaparse`, `csv-parse` (devDeps)
- **Email:** `server/services/email-service.ts` (no SMTP package in deps —
  likely uses HTTP webhook or external relay; verify provider before extending)
- **Slack:** `@slack/webhook` `7.0.7` — used for ops alerts; routes in
  `server/routes/operations.ts`
- **Notion:** `@notionhq/client` `^4.0.1` — `server/services/notion-service.ts`

## WebSocket / Realtime

- **Socket.io:** `socket.io` `^4.8.3` (server) + `socket.io-client` `^4.8.3`
  (client)
- **Raw WebSocket:** `ws` `^8.19.0`
- **Server entry:** `server/websocket.ts`, `server/websocket/`
- **Dev dashboard:** `server/websocket/dev-dashboard.ts`,
  `server/routes/dev-dashboard.ts`
- **Client hook:** `client/src/hooks/` (search for useWebSocket)

## Inter-service Messaging

- **NATS:** `nats` `2.16.0` (pinned override) — `server/nats-bridge.ts`

## Webhook Integrations

- **Alertmanager (Prometheus):** webhook signature verification via
  `ALERTMANAGER_WEBHOOK_SECRET` (test env defaults in `vitest.config.ts:172`)
- **Slack:** `@slack/webhook` for outbound notifications

## Feature Flags

- **Server flags:** `server/flags.ts`, `server/routes/flags.ts`
- **Client flags:** `client/src/core/flags/{unifiedClientFlags,flagAdapter}.ts`
  (canonical) — the older `@/lib/feature-flags` path is **forbidden** by ESLint
  `no-restricted-imports`
- **Shared flags:** `shared/feature-flags/`, `shared/flags/`
- **Tests:** `tests/unit/flags/`, `tests/integration/flags-routes.test.ts`,
  `tests/integration/flags-hardened.test.ts`

## Calculation Engines (cross-cutting domain integrations)

- **Reserves:** `shared/core/reserves/`, `client/src/core/reserves/`,
  `server/core/reserves/` — see `ConstrainedReserveEngine`, `reserves-v11.ts`
- **Pacing:** `shared/core/pacing/`, `client/src/core/pacing/`,
  `server/services/pacing-calculation-service.ts`
- **Cohorts:** `shared/core/cohorts/`, `client/src/core/cohorts/`
- **Capital allocation:** `shared/core/capitalAllocation/`,
  `client/src/core/capitalAllocation/`
- **Graduation rates:** `shared/core/graduation/`, `client/src/core/graduation/`
- **Liquidity / MOIC:** `shared/core/liquidity/`, `shared/core/moic/`
- **Optimization:** `shared/core/optimization/`,
  `server/services/portfolio-optimization-service.ts`
- **Monte Carlo:**
  `server/services/{monte-carlo-engine,monte-carlo-orchestrator,monte-carlo-service-unified,monte-carlo-simulation,streaming-monte-carlo-engine}.ts`
- **Stress / sensitivity:**
  `server/services/{stress-test-engine,one-way-sensitivity-engine,two-way-sensitivity-engine,sensitivity-run-service}.ts`
  (recently expanded — see commits `9e134b5f`, `bc592b38`, `7633fb51`)
- **Variance / fund metrics:**
  `server/services/{variance-tracking,variance-calculator,variance-alert-automation,fund-metrics-calculator,fund-metrics-attribution-service,actual-metrics-calculator}.ts`

## CI / Build Integrations

- **GitHub Actions:** `.github/workflows/` (audit memory notes: `services:`
  blocks pre-checkout, `hashFiles()` silent fallback, `exit 0` antipattern)
- **Codacy:** `.codacy.yml`
- **Hadolint:** `.hadolint.yaml`
- **Lighthouse CI:** `.lighthouserc.json` + `@lhci/cli`
- **Vercel:** `.env.vercel`, `.env.vercel.example`, `npm run vercel-build`

## External Dev Tools (not bundled, but referenced)

- **Codex CLI** (`codex exec ...`) — see CLAUDE.md and memory
  `reference_codex_cli.md`
- **Babysitter orchestration** — `.a5c/project-profile.json`, `babysitter:*`
  slash commands
- **GSD planning system** — `.planning/` directory, `/gsd-*` commands

## Environment Variable Conventions

- `.env`,
  `.env.{development,production,staging,preact,react,rls,vercel}.example`,
  `.env.local.example`
- **Critical vars:** `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (≥32 chars),
  `JWT_ISSUER`, `JWT_AUDIENCE`, `ALERTMANAGER_WEBHOOK_SECRET`,
  `VITE_SENTRY_DSN`, `ALLOWED_ORIGINS`, `RATE_LIMIT_WINDOW_MS`,
  `RATE_LIMIT_MAX`, `BUILD_WITH_PREACT`, `VITE_USE_PREACT`, `TEST_READY_FILE`,
  `CRON_SECRET`, `DISABLE_AUTH`, `CSP_REPORT_ONLY`, `ENABLE_QUEUES`
- **Validation:** `server/config/index.ts` (`loadEnv()`) — runs at bootstrap
  phase 1
- **Pre-deploy gate:** `npm run db:validate` (per CLAUDE.md and `db-validate`
  skill)
