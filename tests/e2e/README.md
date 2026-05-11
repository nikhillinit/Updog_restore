# E2E Tests

This directory contains Playwright browser tests under `tests/e2e/*.spec.ts`.

## What is actually scripted

Package scripts only expose the smoke run:

```bash
npm run test:smoke
npm run test:e2e:smoke
npm run test:e2e:lp-reporting
```

There are no package scripts named `test:e2e`, `test:e2e:all`,
`test:e2e:headed`, or `test:e2e:debug`.

`npm run test:e2e:lp-reporting` is a live API smoke guard for the LP reporting
package flow. It starts the API and Vite dev server, runs the metric run ->
evidence -> approval -> lock -> narratives -> package -> stored JSON -> stored
CSV browser path, and verifies both downloaded artifacts.

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

The LP reporting package guard uses `playwright.lp-reporting.config.ts` instead
of the default Playwright config because it needs a live backend, not the
preview-server/stubbed API setup used by the generic smoke project.

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

## Audit Closeout Launch Contract

Use these paths for reproducible local audits:

- Normal E2E/audit gates: run Playwright directly and let `playwright.config.ts`
  start its `webServer` preview. Example:
  `npx playwright test tests/e2e/basic-smoke.spec.ts --project=smoke --no-deps`.
- Interactive Vite inspection: run `npm run dev:client` in the foreground. Treat
  detached Vite processes in this Windows/Codex shell as unreliable for audit
  evidence.
- Fixture-backed screenshot review: use the generated static server at
  `output/playwright/current-audit/audit-static-server.mjs` as evidence tooling,
  not as source code.

Generated screenshots, videos, JSON reports, and `output/playwright/*` files are
audit evidence. Do not delete them as part of S1 closeout.

## Build Warning Classification

Fresh command: `npm run build` on 2026-05-11.

Build status: passed.

Warning groups:

| Warning group               | Current output                                                                                                                      | Decision         | Rationale                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Sourcemap resolution        | `tooltip.tsx`, `dialog.tsx`, `select.tsx`, `collapsible.tsx`, `sheet.tsx`, and `form.tsx` report unresolved original locations.     | `upstream/noise` | Build succeeds and the warnings affect diagnostic source mapping, not runtime audit truthfulness.                    |
| Ineffective dynamic imports | `LazyResponsiveContainer.tsx`/Recharts and `services/funds.ts`/`inflight.ts` are dynamically imported but also statically imported. | `defer`          | The warning is real, but fixing it is bundle-architecture work outside this audit closeout lane.                     |
| Large chunk size            | Main `index` chunk is above 500 kB after minification.                                                                              | `defer`          | Requires a separate bundle-size plan and should not be bundled into smoke, logo, or fund-context truthfulness fixes. |

Do not change Vite chunking, sourcemap, or dynamic-import architecture in this
lane unless a warning becomes a concrete audit failure.
