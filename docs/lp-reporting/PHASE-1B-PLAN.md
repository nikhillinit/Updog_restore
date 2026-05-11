---
last_updated: 2026-05-11
---

# LP Reporting Phase 1b -- UI Plan

Branch: `feature/lp-reporting-ui-phase-1b` Backend status: FROZEN through Phase
1b. UI consumes existing `/api/funds/:fundId/metric-runs/dry-run`,
`/api/funds/:fundId/imports/ledger/dry-run`, and
`/api/funds/:fundId/imports/valuation-marks/dry-run` only.

## No-Go list

- No `server/**` edits, no new contracts in `shared/contracts/**`, no new schema
  in `shared/schema/**`. Consume existing locked contracts.
- No commit affordance. Phase 1b is read-only/dry-run only -- the protected
  dry-run endpoints are the only mutation surface, and they do not write to the
  database.
- No new router primitive. Mirror the existing wouter `Route` /
  `APP_ROUTES.push` pattern in `client/src/App.tsx`.
- No `Number(value)` or arithmetic on decimal-string money. Format via
  `Intl.NumberFormat` with string-only parsing or `decimal.js`.
- No client tests under `client/src/**/__tests__/` -- tests live in
  `tests/unit/**` per the project memory note on test discovery.
- No emoji in any source, test, or doc file.

## Page sketches

Each page lives at `/lp-reporting/<slug>` and is registered as an `APP_ROUTES`
entry (so it inherits the standard `AppLayout` chrome and protected guard). The
pages in batch 1b.1 are placeholder shells -- the full layouts below are the
contract for batches 1b.2-1b.5.

### `/lp-reporting/ledger` (cash-flow events ledger)

- Header: page title, currency selector (USD-only for Phase 1b), "as of" date
  picker.
- Filters card: event type multi-select, date range, perspective (`lp_net` /
  `fund_gross` / `vehicle`).
- Ledger table: chronological cash-flow events with paid-in / distributions /
  NAV columns. Decimal strings rendered through `formatDecimalCurrency` only.
- Empty state: "No cash-flow events recorded yet. Use the Imports page to upload
  a ledger CSV or Notion export."
- Phase 1b.1 status: placeholder "Phase 1b.2 pending" empty state in a single
  shadcn `Card`.

### `/lp-reporting/valuations` (valuation marks)

- Header: page title, mark-source filter.
- Marks table: company name, mark date, fair value, confidence level, source.
  Confidence level rendered as a colored shadcn `Badge`.
- Mark history drawer (Phase 1b.4): per-company timeline of marks.
- Empty state: "No valuation marks recorded yet."
- Phase 1b.1 status: placeholder "Phase 1b.3 pending".

### `/lp-reporting/metrics` (DPI / RVPI / TVPI / MOIC / IRR)

- Header: page title, "as of" date picker, perspective selector.
- "Run dry-run" button: posts to `POST /api/funds/:fundId/metric-runs/dry-run`
  via the `useMetricsDryRun` hook. The result is the locked `LpMetricRunResults`
  shape from the contract barrel.
- Metric cards: DPI, RVPI, TVPI, MOIC, Net IRR, Gross IRR. All values are
  decimal strings -- the cards render via `formatDecimalRatio` and `formatIrr`.
- XIRR diagnostic strip: per-perspective (net / gross) status rendered via
  `formatXirrConvergence` -- the function maps the
  `(convergence, boundHit, failureReason)` tuple to a deterministic label, tone
  (`ok | warn | fail`), and human-readable description.
- Phase 1b.1 status: placeholder "Phase 1b.4 pending".

### `/lp-reporting/imports` (ledger / valuation imports)

- Header: page title.
- Source picker: ledger CSV vs. valuation marks CSV vs. Notion.
- File picker / textarea for CSV payload (Phase 1b.5 wire-up).
- "Validate" button: posts to the matching dry-run endpoint via
  `useLedgerImportDryRun` or `useValuationMarkImportDryRun`. Both parse
  responses with `ImportDryRunResponseSchema` from the contract barrel.
- Reconciliation summary card: parsed rows / valid / invalid / duplicates plus
  the reconciliation totals from the dry-run response.
- Errors / warnings tables: row-level issues from the dry-run response.
- No commit button -- Phase 1b is dry-run only.
- Phase 1b.1 status: placeholder "Phase 1b.5 pending".

## Hook data contracts

All three hooks are `useMutation` wrappers around the existing protected dry-run
routes. Each parses the response with the locked Zod schema from
`@shared/contracts/lp-reporting`, surfaces the parsed type, and throws a typed
`Error & { code?: string; status?: number }` on non-OK responses (mirroring
`useSensitivityRuns`).

| Hook                                   | Endpoint                                                  | Response schema              |
| -------------------------------------- | --------------------------------------------------------- | ---------------------------- |
| `useMetricsDryRun(fundId)`             | `POST /api/funds/:fundId/metric-runs/dry-run`             | `LpMetricRunResultsSchema`   |
| `useLedgerImportDryRun(fundId)`        | `POST /api/funds/:fundId/imports/ledger/dry-run`          | `ImportDryRunResponseSchema` |
| `useValuationMarkImportDryRun(fundId)` | `POST /api/funds/:fundId/imports/valuation-marks/dry-run` | `ImportDryRunResponseSchema` |

A null `fundId` rejects synchronously with `fundId is required` (matches
`useSensitivityRuns` behavior). On Zod parse failure the hook throws with
`code = 'CONTRACT_PARSE_ERROR'` so the page can render a clearer error envelope
than the generic network failure path.

## Formatter data contracts

All formatters live in `client/src/lib/format/lp-reporting/` and are pure
functions. Decimal-string in / display string out. Null inputs (allowed by
`LpMetricRunResultsSchema` for ratios that are undefined when contributions are
zero) render as the LP-friendly placeholder `"--"`.

- `formatDecimalCurrency(value, currency = 'USD')`: uses `Intl.NumberFormat`.
  Parses the decimal string with `decimal.js` -- never `Number(value)`.
- `formatDecimalRatio(value, precision = 2)`: renders a multiple with a trailing
  `x`, e.g. `"1.25x"`.
- `formatIrr(value)`: renders a percentage from a decimal-string ratio, e.g.
  `"15.00%"`.
- `formatXirrConvergence(diagnostic)`: maps the diagnostic tuple to
  `{ label, tone, description }`. `convergence === 'converged'` always returns
  `tone = 'ok'`. `'bounded_high' | 'bounded_low'` -> `'warn'`. `'failed'` ->
  `'fail'`.

## Navigation decision

`NavItem` in `client/src/config/navigation.ts` is a flat shape; it does NOT
support nested children. The two existing nav arrays (`LEGACY_NAV_ITEMS`,
`NEW_IA_NAV_ITEMS`) are both flat. Adding a grouped entry would require widening
the `NavItem` interface, which would be a structural change beyond the scope of
this batch.

**Decision:** add 4 flat entries to BOTH `LEGACY_NAV_ITEMS` and
`NEW_IA_NAV_ITEMS`, prefixed `lp-reporting-*`, each with a `path` under
`/lp-reporting/`. The 4 entries appear contiguously in both arrays so the
sidebar groups them visually.

| id                        | label      | icon        | path                       |
| ------------------------- | ---------- | ----------- | -------------------------- |
| `lp-reporting-ledger`     | Ledger     | `FileText`  | `/lp-reporting/ledger`     |
| `lp-reporting-valuations` | Valuations | `BarChart3` | `/lp-reporting/valuations` |
| `lp-reporting-metrics`    | Metrics    | `LineChart` | `/lp-reporting/metrics`    |
| `lp-reporting-imports`    | Imports    | `Upload`    | `/lp-reporting/imports`    |

If a future batch widens `NavItem` to support children, the New IA entries can
be folded into a single grouped "LP Reporting" entry without changing the URLs.

## Verification

- `TZ=UTC npx vitest run tests/unit/lib/format/lp-reporting/ tests/unit/hooks/lp-reporting/ tests/unit/pages/lp-reporting/ --reporter=verbose`
- `npm run check`
- `npm run baseline:check`
- `git diff --stat -- server/ shared/contracts/ shared/schema/` must be empty.
