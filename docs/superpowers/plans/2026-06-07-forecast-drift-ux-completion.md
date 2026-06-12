# Forecast Drift UX Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/forecasting?fundId=...` communicate construction-plan drift
clearly enough for GP decision work by adding explicit NAV and called-capital
variance callouts, labeled tooltip rows, and a mobile first-viewport fix,
without reopening the established dual-forecast API contract.

**Architecture:** UI-only completion over the existing
`GET /api/funds/:fundId/dual-forecast` payload. The server already returns
construction, actual, current, and `currentMode`; the client derives display
deltas locally and renders them through shared chart-display helpers. No schema,
route, scenario contract, worker, or data-source change is part of this lane.

**Tech Stack:** React 18, TypeScript, Recharts, Tailwind CSS, shadcn/ui
cards/badges, TanStack Query, Vitest, React Testing Library, Playwright smoke
fixture, Browser visual QA.

---

## Context And Evidence

The current route is functionally integrated but not product-complete for
construction-vs-current analysis.

Confirmed by focused tests before this plan:

- `tests/unit/server/dual-forecast-routes-registration.test.ts`
- `tests/unit/routes/dual-forecast-route.test.ts`
- `tests/unit/pages/forecasting.test.tsx`
- `tests/unit/hooks/useDualForecast.test.tsx`
- `tests/unit/pages/financial-modeling.test.tsx`
- `tests/unit/services/metrics-aggregator-dual-forecast.test.ts`
- `tests/unit/app/route-governance-registry.test.tsx`
- `tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx`

Browser visual QA against `/forecasting?fundId=1` found:

- Desktop renders the dual-forecast card and three Recharts surfaces without
  console errors.
- NAV line chart shows Actuals, Construction Plan, and Current Forecast, but the
  only visible drift language is unrelated navigation copy.
- Hover tooltip at Q4 displays values like `Q4 2026 : $59M : $51M` with no
  series labels and no delta.
- Capital deployment chart renders lines but lacks the same decision-readable
  variance treatment.
- Mobile at `390x844` has no horizontal page overflow, but the compact KPI
  header is clipped/truncated and pushes the forecast chart below the first
  viewport.

Repo guidance already defines the expected visualization pattern in
`docs/design/analytics-visualization-principles.md`: construction vs. current
forecasts must reveal drift from the original plan using paired charts or small
multiples with shared scales and variance callouts.

ADR-022 also fixes the contract boundary: forecast actuals are represented
explicitly on the dual-forecast surface and must not contaminate scenario
contracts.

## Strategy

Use a display-model layer, not a data-model expansion.

The route already has enough source truth:

- `construction`: the published construction plan.
- `actual`: API actuals for realized points.
- `currentMode`: whether the current point is actual or forecast.
- `current`: actual value for realized points, forecast value for future points.

The missing product work is presentation:

- Make the latest forecast-period variance visible in the card before the user
  interacts.
- Label each tooltip row by series.
- Put the construction-vs-current delta in the tooltip where the user inspects a
  point.
- Give the capital deployment chart the same comparison affordances as NAV.
- Prevent the compact header from consuming the mobile first viewport in a
  clipped state.

## Non-Goals

- Do not add backend fields for deltas.
- Do not change `shared/types/dual-forecast.ts`.
- Do not add or modify scenario overrides.
- Do not touch reserve, pacing, Monte Carlo, Phoenix, or waterfall calculations.
- Do not introduce a charting dependency.
- Do not replace Recharts or redesign the page shell.
- Do not create session/handoff docs outside this plan.

## File Structure And Responsibilities

Create:

- `client/src/lib/dual-forecast-display.ts`
  - Owns display-only chart point construction, signed money formatting, percent
    formatting, series labels, and latest drift extraction.

- `tests/unit/lib/dual-forecast-display.test.ts`
  - Locks the display math and labels without relying on Recharts hover behavior
    in jsdom.

Modify:

- `client/src/components/dashboard/dual-forecast-dashboard.tsx`
  - Consumes the display helpers.
  - Renders drift callouts in the NAV and capital forecast cards.
  - Uses custom tooltip content for labeled rows and deltas.
  - Adds a legend to capital deployment.

- `tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx`
  - Extends the fixture to include a meaningful Q4 drift.
  - Asserts visible variance copy, labels, and no regression to "Live Data" or
    "Real-time" language.

- `client/src/components/layout/HeaderKpis.tsx`
  - Changes the mobile compact KPI rail from six fixed columns to stable
    horizontal auto columns.

- `tests/unit/components/layout/dynamic-fund-header.test.tsx`
  - Locks the compact header layout class contract and preserves canonical KPI
    order.

- `tests/e2e/qa-audit-latest-route-publish.spec.ts`
  - Updates the route fixture to include enough forecast periods and visible
    drift.
  - Adds a route-level assertion for drift copy on `/forecasting?fundId=1`.

## Display Model Contract

Add this helper shape in `client/src/lib/dual-forecast-display.ts`:

```ts
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent';
import type { DualForecastPoint } from '@shared/types/dual-forecast';

export type ForecastMetricKey = 'nav' | 'calledCapital';

export interface ForecastChartPoint {
  label: string;
  constructionNav: number;
  actualNav: number | null;
  currentForecastNav: number | null;
  constructionCalledCapital: number;
  actualCalledCapital: number | null;
  currentForecastCalledCapital: number | null;
  navDelta: number | null;
  navDeltaPct: number | null;
  calledCapitalDelta: number | null;
  calledCapitalDeltaPct: number | null;
}

export interface ForecastMetricDrift {
  label: string;
  delta: number;
  deltaPct: number | null;
  constructionValue: number;
  currentValue: number;
}

export interface ForecastDriftSummary {
  label: string;
  nav: ForecastMetricDrift | null;
  calledCapital: ForecastMetricDrift | null;
}
```

Implementation rules:

- Use raw dollars to compute percent drift.
- Use rounded millions only for displayed chart values and signed money labels.
- Treat `currentMode !== 'forecast'` as not drift-comparable.
- Choose the latest comparable forecast point by scanning the series from the
  end.
- Percent denominator is the construction value.
- If the construction value is zero, display the money delta and omit percent
  copy.
- `publishedAt` in `DualForecastConfigMetadata` is typed `string | null`; any
  provenance formatter must handle null gracefully (omit the "as of" clause when
  null rather than emitting "as of null" or throwing).

Ownership note: `ForecastChartPoint` is defined in `dual-forecast-display.ts`
and replaces the local interface currently at
`dual-forecast-dashboard.tsx:36-44`. The dashboard imports it from
`@/lib/dual-forecast-display`. The local interface must be removed from the
dashboard file to avoid a duplicate-identifier compile error.

Series labels:

```ts
const FORECAST_SERIES_LABELS: Record<string, string> = {
  constructionNav: 'Construction Plan NAV',
  actualNav: 'Actual NAV',
  currentForecastNav: 'Current Forecast NAV',
  constructionCalledCapital: 'Construction Plan Called Capital',
  actualCalledCapital: 'Actual Called Capital',
  currentForecastCalledCapital: 'Current Forecast Called Capital',
};
```

Formatting examples that tests must lock:

- `formatSignedMillion(-8)` returns `-$8M`.
- `formatSignedMillion(5)` returns `+$5M`.
- `formatSignedPercent(-0.136)` returns `13.6% below`.
- `formatSignedPercent(0.071)` returns `7.1% above`.
- `formatForecastSeriesName('currentForecastNav')` returns
  `Current Forecast NAV`.
- Unknown Recharts names fall back to `String(name)`.

## Implementation Tasks

- [x] Task 1: Lock display math before changing the dashboard.

  Add `tests/unit/lib/dual-forecast-display.test.ts`.

  Test cases:
  - `buildForecastChartPoints` maps actual points to `actualNav` and forecast
    points to `currentForecastNav`.
  - Latest forecast summary returns Q4 when Q4 is the final comparable point.
  - NAV drift for construction `$59M` and current `$51M` is `-$8M` and
    `13.6% below`.
  - Called-capital drift for construction `$34M` and current `$39M` is `+$5M`
    and `14.7% above`.
  - Zero construction denominator returns a null percent phrase and still
    returns the money delta.
  - Zero delta returns `"$0M"` and `"in line with"` wording without sign prefix.
  - Series-name formatter labels all six dual-forecast lines.
  - Unknown Recharts name falls back to `String(name)`.

  Fixture independence note: all test data in `dual-forecast-display.test.ts` is
  defined inline in that file as plain objects. The `$59M`/`$51M`/`$34M`/`$39M`
  values above are inline constants here — they are **not** shared with
  `makeDualForecast()` in `dual-forecast-dashboard.test.tsx`. Task 5 extends the
  component fixtures independently; Task 1 does not depend on Task 5 completing
  first.

  Run:

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/lib/dual-forecast-display.test.ts
  ```

  Expected first result: fails because the helper file does not exist.

- [x] Task 2: Add the dual-forecast display helper.

  Create `client/src/lib/dual-forecast-display.ts` with pure helpers only. Keep
  React, Recharts components, and Tailwind classes out of this file.

  Required exports:
  - `buildForecastChartPoints(series: DualForecastPoint[]): ForecastChartPoint[]`
  - `getLatestForecastDrift(points: ForecastChartPoint[]): ForecastDriftSummary | null`
  - `formatMillionValue(value: ValueType | undefined): string`
  - `formatSignedMillion(value: number): string`
  - `formatSignedPercent(value: number | null): string | null`
  - `formatForecastSeriesName(name: NameType | undefined): string`
  - `describeDriftDirection(value: number): 'above' | 'below' | 'in line with'`

  Keep `MILLION = 1_000_000` local to the helper.

  Run:

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/lib/dual-forecast-display.test.ts
  ```

  Expected result: helper tests pass and the command exits 0.

- [x] Task 3: Render persistent drift callouts in the dual-forecast cards.

  Modify `client/src/components/dashboard/dual-forecast-dashboard.tsx`.

  Replace local forecast formatting helpers with imports from
  `@/lib/dual-forecast-display`.

  After `forecastData` is built, compute:

  ```ts
  const latestDrift = getLatestForecastDrift(forecastData);
  ```

  Add a compact callout component inside the same file:

  ```tsx
  function DriftCallout({
    metricLabel,
    drift,
  }: {
    metricLabel: string;
    drift: ForecastMetricDrift | null;
  }) {
    if (!drift) return null;

    const percentPhrase = formatSignedPercent(drift.deltaPct);

    return (
      <div className="rounded-md border border-beige-200 bg-white px-3 py-2 text-sm">
        <p className="font-medium text-pov-charcoal">
          {drift.label} {metricLabel} drift
        </p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-pov-charcoal">
          {formatSignedMillion(drift.delta)}
        </p>
        {percentPhrase ? (
          <p className="text-xs text-charcoal-600">
            Current forecast is {percentPhrase} construction plan.
          </p>
        ) : null}
      </div>
    );
  }
  ```

  Render under the NAV chart description:

  ```tsx
  <div className="mt-3" aria-label="Forecast drift summary">
    <DriftCallout metricLabel="NAV" drift={latestDrift?.nav ?? null} />
  </div>
  ```

  Render under the capital deployment description:

  ```tsx
  <div className="mt-3" aria-label="Called capital drift summary">
    <DriftCallout
      metricLabel="called capital"
      drift={latestDrift?.calledCapital ?? null}
    />
  </div>
  ```

  Styling constraints:
  - Keep callouts inside the existing chart cards, not as new page-level cards.
  - Do not nest cards inside cards.
  - Use subdued borders and text hierarchy; this is an operational analytics
    surface, not a marketing hero.

- [x] Task 4: Replace anonymous Recharts tooltip rows with labeled delta
      tooltips.

  In `client/src/components/dashboard/dual-forecast-dashboard.tsx`, add a local
  custom tooltip:

  ```tsx
  interface ForecastTooltipPayloadItem {
    name?: NameType;
    value?: ValueType;
    color?: string;
    payload?: ForecastChartPoint;
  }

  function ForecastTooltip({
    active,
    label,
    payload,
    metric,
  }: {
    active?: boolean;
    label?: string;
    payload?: ForecastTooltipPayloadItem[];
    metric: 'nav' | 'calledCapital';
  }) {
    if (!active || !payload?.length) return null;

    const point = payload[0]?.payload;
    const delta =
      metric === 'nav' ? point?.navDelta : point?.calledCapitalDelta;
    const deltaPct =
      metric === 'nav' ? point?.navDeltaPct : point?.calledCapitalDeltaPct;
    const percentPhrase = formatSignedPercent(deltaPct ?? null);

    return (
      <div className="rounded-md border border-beige-200 bg-white p-3 text-xs shadow-md">
        <p className="mb-2 font-medium text-pov-charcoal">{label}</p>
        <div className="space-y-1">
          {payload.map((item) => (
            <div
              key={String(item.name)}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-charcoal-600">
                {formatForecastSeriesName(item.name)}
              </span>
              <span className="font-medium tabular-nums text-pov-charcoal">
                {formatMillionValue(item.value)}
              </span>
            </div>
          ))}
        </div>
        {delta != null ? (
          <p className="mt-2 border-t border-beige-200 pt-2 font-medium text-pov-charcoal">
            Delta vs construction: {formatSignedMillion(delta)}
            {percentPhrase ? ` (${percentPhrase})` : ''}
          </p>
        ) : null}
      </div>
    );
  }
  ```

  Wire NAV:

  ```tsx
  <Tooltip content={<ForecastTooltip metric="nav" />} />
  ```

  Wire called capital:

  ```tsx
  <Tooltip content={<ForecastTooltip metric="calledCapital" />} />
  <Legend />
  ```

  Acceptance detail:
  - NAV hover must show `Construction Plan NAV`, `Current Forecast NAV`, and
    `Delta vs construction: -$8M`.
  - Capital hover must show `Construction Plan Called Capital`,
    `Current Forecast Called Capital`, and its delta.
  - Actual points should show actual rows and no forecast delta if no forecast
    comparison exists.
  - The capital chart must have exactly one legend. Guard against accidental
    duplication with:
    `expect(screen.getAllByText('Construction Plan')).toHaveLength(1)` in the
    relevant test.

- [x] Task 5: Add dashboard-level regression tests for visible drift copy.

  Modify `tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx`.

  Extend `makeDualForecast()` to include at least four points:
  - `Q1 2026`: actual point.
  - `Q2 2026`: forecast point with modest variance.
  - `Q3 2026`: forecast point.
  - `Q4 2026`: construction NAV `$59M`, current NAV `$51M`, construction called
    capital `$34M`, current called capital `$39M`.

  Add assertions to the existing "labels forward-looking forecast outputs
  separately from API actuals" test or a new focused test:

  ```ts
  const navSummary = await screen.findByLabelText('Forecast drift summary');
  expect(navSummary).toHaveTextContent('Q4 2026 NAV drift');
  expect(navSummary).toHaveTextContent('-$8M');
  expect(navSummary).toHaveTextContent(
    'Current forecast is 13.6% below construction plan.'
  );

  const calledSummary = screen.getByLabelText('Called capital drift summary');
  expect(calledSummary).toHaveTextContent('Q4 2026 called capital drift');
  expect(calledSummary).toHaveTextContent('+$5M');
  expect(calledSummary).toHaveTextContent(
    'Current forecast is 14.7% above construction plan.'
  );
  ```

  Preserve existing assertions:
  - `Construction Plan`
  - `Current Forecast`
  - `Actuals`
  - `API actuals`
  - no `Live Data`
  - no `Real-time`

  Run:

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/lib/dual-forecast-display.test.ts tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx tests/unit/pages/forecasting.test.tsx
  ```

  Expected result: targeted client tests pass and exit 0.

  Note on `tests/unit/pages/forecasting.test.tsx`: this file is included in the
  verification command because it mocks `useDualForecast` and may fail if it
  asserts on element counts or text that changes when drift callouts are added.
  If it fails, update its fixtures or assertions to accommodate the new callout
  structure. Do not remove its existing routing or rendering assertions.

- [x] Task 6: Fix compact KPI mobile clipping.

  Modify `client/src/components/layout/HeaderKpis.tsx`.

  Replace the fixed six-column mobile grid:

  ```tsx
  className =
    'grid max-w-full grid-cols-6 gap-3 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0';
  ```

  With stable horizontal auto columns on mobile and the existing six-column
  layout at `sm` and up:

  ```tsx
  className =
    'grid max-w-full grid-flow-col auto-cols-[7rem] gap-3 overflow-x-auto pb-1 sm:grid-flow-row sm:grid-cols-6 sm:overflow-visible sm:pb-0';
  ```

  This keeps the KPI rail scannable on mobile without squeezing all six cards
  into one viewport width.

  Modify `tests/unit/components/layout/dynamic-fund-header.test.tsx` in the
  existing compact KPI order test:

  ```ts
  const summary = screen.getByLabelText('Selected fund KPI summary');
  expect(summary).toHaveClass('grid-flow-col');
  expect(summary).toHaveClass('auto-cols-[7rem]');
  expect(summary).toHaveClass('sm:grid-cols-6');
  ```

  Run:

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/layout/dynamic-fund-header.test.tsx
  ```

  Expected result: compact header tests pass and exit 0.

- [x] Task 7: Add a route-level drift assertion to the Playwright smoke fixture.

  Modify `tests/e2e/qa-audit-latest-route-publish.spec.ts`.

  Extend `ROUTE_DUAL_FORECAST.series` by adding Q3 2026 and Q4 2026 forecast
  points to the existing fixture. **Preserve the current Q1 2026 (actual) and Q2
  2026 (forecast) points intact** — do not replace them. The result is a
  four-point series where Q4 2026 is the latest comparable forecast point with:
  - construction NAV `59_000_000`
  - current NAV `51_000_000`
  - construction called capital `34_000_000`
  - current called capital `39_000_000`

  In the `model routes with funds available do not redirect to fund setup` test,
  for the `/forecasting?fundId=1` branch, add:

  ```ts
  await expect(page.getByLabel('Forecast drift summary')).toContainText(
    'Q4 2026 NAV drift'
  );
  await expect(page.getByLabel('Forecast drift summary')).toContainText('-$8M');
  await expect(page.getByLabel('Called capital drift summary')).toContainText(
    '+$5M'
  );
  ```

  Run:

  ```powershell
  $env:CI = '1'
  & .\scripts\windows-node-env.ps1 npx.cmd playwright test tests/e2e/qa-audit-latest-route-publish.spec.ts --project=smoke --grep "model routes with funds available"
  Remove-Item Env:\CI
  ```

  Expected result: Playwright builds or reuses the preview server, the selected
  smoke test passes, and the command exits 0.

- [x] Task 8: Run the full targeted verification set.

  Run:

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/lib/dual-forecast-display.test.ts tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx tests/unit/components/layout/dynamic-fund-header.test.tsx tests/unit/pages/forecasting.test.tsx
  ```

  Expected result: all targeted client tests pass and exit 0.

  Run:

  ```powershell
  & .\scripts\windows-node-env.ps1 npm.cmd run check
  ```

  Expected result: TypeScript/baseline check passes and exits 0.

  Run:

  ```powershell
  & .\scripts\windows-node-env.ps1 npm.cmd run lint
  ```

  Expected result: ESLint plus guardrails pass and exit 0.

  Run:

  ```powershell
  git diff --check
  ```

  Expected result: no whitespace errors and exit 0.

- [x] Task 9: Repeat browser visual QA before claiming product completion.

  Use the Browser plugin, not a shell-only screenshot, because the original
  finding came from the rendered route.

  Preconditions:
  - Local client is serving the current branch.
  - API stubs or a local API provide a fund `1` with the four-point
    dual-forecast payload.

  Desktop viewport:
  - Open `http://localhost:5173/forecasting?fundId=1`.
  - Confirm console errors are empty.
  - Confirm the NAV card visibly shows `Q4 2026 NAV drift`, `-$8M`, and
    `13.6% below`.
  - Hover Q4 and confirm tooltip labels series names and shows
    `Delta vs construction: -$8M`.
  - Confirm the capital card shows `Q4 2026 called capital drift`, `+$5M`, and
    has a legend.

  Mobile viewport `390x844`:
  - Confirm no horizontal body overflow.
  - Confirm the compact KPI rail scrolls horizontally instead of clipping
    squeezed cards.
  - Confirm the forecast card is reachable without incoherent overlap.

  Save screenshots under a temp path or a deliberate ignored QA path. Do not add
  screenshot artifacts to git unless the repo already expects them for this
  route.

## Acceptance Criteria

- `/forecasting?fundId=1` visibly answers: "How far has the current forecast
  drifted from the construction plan?"
- NAV drift is visible without hover.
- Called-capital drift is visible without hover.
- Tooltips label series names and show deltas.
- Actuals remain visually and semantically separate from forward-looking
  forecast points.
- Mobile compact KPI header no longer clips six cards into a squeezed grid.
- No server, shared type, scenario, or worker contract changes are present.
- Targeted tests, typecheck, lint, Playwright smoke assertion, and Browser
  visual QA all pass.

## Execution Recommendation

### Hermes vs Claude assignment

Four tasks are Hermes dispatches (Codex, `--phase production`, solo workflow,
gate = `npm run check`). Five tasks stay with Claude directly.

| Task                                         | Owner                                            | Rationale                                                                               |
| -------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 — write failing tests                      | Claude                                           | TDD discipline: Codex may stub the impl to make tests pass; RED state requires judgment |
| 2 — implement helper                         | **Hermes**                                       | Fully specified API, pure TS, no React/DOM, already-written tests verify it             |
| 3 — dashboard callouts + interface migration | **Hermes**                                       | Detailed JSX templates in the plan; dispatch after committing Task 2                    |
| 4 — custom tooltips                          | **Hermes (combined with 3 or sequential after)** | Same file as Task 3; combine into one dispatch or dispatch after reviewing Task 3 diff  |
| 5 — dashboard regression tests               | Claude                                           | Requires reviewing Tasks 3+4 actual output before writing assertions                    |
| 6 — HeaderKpis CSS                           | Claude                                           | Three-line change; dispatch overhead exceeds the work                                   |
| 7 — Playwright fixture                       | **Hermes**                                       | Mechanical JSON extension + 3 assertions; independent of dashboard files                |
| 8 — verification                             | Claude                                           | Shell commands, not code generation                                                     |
| 9 — browser QA                               | Claude                                           | Visual inspection                                                                       |

### Keyword safety check

`orchestrate.js` promotes `--phase production` tasks to `production-financial`
(gate = `npm run calc-gate`, `humanApproval: true`) when specialist keyword
phrases score ≥ 3. None of the natural task strings below hit the threshold. Do
not add phrases like `"rounding error"`, `"numeric drift"`, `"irr calculation"`,
or `"xirr"` to these task strings — those would trigger promotion.

Dry-run any dispatch before executing:

```powershell
node orchestrate.js --dry-run --phase production --task "YOUR TASK STRING HERE"
```

Confirm the output shows `"specialist": null` and `"gate": "npm run check"`
before running live.

### Sequencing

Hermes dispatches write to the live working tree. No built-in file isolation
exists between concurrent dispatches. Always commit between dispatches to keep
the working tree clean.

```
1. [Claude]  Task 1  Write failing tests             → verify RED with vitest
2. [Hermes]  Task 2  Implement helper                → verify GREEN with vitest → commit
3. [Hermes]  Task 3+4  Dashboard callouts + tooltips → Claude reviews diff → commit
   [Claude]  Task 6  HeaderKpis CSS (trivial, do now) → commit
4. [Hermes]  Task 7  Playwright fixture extension    → commit
5. [Claude]  Task 5  Dashboard regression tests      → verify GREEN with vitest → commit
6. [Claude]  Task 8  Full verification suite
7. [Claude]  Task 9  Browser visual QA
```

### Dispatch commands

**Task 2 — implement helper:**

```powershell
node orchestrate.js --phase production --task "Create client/src/lib/dual-forecast-display.ts as a pure TypeScript module. No React, Recharts, or DOM imports. Export exactly: buildForecastChartPoints(series: DualForecastPoint[]): ForecastChartPoint[], getLatestForecastDrift(points: ForecastChartPoint[]): ForecastDriftSummary | null, formatMillionValue(value: ValueType | undefined): string, formatSignedMillion(value: number): string, formatSignedPercent(value: number | null): string | null, formatForecastSeriesName(name: NameType | undefined): string, describeDriftDirection(value: number): 'above' | 'below' | 'in line with'. ForecastChartPoint must carry both rounded-million chart fields and raw-dollar delta fields (navDelta, navDeltaPct, calledCapitalDelta, calledCapitalDeltaPct). Compute deltas from raw dollar values, not the rounded millions. Failing tests live at tests/unit/lib/dual-forecast-display.test.ts. Full interface and type definitions are at docs/superpowers/plans/2026-06-07-forecast-drift-ux-completion.md."
```

**Tasks 3+4 combined — dashboard callouts and tooltips:**

```powershell
node orchestrate.js --phase production --task "Refactor client/src/components/dashboard/dual-forecast-dashboard.tsx only. Scope: this single file. Do NOT modify any file under shared/, server/, tests/, or client/src/lib/. Steps: (1) Remove the local ForecastChartPoint interface at approximately lines 36-44 and import ForecastChartPoint, buildForecastChartPoints, getLatestForecastDrift, formatMillionValue, formatSignedMillion, formatSignedPercent, formatForecastSeriesName from @/lib/dual-forecast-display. (2) Replace the forecastData mapping block (roughly lines 185-194) with buildForecastChartPoints(dualForecast.series) and derive latestDrift = getLatestForecastDrift(forecastData). (3) Add a DriftCallout local component and render it inside the existing chart card CardContent after the ResponsiveContainer closing tag, NOT as a new Card. (4) Add a ForecastTooltip local component wired via the Recharts Tooltip content prop. Full JSX templates and class names are in docs/superpowers/plans/2026-06-07-forecast-drift-ux-completion.md Tasks 3 and 4."
```

**Task 7 — Playwright fixture:**

```powershell
node orchestrate.js --phase production --task "Extend ROUTE_DUAL_FORECAST.series in tests/e2e/qa-audit-latest-route-publish.spec.ts. Preserve the existing Q1 2026 (currentMode actual) and Q2 2026 (currentMode forecast) objects exactly as they are. Add a Q3 2026 forecast point and a Q4 2026 forecast point. Q4 values: construction.nav=59000000, current.nav=51000000, construction.calledCapital=34000000, current.calledCapital=39000000. In the forecasting branch of the 'model routes with funds available' test, add: await expect(page.getByLabel('Forecast drift summary')).toContainText('Q4 2026 NAV drift'), toContainText('-\$8M'), and await expect(page.getByLabel('Called capital drift summary')).toContainText('+\$5M')."
```

### Post-dispatch checklist (after each Hermes run)

Hermes postflight runs `npm run check` (TypeScript compile only). You must run
these yourself:

```powershell
# After Task 2:
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/lib/dual-forecast-display.test.ts

# After Tasks 3+4:
git diff --name-only   # confirm only dual-forecast-dashboard.tsx changed
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx

# After Task 7:
git diff --name-only   # confirm only qa-audit-latest-route-publish.spec.ts changed
```

If `git diff --name-only` shows files outside the expected scope after any
dispatch, revert the unexpected changes before proceeding. Codex has
`--sandbox danger-full-access` and will write any file it decides is relevant.

## Risk Controls

- If tooltip DOM proves brittle in jsdom, keep tooltip math covered in
  `dual-forecast-display.test.ts` and prove rendered tooltip behavior through
  Playwright or Browser visual QA.
- If Recharts payload typing is noisy, define a narrow local payload interface
  in the component instead of importing broader Recharts internals.
- If the compact header class assertion becomes too Tailwind-specific, keep it
  only for the exact regression found by browser QA and avoid asserting
  unrelated visual classes.
- If full lint reveals unrelated existing debt, capture it separately and do not
  expand this lane beyond the touched files.

## Stop Rules

Stop and report instead of widening scope if:

- The dual-forecast API lacks comparable forecast points in real data and
  requires backend semantics to define a drift period.
- Product wants drift against actuals, target metrics, or another baseline
  instead of the construction plan.
- Mobile clipping comes from a parent layout outside `HeaderKpis.tsx` and
  requires a broader shell redesign.
- Scenario contract files, Phoenix calculation code, reserve workers, or
  database schemas appear necessary.
