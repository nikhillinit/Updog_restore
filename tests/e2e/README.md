# E2E Tests

This directory contains Playwright browser tests under `tests/e2e/*.spec.ts`.

## What is actually scripted

Package scripts only expose the smoke run:

```bash
npm run test:smoke
npm run test:e2e:smoke
```

There are no package scripts named `test:e2e`, `test:e2e:all`,
`test:e2e:headed`, or `test:e2e:debug`.

For all other E2E runs, use Playwright directly:

```bash
# Run one spec
npx playwright test tests/e2e/fund-setup.spec.ts

# Run a project from playwright.config.ts
npx playwright test --project=core

# Run headed or debug sessions
npx playwright test --headed
npx playwright test --debug

# Open the HTML report
npx playwright show-report
```

## Current Playwright config

- Config file: `playwright.config.ts`
- Base URL: `BASE_URL` if set; otherwise `http://localhost:4173` locally and
  `http://127.0.0.1:4173` on CI
- Local bootstrap: Playwright starts a preview server automatically with
  `npm run build && npm run preview -- --port=4173 --host=<host> --strictPort`
  when `BASE_URL` is not set
- Mobile device: `iPhone 13`

Current projects:

- `smoke`
- `core`
- `pipeline`
- `extended`
- `performance`
- `accessibility`
- `production`
- `mobile`
- `firefox`
- `webkit`

## Useful examples

```bash
# Smoke only
npx playwright test --project=smoke

# Mobile coverage (iPhone 13)
npx playwright test --project=mobile

# Accessibility project in tests/e2e/accessibility.spec.ts
npx playwright test --project=accessibility

# Production smoke against an external deployment
$env:BASE_URL="https://example.test"
npx playwright test tests/e2e/production-smoke.spec.ts --project=production
```

If a spec depends on backend services rather than local stubs, start the needed
infrastructure separately before running it.
