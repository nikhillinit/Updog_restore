# Tech Stack — Updog (rest-express)

> Generated 2026-04-07 via sequential mapping (subagent Write blocked at session
> permission layer). Source of truth: `package.json`, `tsconfig.json`,
> `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `drizzle.config.ts`,
> `docker-compose.yml`.

## Project Identity

- **Name:** `rest-express` (internal: Updog / Press On Ventures fund modeling
  platform)
- **Version:** `1.3.2`
- **License:** MIT
- **Module type:** ESM (`"type": "module"`)
- **Repo root:** `C:\dev\Updog_restore`

## Runtime & Toolchain

- **Node.js:** `>=20.19.0` — pinned via `volta` to `20.19.0`
- **npm:** `>=10.8.0` — `packageManager` field pins `npm@10.9.0`
- **Package manager guard:** `scripts/check-package-manager.mjs` runs on
  `preinstall`
- **TypeScript:** `^5.9.3`, `target: ES2020`, `module: ESNext`,
  `moduleResolution: bundler`
- **TypeScript strictness:** `strict: true`, `noUncheckedIndexedAccess: true`,
  `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`,
  `noPropertyAccessFromIndexSignature: true`, `noFallthroughCasesInSwitch: true`
- **TS execution in dev:** `tsx 4.21.0` (used by `npm run dev:api` →
  `tsx server/main.ts`)
- **Bundler (web):** Vite `^6.4.2` (recently bumped from 5.4.21 for
  `GHSA-4w7w-66w2-5vf9`, see commit `6462ea5d`)
- **JSX runtime:** React 18 by default; **dual-mode build** —
  `BUILD_WITH_PREACT=1` (or `mode === 'preact'`) swaps in `preact/compat` via
  `vite.config.ts:369-396`
- **CSS:** Tailwind `3.4.18` + `tailwindcss-animate` +
  `@tailwindcss/typography` + `@tailwindcss/vite` 4.2.0 + PostCSS + LightningCSS
  for CSS minification

## Path Aliases (`tsconfig.json` + `vite.config.ts` + `vitest.config.ts`)

| Alias                  | Resolves To                                               |
| ---------------------- | --------------------------------------------------------- |
| `@/`, `@`              | `./client/src/`                                           |
| `@/core/*`             | `./client/src/core/*`                                     |
| `@/lib/*`              | `./client/src/lib/*`                                      |
| `@/server/*`           | `./server/*` (Vitest only — for test mocks)               |
| `@shared/*`, `@shared` | `./shared/*`                                              |
| `@server/*`            | `./server/*` (TS only)                                    |
| `@schema`, `@schema/*` | `./schema/src/index.ts` (TS) / `./shared/schema` (Vitest) |
| `@assets`              | `./assets`                                                |
| `@upstash/redis`       | mocked to `./tests/mocks/upstash-redis.ts` in tests       |

> **Drift hazard:** the alias map exists in three places (`tsconfig.json` paths,
> `vite.config.ts` resolve.alias, `vitest.config.ts` shared `alias` constant).
> Vitest `test.projects` do not inherit root `resolve.alias` — see ADR-009 for
> the explicit-declaration pattern.

## Frontend

- **React** `^18.3.1` + `react-dom` `^18.3.1`
- **Preact** `10.28.2` (opt-in alternate build target)
- **Routing:** `wouter` `^3.9.0` (NOT React Router — `react-router-dom` is
  removed; one quarantined test still references it:
  `tests/unit/pages/portfolio-constructor.test.tsx`)
- **State:**
  - `zustand` `5.0.11` — primary store (`useFundStore`)
  - `@xstate/react` `^6.0.0` + `xstate` `5.28.0` — wizard state machines
  - `@tanstack/react-query` `5.90.21` — server state
  - `immer` `^10.2.0`
- **Forms:** `react-hook-form` `^7.71.1` + `@hookform/resolvers` `^3.10.0` +
  `zod` `^3.25.76`
- **UI primitives:** Radix UI suite (`@radix-ui/react-*` ~30 packages), `cmdk`,
  `vaul`, `embla-carousel-react`, `@dnd-kit/*`
- **Icons:** `lucide-react` `^0.562.0`, `react-icons` `^5.4.0`
- **Charts:** `recharts` `3.7.0`, `chart.js` + `react-chartjs-2`,
  `@react-spring/web`, `framer-motion` `12.34.2`
- **PDF:** `@react-pdf/renderer` `4.3.2` (override on
  `@react-pdf/pdfkit ^4.1.0`); lazy-loaded — see CHANGELOG entry "Tear Sheet PDF
  Export Split Out Of Dashboard Chunk" (2026-03-26)
- **Spreadsheet/CSV export:** `exceljs` `4.4.0`, `papaparse`, `csv-stringify`
- **Decimal math:** `decimal.js` `^10.6.0` (must be imported through
  `@shared/lib/decimal-config` — enforced by ESLint `no-restricted-imports`)
- **Math:** `mathjs` `15.1.0`, `ml-levenberg-marquardt` `^5.0.0`
- **Web vitals:** `web-vitals` `^5.1.0` (loaded via `requestIdleCallback` in
  prod only — `client/src/main.tsx:66`)
- **Sentry:** `@sentry/react` `10.39.0` — gated on `VITE_SENTRY_DSN`; otherwise
  aliased to `client/src/monitoring/noop.ts` at build time

## Backend

- **HTTP framework:** `express` `5.2.1`
- **Hardening:** `helmet` `^8.1.0`, `cors` `^2.8.5`, `compression` `^1.8.1`,
  `body-parser` `^2.2.2`
- **Rate limiting:** `express-rate-limit` `^8.2.1` + `rate-limit-redis` `^4.3.1`
- **Sanitization:** `sanitize-html` `2.17.0`, `validator` `^13.15.26`
- **Logging:** `pino` `^9.9.0` + `pino-http` `^10.5.0` + `pino-pretty` `^13.1.3`
  (Pino is the standard per ADR-019). Winston `3.19.0` is still in dependencies
  but stub-mocked in client builds via `vite.config.ts` virtual plugin.
- **Telemetry:** `@opentelemetry/sdk-node` `^0.210.0`,
  `@opentelemetry/auto-instrumentations-node` `^0.68.0`,
  `@opentelemetry/exporter-metrics-otlp-http` `^0.210.0`,
  `@opentelemetry/resources` `2.5.1`, `@opentelemetry/semantic-conventions`
  `^1.39.0`
- **Metrics:** `prom-client` `^15.1.3` (also stub-mocked in client builds)
- **JWT auth:** `jsonwebtoken` `^9.0.3` + `jwks-rsa` `3.2.2` (HS256 default; min
  32-char `JWT_SECRET` required by `server/config.ts:16`)
- **Documentation:** `swagger-jsdoc` `^6.2.8`
- **WebSocket:** `socket.io` `^4.8.3` + `ws` `^8.19.0`
- **NATS:** `nats` `2.16.0` (pinned in `overrides`) — see
  `server/nats-bridge.ts`
- **Server entry:** `server/main.ts` → `server/bootstrap.ts` →
  `server/server.ts` (`createServer(cfg, providers)`)

## Data Layer

- **Postgres driver (serverless):** `@neondatabase/serverless` `^0.10.4`
- **Postgres driver (testcontainers/dev):** `pg` `8.17.1`
- **ORM:** `drizzle-orm` `^0.45.1` + `drizzle-zod` `^0.8.3`
- **Migrations:** `drizzle-kit` `0.31.9`, output to `./migrations` from three
  schema files: `shared/schema.ts`, `shared/schema-lp-reporting.ts`,
  `shared/schema-lp-sprint3.ts`
- **Redis client:** `ioredis` `5.9.3` (primary), `redis` `^4.7.1` (legacy
  fallback)
- **Cache (alt):** `@upstash/redis` `1.36.1` (devDeps; mocked in tests via
  `tests/mocks/upstash-redis.ts`)
- **Local store:** `lru-cache` `11.2.6`

## Workers & Queues

- **Queue engine:** `bullmq` `5.69.3`
- **Queue UI:** `@bull-board/api` + `@bull-board/express` 6.20.5
- **Concurrency primitives:** `p-limit` `7.3.0`, `p-map` `7.0.4`, `piscina`
  `5.1.4` (worker thread pool)
- **Queues defined:**
  `server/queues/{backtesting,report-generation,simulation}-queue.ts` (+
  `redis-connection.ts`, `registry.ts`)
- **Workers:**
  `server/workers/{capital-call-status-worker,lp-materialized-view-refresh,scenarioGeneratorWorker}.ts`
- **Memory-mode default:** `REDIS_URL=memory://` in tests, also supported in dev
  — see `npm run test:memory` and `scripts/verify-no-redis.ts`

## AI / LLM

- **Anthropic:** `@anthropic-ai/sdk` `^0.71.2`
- **Google Generative AI:** `@google/generative-ai` `^0.24.1`
- **OpenAI:** `openai` `6.22.0`
- **Local LLM:** `ollama` `0.6.3`
- **Server orchestrator:** `server/services/ai-orchestrator.ts`
- **Routes:** `server/routes/ai.ts`, `server/routes/interleaved-thinking.ts`

## Testing

- **Test runner:** `vitest` `3.2.4` (+ `@vitest/ui`)
- **Browser env:** `jsdom` `^26.1.0` for client; `node` env for server
- **React testing:** `@testing-library/react` `^16.3.2`,
  `@testing-library/jest-dom`, `@testing-library/user-event`
- **HTTP testing:** `supertest` `^7.2.2`
- **E2E:** `@playwright/test` `1.58.2` + `playwright` `1.58.2` +
  `@axe-core/playwright` `4.11.1`
- **Property-based:** `fast-check` `^4.5.3`
- **Containers:** `testcontainers` `11.11.0` + `@testcontainers/postgresql` +
  `@testcontainers/redis`
- **Test fixtures:** `@faker-js/faker` `10.3.0`
- **Benchmarking:** `tinybench` `^4.0.1`
- **Coverage:** `v8` provider; reports to `./coverage`
- **TDD-Guard:** `tdd-guard-vitest` `0.1.6`
- **Load testing:** `k6/` directory (different runtime)
- **Smoke runner:** `start-server-and-test` `^2.1.3`

## Linting / Formatting / Quality Gates

- **ESLint:** `9.39.2` (flat config in `eslint.config.js`)
- **TS plugin:** `@typescript-eslint/eslint-plugin` `8.53.0` + parser `8.53.0`
- **Plugins:** `eslint-plugin-react` 7.37.5, `eslint-plugin-react-hooks` 6.1.1,
  `eslint-plugin-jsx-a11y`, `eslint-plugin-import`,
  `eslint-plugin-unused-imports` 4.3.0, custom
  `tools/eslint-plugin-povc-security`, `eslint-import-resolver-typescript`
- **Custom rules:** `eslint-rules/no-hardcoded-fund-metrics.cjs`,
  `no-db-import-in-skipped-tests.cjs`, `warn-stale-skips.cjs`
- **Boundary enforcement:** server cannot import `client/src/*`; client cannot
  import `server/*` (`eslint.config.js:23-40`)
- **Prettier:** `3.8.1`
- **Husky:** `9.1.7` (+ `lint-staged` `^16.2.7`); pre-push runs
  `./scripts/validate-pr.sh`
- **Markdown:** `remark-cli` 12.0.1 + `remark-preset-lint-recommended`
- **Dependency analysis:** `madge` 8.0.0, `dependency-cruiser` 17.3.10
- **Bundle size:** `size-limit` + `@size-limit/file`, `rollup-plugin-visualizer`
  (writes `dist/stats.html` + `dist/stats.json`)
- **Lighthouse:** `@lhci/cli` `^0.15.1` (`.lighthouserc.json`)
- **Secret scanning:** `gitleaks` `^1.0.0`
- **Baseline gate:** `tsc-baseline` `1.9.0` — `npm run baseline:check` is the
  pre-push gate (currently 0 errors per CHANGELOG
  `2026-03-26 — TypeScript Baseline Fully Retired`)

## Build / Deploy

- **Web build:** `npm run build:web` → `vite build --mode preact` →
  `dist/public/`
- **Server build:** `npm run build:server` → `node scripts/build-server.mjs` →
  `dist/index.js`
- **Postbuild verification:** `node scripts/verify-build.mjs`
- **Vercel build:** `npm run vercel-build` (uses default React mode, not preact)
- **Bundle budgets:** `node scripts/check-budgets.cjs` (`npm run bundle:check`)
- **Devcontainer:** `.devcontainer/`

## Containers / Infra

- **Postgres:** `postgres:16-alpine` (`docker-compose.yml`); RLS init via
  `scripts/postgres-rls-init.sh`
- **Redis:** `redis:7-alpine`; appendonly + 256MB max + LRU
- **pgAdmin:** `dpage/pgadmin4:latest` on port 8080
- **Compose variants:** `docker-compose.{yml,dev,chaos,rls,observability}.yml`,
  `tests/chaos/docker-compose.toxiproxy.yml`, `ml-service/docker-compose.yml`
- **Chaos testing:** Toxiproxy, fault injection
  (`server/engine/fault-injector.ts`)

## Overrides (security pins)

```json
"overrides": {
  "nats": "2.16.0",
  "esbuild": "^0.25.10",
  "diff": "^8.0.3",
  "@react-pdf/pdfkit": "^4.1.0",
  "@isaacs/brace-expansion": "5.0.1",
  "axios": "1.13.5",
  "lodash": "^4.18.1",
  "lodash-es": "^4.18.1",
  "@lhci/cli": { "path-to-regexp": "^0.1.13" }
}
```

## Internal Packages (`packages/`)

- `agent-core` — `BaseAgent`, retry, monitoring, backtest runner
- `bmad-integration`
- `bundle-optimization-agent`
- `codex-review-agent` — wraps OpenAI Codex CLI
- `memory-manager`
- `test-repair-agent` — autonomous test failure detection/repair

## Key Configuration Files (top-level)

- `package.json` — single source of truth for scripts, deps, overrides
- `tsconfig.json` (+ `tsconfig.eslint.json`, `tsconfig.eslint.server.json`,
  `client/tsconfig.json`)
- `vite.config.ts`
- `vitest.config.ts` +
  `vitest.config.{base,int,route-int,phase0-dbproof,quarantine,testcontainers,minimal,time-travel}.ts`
- `eslint.config.js` + `eslint.security.config.js`
- `drizzle.config.ts`
- `tailwind.config.ts` + `postcss.config.js`
- `playwright.config.ts`
- `.tsc-baseline.json` — TypeScript error baseline (currently 0)
- `.lighthouserc.json`
- `.husky/` — git hooks
- `.dependency-cruiser.cjs`, `.codacy.yml`, `.hadolint.yaml`
