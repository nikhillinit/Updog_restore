# Testing — Updog

> Generated 2026-04-07. Sources: `vitest.config.ts`, `vitest.config.int.ts`,
> `package.json` scripts, `eslint.config.js`, `tests/`, `cheatsheets/`, memory.

## Frameworks & Versions

- **Vitest:** `3.2.4` — primary test runner
- **@vitest/ui:** dashboard mode (`npm run test:ui`)
- **jsdom:** `^26.1.0` — browser env for client tests
- **React Testing Library:** `@testing-library/react ^16.3.2` + `jest-dom` +
  `user-event`
- **Supertest:** `^7.2.2` — HTTP testing
- **Playwright:** `1.58.2` — E2E (smoke + visual + a11y via
  `@axe-core/playwright`)
- **fast-check:** `^4.5.3` — property-based testing
- **testcontainers:** `11.11.0` + `@testcontainers/postgresql` +
  `@testcontainers/redis`
- **TDD-Guard:** `tdd-guard-vitest` `0.1.6`
- **k6:** load testing (separate runtime, lint-ignored)
- **tinybench:** `^4.0.1` — micro benchmarks

## Vitest Project Layout (`vitest.config.ts`)

Two-project setup via `test.projects` (mandatory pattern per ADR-009):

### Project 1: `server`

- **Environment:** `node`
- **Includes:** `tests/unit/**/*.test.ts`, `tests/perf/**/*.test.ts`,
  `tests/regressions/**/*.test.ts`
- **Excludes:** `**/*.quarantine.test.ts`, `tests/quarantine/**/*`
- **Setup files (in order):**
  1. `tests/setup/node-setup-redis.ts` — **mocks Redis BEFORE any imports**
     (must be first)
  2. `tests/setup/db-delegate-link.ts` — wires DB delegate before tests
  3. `tests/setup/test-infrastructure.ts` — shared infra mocks
  4. `tests/setup/node-setup.ts` — Node-specific globals
- **Global teardown:** `tests/setup/global-teardown.ts`
- **JSX inject:** `import React from 'react'` (esbuild) — needed because some
  shared modules render JSX

### Project 2: `client`

- **Environment:** `jsdom` (`pretendToBeVisual: true`, `resources: 'usable'`)
- **Includes:** `tests/unit/**/*.test.tsx` ONLY
- **Excludes:**
  - `tests/quarantine/**/*`
  - `**/*.quarantine.test.tsx`
  - `tests/unit/fund-setup.smoke.test.tsx` (requires real browser)
  - `tests/unit/pages/portfolio-constructor.test.tsx` (imports removed
    `react-router-dom`)
- **Setup files:** `tests/setup/test-infrastructure.ts`,
  `tests/setup/jsdom-setup.ts`

### Shared options

- `globals: true`
- `clearMocks: true`, `restoreMocks: true`
- `isolate: true`
- `pool: 'threads'` (chosen for React 18 compat)
- `maxThreads: 4` in CI, unbounded locally
- `testTimeout: 30000` (Testcontainers tolerance)
- `hookTimeout: 20000`, `teardownTimeout: 5000`
- `retry: 2` in CI, 0 locally
- **Reporters:** `['default', 'github-actions']` in CI

### Test env vars (forced inside Vitest)

```
NODE_ENV=test
TZ=UTC
REDIS_URL=memory://                     # prevents real Redis
JWT_SECRET=test-jwt-secret-must-be-at-least-32-characters-long-for-hs256-validation
JWT_ALG=HS256
JWT_ISSUER=updog
JWT_AUDIENCE=updog-app
ALERTMANAGER_WEBHOOK_SECRET=test-alertmanager-webhook-secret-minimum-32-characters-long
```

## Test File Placement Rules (CRITICAL)

| Where                                | Status                                               |
| ------------------------------------ | ---------------------------------------------------- |
| `tests/unit/**/*.test.ts`            | Picked up by `server` project                        |
| `tests/unit/**/*.test.tsx`           | Picked up by `client` project                        |
| `tests/integration/**/*.test.ts`     | Run via `vitest.config.int.ts` (separate command)    |
| `client/src/**/__tests__/*.test.tsx` | **NOT picked up** by client project — must be moved  |
| `server/**/__tests__/*.test.ts`      | **NOT picked up** by server project — must be moved  |
| `tests/quarantine/**/*`              | Excluded; documented in `tests/quarantine/REPORT.md` |
| `**/*.quarantine.test.ts(x)`         | Excluded by extension                                |
| `**/*.template.test.ts(x)`           | Excluded — template files                            |

Recent example: 8 tests under `client/src/lib/__tests__/` were resurrected by
moving them to `tests/unit/lib/` (commit `01b87889`). See memory "Client Test
File Placement".

## Integration Tests (`vitest.config.int.ts`)

- **Separate config** from unit tests
- **Global server lifecycle:** `tests/integration/global-setup.ts` — installed
  2026-03-26 to fix the per-file server spawn/kill ceiling that was exhausting
  CI runners (~31 cycles → healthz timeout cascade). See memory "Integration
  Test Server Lifecycle (CI Ceiling)" and CHANGELOG entry "Integration Test
  Server Lifecycle Ceiling Removed".
- **Per-worker setup:** `tests/integration/setup.ts` (limited to worker
  hydration + native fetch restoration)
- **Ready-file handshake:** server writes `TEST_READY_FILE` JSON
  `{port, baseUrl, pid}` after `setReady(true)`. Tests poll for the file instead
  of parsing logs (Milestone 0A engineering rule).
- **Excluded file:** `tests/integration/fund-idempotency.spec.ts` is still in
  the exclude list (`vitest.config.int.ts:48`) with the original cascade comment
  — unclear whether it can now be re-enabled. Reconciliation note in CHANGELOG
  (2026-04-05/2026-04-06).
- **Run command:** `npm run test:integration` — uses
  `cross-env TZ=UTC vitest run -c vitest.config.int.ts`

### Other integration variants

- `vitest.config.route-int.ts` — route-specific integration runs
- `vitest.config.phase0-dbproof.ts` — Phase 0 cloud DB validation (Neon or
  testcontainers — see session memory "Phase 0 Cloud DB Migration")
- `vitest.config.testcontainers.ts` — testcontainers-driven runs

## Mocking Patterns

### Module mocks (test-time)

- `tests/mocks/upstash-redis.ts` — aliased via `vitest.config.ts:29`
- `tests/mocks/metrics-mock.ts` — aliased to `@/metrics/reserves-metrics`
- `tests/mocks/server-logger.ts` — aliased to `@/server/utils/logger`
- `tests/setup/node-setup-redis.ts` — installed FIRST in setup chain to prevent
  any real Redis import

### `vi.mock` gotchas

- **`vi.restoreAllMocks()` wipes implementations** — calling it in `afterEach`
  kills `vi.fn().mockResolvedValue()` set at declaration. See memory "Vitest
  restoreAllMocks Gotcha" / `feedback_vitest_restore_mocks.md`.
- **Global `vi.mock` pollutes all tests** — REFL-007.
- **Drizzle mock chain overwrite** — REFL-026.

### `vi.useFakeTimers()` + React hooks

- Wrap every `vi.advanceTimersByTime` in `act()` when the hook fires `setState`
  from inside `setInterval`/`setTimeout`. Pattern reference:
  `tests/unit/hooks/use-graduation.test.tsx:80`. See feedback "useFakeTimers +
  act".

### Database mocks

- Phase 2A tables (`fundConfigs`, `calcRuns`) are absent from the mock query
  interface — use service-level mocking for integration tests instead. See
  memory "DB Mock Query Interface Gaps".

## Test Categories

| Category            | Location                        | Run command                                        |
| ------------------- | ------------------------------- | -------------------------------------------------- |
| Unit (server)       | `tests/unit/**/*.test.ts`       | `npm test -- --project=server`                     |
| Unit (client)       | `tests/unit/**/*.test.tsx`      | `npm test -- --project=client`                     |
| Both                | `tests/unit/`                   | `npm test` / `npm run test:unit`                   |
| Integration         | `tests/integration/`            | `npm run test:integration`                         |
| Phoenix truth cases | `tests/unit/truth-cases/`       | `npm run phoenix:truth`                            |
| Contract            | `tests/unit/contract/`          | (part of unit run)                                 |
| RLS                 | `tests/rls/`                    | `npm run test:rls`                                 |
| Performance         | `tests/perf/`                   | (part of server project run)                       |
| Regressions         | `tests/regressions/`            | (part of server project run)                       |
| E2E (smoke)         | `tests/e2e/basic-smoke.spec.ts` | `npm run test:smoke` / `npm run test:e2e:smoke`    |
| Security            | `tests/integration/security/`   | `npm run test:security`                            |
| Chaos               | `tests/chaos/`                  | (manual; uses Toxiproxy compose)                   |
| Load (k6)           | `tests/k6/`, `tests/load/`      | (separate k6 runtime)                              |
| Visual              | `tests/visual/`                 | (Playwright)                                       |
| A11y                | `tests/a11y/`                   | `@axe-core/playwright`                             |
| Quarantine          | `tests/quarantine/`             | (excluded from default runs; tracked in REPORT.md) |

## Wave-based Testing

Test groupings tied to stabilization waves (see `package.json:62-86`):

- **Wave 1B** — `npm run test:wave1b` (Monte Carlo, AI, variance, cache,
  websocket, circuit breaker)
- **Wave 2** — `npm run test:wave2` (predictive cache, hooks, validation,
  telemetry, env detection)
- **Wave 3** — `npm run test:wave3` (components, hooks, lib, stores, machines)
- **Wave 4** — `npm run test:wave4` (reserves, cohorts, fee calculations,
  fund-calc, capital allocation, wizard)
- **Wave 5** — `npm run test:wave5` (logger, vitals, debug, monitoring, queues,
  components, units)
- **Wave 6** — `npm run test:wave6:{ops,client-workers,dev-runtime,packages}` +
  `validate:wave6`
- **Phase 4** — `npm run test:phase4{,:server,:client,:integration}` and
  `npm run validate:phase4`

## Phoenix Truth Cases

- **Location:** `tests/unit/truth-cases/`
- **Command:** `npm run phoenix:truth`
- **Authority:** Phoenix truth cases must pass before merging any calculation
  change (CLAUDE.md and babysitter conventions)
- **Count drift:** Two historical snapshots disagree —
  `docs/phase0-validation-report.md` (118/118 from 2026-01-21) vs
  `docs/PHOENIX-SOT/evidence-ledger.md` (107/107 from 2026-02-24). Always run
  the live command, never quote a number from docs (CHANGELOG note 2026-04-05).

## TypeScript Baseline Gate

- **Tool:** `tsc-baseline` `1.9.0`
- **Baseline file:** `.tsc-baseline.json` (currently **0 errors** as of
  2026-03-26 per CHANGELOG "TypeScript Baseline Fully Retired")
- **Command:** `npm run baseline:check` (also exposed as `npm run check`)
- **Pre-push hook:** `.husky/pre-push` runs `./scripts/validate-pr.sh` which
  calls `baseline:check`
- **Drift gotcha:** the pre-push hook compiles `client/`, `server/`, `shared/`
  separately, while local `npx tsc --noEmit` is a single pass. The pre-push
  catches TS4111 (index signature access) drift that local `tsc` misses. See
  memory "Pre-Push Baseline vs Local tsc".
- **Stale baseline:** if the baseline file reports 0 errors but the codebase has
  accumulated errors, every push fails with "NEW ERRORS DETECTED". Fix:
  `npm run baseline:save && git add .tsc-baseline.json && git commit`.

## Pre-push Hook & Pre-Commit

- **Husky:** `9.1.7`, with shim normalization in
  `scripts/normalize-husky-shims.mjs`
- **lint-staged** runs on every commit:
  - `*.{ts,tsx,js,jsx}` →
    `eslint --fix --max-warnings 0 --cache --no-warn-ignored` then Prettier
  - `*.{json,md,yml,yaml}` → Prettier only
- **Pre-push:** `npm run pre-push` → `./scripts/validate-pr.sh`
- **Pre-commit slash command:** `/pre-commit-check` (lint + typecheck + tests)

## Coverage

- **Provider:** v8
- **Reports:** `text`, `json`, `html`, `lcov` → `./coverage/`
- **Includes:** `client/src/**/*.{js,ts,tsx}`, `server/**/*.{js,ts}`,
  `shared/**/*.{js,ts}`
- **Excludes:** `node_modules/**`, `dist/**`, `coverage/**`,
  `**/*.config.{js,ts}`, `**/*.d.ts`, `migrations/**`, `scripts/**`,
  `.github/**`, `repo/**`, `ai-logs/**`, `observability/**`, `workers/**`,
  `tests/**`, `**/*.test.*`, `**/*.spec.*`

## CI / Cold-run vs Pre-push Sensitivity

When integration verifier reports tail-end failures from a cold `vitest run`,
distinguish flake from regression by re-running failing files standalone. The
pre-push hook runs the same suite in a warmer environment and reliably reports
the true state. Sensitivity-refactor-and-polish (2026-04-06) saw cold-run 10/5
failures vs pre-push 4010 passing. See memory "Pre-Push Hook vs Cold
Full-Suite".

## ESLint Test Rules

Test files (`tests/**/*.{ts,tsx}`, `**/*.{test,spec}.{ts,tsx}`) get relaxed
safety rules:

- All `@typescript-eslint/no-unsafe-*` rules **off**
- `@typescript-eslint/no-explicit-any` **off** for tests

But test files MUST follow:

- `custom/no-db-import-in-skipped-tests` (error) — Phase 5 regression gate to
  prevent pool creation at import time in skipped tests
- `custom/warn-stale-skips` (warn) — surface `.skip()` annotations missing
  `// SKIP: reason`

## Test Quarantine

- **Inventory:** `tests/quarantine/REPORT.md`
- **Current:** 37 documented quarantine files, 0 undocumented (per CHANGELOG
  2026-03-26)
- **Marker:** `@quarantine` JSDoc header + `*.quarantine.test.ts(x)` filename or
  location under `tests/quarantine/`

## Smart Test Selection

- `npm run test:smart` — runs only tests affected by recent file changes
  (`scripts/test-smart.mjs`)
- `npm run test:affected` — alias for `--only-affected`
- `/test-smart` slash command available

## Memory-mode Testing

- `npm run test:memory` — sets `REDIS_URL=memory://` and runs unit tests
- `npm run verify:no-redis` — fails the build if any code path can hit real
  Redis

## Test Helpers / Fixtures

- `tests/factories/` — test data factories (`@faker-js/faker`)
- `tests/fixtures/` — static fixtures including `excel-parity/` and
  `golden-datasets/`
- `tests/fixtures/lp-report-fixtures.ts` — `standardLPData`, `newLPData`,
  `earlyStageLP`, `matureFundLP`, `multiYearTransactionsLP` (per memory "Test
  Fixtures")
- `tests/helpers/`, `tests/mocks/`, `tests/utils/`, `tests/shared/`
- `tests/parallel/` — parallel test orchestration

## Solo-developer Code Review

- No PR reviews from teammates
- Use `/superpowers:requesting-code-review` for self-review
- Direct push to `main` is acceptable for small fixes (per CLAUDE.md
  `windows_environment` block)
