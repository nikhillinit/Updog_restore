---
status: ACTIVE
audience: agents
last_updated: 2026-05-29
owner: "Platform Team"
review_cadence: P90D
categories: [planning, scenarios, forecasting]
keywords: [scenario-release-hardening, dual-forecast, forecast-modes, actuals]
---

# Scenario Forecast Modes And Actuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan red-green, then use superpowers:verification-before-completion before committing or opening a PR.

**Goal:** Make the existing dual-forecast surface truthful about forecast modes and actuals by separating as-of actual metrics from forward-looking forecast values without adding new routes, stores, dependencies, or scenario override types.

**Architecture:** Extend the existing `/api/funds/:fundId/dual-forecast` response in a compatibility-preserving way. Keep the existing `construction` and `current` point fields for consumers, but add explicit per-point actual/mode metadata so clients can distinguish `actual_metrics_calculator` values from `projected_metrics_calculator` forecast values. Update the dashboard to render actuals separately from forecast lines.

**Tech Stack:** TypeScript, Express, TanStack Query, React, Recharts, strict shared types, Vitest server/client unit tests.

---

## Inventory Summary

- PR #733 is merged into `main` as `6b6f5baa8dbedfb68df90a9ab11edccf851e7449`, and the post-merge `main` gate is green for CI Unified, CI Gate Status, Security Deep Scan, and CodeQL.
- `GET /api/funds/:fundId/dual-forecast` is the canonical route. It already preserves auth, fund-access, `Content-Type`, and `Cache-Control: private, max-age=60`.
- `shared/types/dual-forecast.ts` defines `DualForecastResponse.sources.actual = 'actual_metrics_calculator'`, but `DualForecastPoint` only exposes `construction` and `current`.
- `server/services/metrics-aggregator.ts#getDualForecast()` calculates actuals first, then maps quarter `0` into `current` and maps future quarters from projected metrics.
- `client/src/hooks/useDualForecast.ts` fetches the same route with `credentials: 'include'`, query key `['dual-forecast', fundId]`, and a `60_000` stale time aligned with the route cache header.
- `client/src/components/dashboard/dual-forecast-dashboard.tsx` currently graphs construction plan and current forecast series, while the only visible `API actuals` label belongs to portfolio allocation rather than the dual-forecast series itself.
- Existing tests already cover route auth/cache, hook fetch/cache identity, dual-forecast aggregation, and dashboard truthfulness labels.
- Scenario contracts intentionally reject `forecastMode` in scenario override payloads. This follow-on must not widen scenario override contracts or scenario-set persistence.

## Scope

In scope:

- Extend the dual-forecast shared type with explicit actual/mode metadata.
- Populate that metadata in `metricsAggregator.getDualForecast()`.
- Update focused route/hook/service/dashboard tests for the new response contract.
- Update the dashboard chart data and labels so actuals are visibly distinct from forward-looking forecasts.
- Preserve the existing route URL, auth gates, cache behavior, provider order, query key, and compatibility fields.

Out of scope:

- New route families, stores, dependencies, or persisted keys.
- Scenario override expansion, methodology guardrails, reserve optimization, cohort readiness, canonical hash semantics, migrations, schema-directory renames, money utility refactors, engine dedupe, route mount normalization, and Phoenix-protected docs.
- Changing `forecastMode` rejection in scenario contracts.

## Implementation Steps

- [x] Add failing service contract coverage in `tests/unit/services/metrics-aggregator-dual-forecast.test.ts`:
  - as-of point has `actual` metrics populated from `actual_metrics_calculator`;
  - as-of point is marked `currentMode: 'actual'`;
  - future points have `actual: null` and `currentMode: 'forecast'`;
  - `current` remains populated for compatibility.
- [x] Add failing client/dashboard coverage in `tests/unit/hooks/useDualForecast.test.tsx` and `tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx`:
  - fixture includes the explicit actual/mode fields;
  - UI labels actuals separately from current forecast values;
  - old misleading live/real-time labels remain absent.
- [x] Extend `shared/types/dual-forecast.ts` with a narrow mode type and actual field shape.
- [x] Update `server/services/metrics-aggregator.ts` to build one actual metrics object once, place it in quarter `0`, and mark future points as forecast.
- [x] Update `client/src/components/dashboard/dual-forecast-dashboard.tsx` to chart actual NAV/called-capital separately from construction and current forecast lines.
- [x] Keep `server/routes/dual-forecast.ts` unchanged unless tests prove route response validation or error handling needs a local assertion update.

## Verification Plan

Focused:

- `npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/metrics-aggregator-dual-forecast.test.ts tests/unit/routes/dual-forecast-route.test.ts`
- `npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/hooks/useDualForecast.test.tsx tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx`

Required closeout:

- `npm run check`
- `npm run lint`
- `npm run test:scenario-release-gate`
- `git diff --check`
- `git status --short --branch`

Conditional:

- `npm run docs:routing:generate` and `npm run docs:routing:check` because this plan is a new tracked docs file.
- `npm run test:integration:routes` only if route or route integration behavior changes.
- `npm run calc-gate` only if calculation engine surfaces change.
