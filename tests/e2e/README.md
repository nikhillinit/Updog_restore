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

Fresh command: `npm run build:web` on 2026-05-11.

Build status: passed.

Warning groups:

| Warning group               | Current output                                                                                                                    | Decision                     | Rationale                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Sourcemap resolution        | No sourcemap resolution warnings for `tooltip`, `dialog`, `select`, `collapsible`, `sheet`, or `form`.                            | `fixed`                      | The warnings came from unused Next-style client directives in Vite/Preact component modules; those directives are gone.                        |
| Ineffective dynamic imports | No mixed static/dynamic import warnings for `LazyResponsiveContainer.tsx`/Recharts or `services/funds.ts`/`inflight.ts`.          | `fixed`                      | The Recharts wrapper no longer pretends to split `ResponsiveContainer`, and `funds.ts` uses a single import style.                             |
| Large chunk size            | `assets/index-*.js` for the user-triggered PDF export runtime remains above 500 kB after minification, around 1.6 MB in this run. | `accepted lazy PDF baseline` | Bundle stats show the chunk is dominated by `@react-pdf`/PDFKit/fontkit/yoga and is loaded from the tear-sheet export path, not the app shell. |

Do not change Vite `manualChunks` casually. Prior regression coverage expects
automatic chunking, and the remaining large PDF chunk should be handled only by
a dedicated bundle-size plan if export latency becomes a product issue.
