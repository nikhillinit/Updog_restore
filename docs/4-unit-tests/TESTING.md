# Testing Guidelines

## Test Framework

Vitest (see `vitest.config.mjs`) with two projects:

- `server` — Node.js environment
- `client` — jsdom environment (React Testing Library)

Integration tests use `vitest.config.int.ts`; testcontainers-based tests use `vitest.config.testcontainers.ts`. Playwright covers E2E/smoke.

## Running Tests

```bash
# Full unit suite (server + client projects); TZ=UTC is set via cross-env
npm test

# Server or client project only
npm test -- --project=server
npm test -- --project=client

# Specific test file(s)
npm test -- tests/unit/path/to/file.test.ts

# Change-aware selection
npm run test:affected

# Phoenix truth cases — MANDATORY for calculation changes
npm run phoenix:truth

# Reserve/cohort/fee calculation gate
npm run calc-gate

# Integration tests
npm run test:integration

# Faster feedback (skips API tests)
npm run test:quick
```

## Environment

- **TZ=UTC is required for all test runs.** It is built into `npm test` / `test:unit` via cross-env; set it explicitly (`TZ=UTC`) for any ad-hoc `vitest` invocation.
- Node.js `>=20.19.0` (`.nvmrc` pins `v20.19.5`).

## Test Organization

- `tests/unit/` — unit tests, including `tests/unit/truth-cases/` for Phoenix calculation truth cases
- `tests/integration/` — API/route integration tests
- `tests/api/`, `tests/e2e/`, `tests/smoke/`, `tests/perf/`, `tests/regressions/` — specialized suites
- Shared support: `tests/factories/`, `tests/fixtures/`, `tests/helpers/`, `tests/mocks/`
- Some tests are colocated beside source files
- Naming: `*.test.ts` / `*.test.tsx` (vitest), `*.spec.ts` (Playwright/contract)

## Writing Tests

- Test observable behavior (inputs -> outputs/persisted effects), never internal wiring
- Mock-pain tripwire: if mock setup exceeds the assertions, take a seam from the ladder (exported pure helper -> injectable client/adapter -> module mock -> integration test) or record the gap in `COVERAGE-DEBT.md`
- Critical-path floor: behavior touching auth, deletion, persistence, cost, or external request shape keeps at least one behavioral test
- Calculation paths: Decimal.js precision, no `parseFloat` in P0 files; truth cases must stay green
- No coverage-ignore comments, no config exclusions, no lowering coverage gates
- No emoji in test code or output strings

## Coverage Requirements

Not defined (no coverage thresholds configured in `package.json` / vitest config). Ad-hoc coverage: `npx vitest run --coverage --config vitest.config.mjs --configLoader native`.

## Per-Release Test Summaries

TRIP-test writes summaries as `docs/4-unit-tests/w<a>_v<x.y.z>_test.md` (week, version).
