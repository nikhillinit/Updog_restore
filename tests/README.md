---
status: ACTIVE
last_updated: 2026-04-18
owner: Core Team
review_cadence: P90D
---

# Testing Guide

## Current entry points

- `npm test` or `npm run test:unit` - Vitest unit suite (`server` + `client`)
- `npm run test:integration` - integration suite via `vitest.config.int.ts`
- `npm run test:integration:routes` - route-focused integration suite
- `npm run validate:core` - baseline check plus active milestone validation with
  the embedded fund workflow server, client, integration, lint, and worker guard
  command chains
- `npm run test:smoke` or `npm run test:e2e:smoke` - Playwright smoke project
- `npm run test:ui` - Vitest UI
- `npm run test:quick` - faster Vitest run excluding `**/api/**`

There are no package scripts named `test:unit:watch`, `test:integration:watch`,
`test:e2e`, `test:e2e:all`, `test:e2e:headed`, or `test:e2e:debug`.

## Test split

### Unit tests

- Location: `tests/unit/`
- Runner: Vitest
- Command: `npm run test:unit`

### Integration tests

- Location: `tests/integration/`
- Runner: Vitest with `vitest.config.int.ts`
- Command: `npm run test:integration`

### Browser tests

- Locations: `tests/e2e/` and `tests/a11y/`
- Runner: Playwright
- Package scripts: smoke only (`npm run test:smoke`, `npm run test:e2e:smoke`)
- Everything else runs through Playwright directly, for example:

```bash
npx playwright test tests/e2e/fund-setup.spec.ts
npx playwright test --project=core
npx playwright test --headed
npx playwright test --debug
```

## Playwright config summary

- Config file: `playwright.config.ts`
- Base URL: `BASE_URL` if provided, otherwise `http://localhost:4173` locally
  and `http://127.0.0.1:4173` on CI
- Local server: Playwright builds and runs `npm run preview` automatically when
  `BASE_URL` is not set
- Projects: `smoke`, `core`, `pipeline`, `extended`, `performance`,
  `accessibility`, `production`, `mobile`, `firefox`, `webkit`
- Mobile emulation: `iPhone 13`

For more detail on browser coverage and accessibility commands, see
`tests/e2e/README.md` and `tests/a11y/README.md`.
