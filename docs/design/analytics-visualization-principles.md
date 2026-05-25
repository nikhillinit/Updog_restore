---
status: ACTIVE
audience: both
last_updated: 2026-05-24
categories: [design, analytics, visualization, truthfulness]
keywords:
  [charts, dashboards, tufte, evidence, provenance, comparison, small-multiples, sparklines, fund-results]
source_of_truth: true
agent_routing:
  priority: 1
  route_hint: 'Use for any Updog chart, dashboard, report, fund results, scenario comparison, reserve analysis, or LP-facing analytical display.'
  use_cases:
    [chart_review, dashboard_review, fund_model_results, scenario_builder, reserve_planning, lp_reporting, visual_truthfulness]
maintenance:
  owner: 'Product + Frontend'
  review_cadence: 'P60D'
---

# Analytics Visualization Principles

## Purpose

This document converts the Tufte-style visualization guidance into Updog-specific presentation-layer rules. It is highly relevant to dashboards, charts, reports, fund-model results, scenario comparison, reserve planning, MOIC analysis, portfolio monitoring, and LP reporting.

It is intentionally not a rewrite of the calculation engines, persistence layer, worker orchestration, schema contracts, or CI architecture. Those systems must continue to prioritize truthful first-run results, authoritative contracts, and deterministic validation. The presentation layer then makes those results understandable, comparable, and auditable.

## The operating thesis

Updog’s analytical UI is only valuable when users can answer four questions quickly:

1. What changed?
2. Compared to what?
3. Why did it change?
4. Can I trust the number?

Every chart, KPI, table, report block, and dashboard panel should answer at least one of those questions. The best analytical surfaces answer all four without forcing the user into a separate explanation page.

## Non-negotiables

### 1. Truthfulness beats polish

A polished chart with placeholder, stale, or mock-only data is worse than an empty state. Production-facing analytics must clearly distinguish live data, demo data, sample data, stale data, unavailable sections, and pending calculation states.

Rules:

- No production chart should silently import `SAMPLE_DATA`, mock fixtures, or placeholder records.
- Demo/sample states must be visibly labeled in the surface, not only in code.
- Stale results must show why they are stale and what action recalculates or republishs them.
- Failed or unavailable sections must remain visible with an explanation rather than disappearing.

### 2. Comparison is the default analytical act

A single metric is rarely useful in venture modeling. A fund model is useful because it compares construction vs. current forecast, base vs. upside/downside, planned reserves vs. deployed reserves, initial allocation vs. follow-on demand, and current value vs. cost.

Rules:

- Every major number should answer “compared to what?”
- Scenario views should show cases side by side before asking users to inspect one case deeply.
- Use common scales when comparing cases, cohorts, years, companies, or scenarios.
- Prefer small multiples when users need to compare patterns, not just totals.

### 3. Evidence must travel with the number

Every material output should carry enough evidence to make it inspectable. The UI does not need to show every field at full volume, but it must expose provenance near the number.

Each major metric or result section should be able to show:

- Fund or entity ID/name.
- Published config version.
- Calculation run ID or equivalent run marker.
- Last calculated timestamp.
- Source endpoint or contract section.
- Current lifecycle state: ready, calculating, failed, stale, unavailable, demo.
- Key assumptions or drivers behind the output.

This is especially important for `/fund-model-results/:fundId`, LP reports, shared dashboards, scenario exports, and board/IC-ready summaries.

### 4. Words, numbers, and graphics belong together

Do not isolate the chart from the explanation. Labels, annotations, captions, source notes, and assumption callouts should live close to the visual evidence.

Rules:

- Place labels near the data they describe.
- Use short interpretive captions under charts: “The fund is two quarters behind plan,” “Upside case depends on a higher Series C conversion rate,” etc.
- Explain material assumptions inside the chart card or immediately adjacent rail.
- Avoid making tooltips the only place where meaning appears.

### 5. Reduce chart furniture

Remove visual elements that do not carry analytical meaning. Gridlines, legends, borders, gradients, shadows, dual legends, and decorative colors should earn their presence.

Rules:

- Prefer direct labels over legends when the label can sit near the series.
- Do not show a Recharts/Chart.js legend and then repeat a custom legend below the chart.
- Use lighter gridlines or fewer gridlines unless the user needs precise reading.
- Use color to encode meaning, not decoration.
- Do not rely on color alone; pair it with labels, shapes, ordering, or text.

### 6. Axis integrity is a product requirement

Misleading scales are product bugs. Venture data can easily distort if charts change domains per scenario, truncate baselines without disclosure, or compare values with incompatible units.

Rules:

- Shared comparison charts must use shared scales unless the difference is clearly labeled.
- Axis truncation must be intentional and disclosed.
- Units must be visible: dollars, cents, %, x, bps, quarters, years.
- Avoid mixing dollars and multiples on the same axis unless the design makes the encoding unmistakable.

### 7. Compact trend cues should support scanning

Tables are a primary interface for venture operations. Users often need to scan many companies, investments, LPs, reserves, calls, or assumptions before opening a detail view.

Rules:

- Use inline sparklines for row-level trends where a full chart would be excessive.
- Sparklines should show shape, not decorative noise.
- Pair sparklines with the current value and, when useful, a short delta.
- Use them for portfolio-company tables, reserve rankings, KPI rows, LP reporting summaries, and watchlists.

Example patterns:

```text
TVPI             2.1x   ▁▂▃▅▇
Reserve need    $3.2M  ▇▆▅▃▂
Ownership       8.4%   ▆▅▄▃▂
Runway          9 mo   ▃▃▂▂▁
```

## Updog surface rules

| Surface | Primary visualization job | Required evidence pattern |
| --- | --- | --- |
| `/fund-model-results/:fundId` | Explain authoritative published results | Evidence header per section: config version, run, timestamp, source, status |
| Scenario builder | Compare changed assumptions and outcomes | Base vs. changed assumptions side by side; identical scales for outcome charts |
| Reserve planning | Rank follow-on needs and explain why | Table with reserve need, current/planned/deployed reserve, ownership effect, trigger annotation |
| MOIC / TVPI / DPI / IRR analysis | Show return mechanics, not only headline metrics | Direct labels, assumptions, time horizon, calculation version, stale state |
| Construction vs. current forecasts | Reveal drift from the original plan | Small multiples or paired charts with shared scales and variance callouts |
| Portfolio dashboards | Support scanning and triage | KPI tiles with provenance, company tables with sparklines, exception annotations |
| LP reports / shared dashboards | Build trust with clear evidence | Integrated words/numbers/charts, source notes, export timestamp, version badge |
| Wizard inputs | Explain effect of assumptions | Inline examples, micro-visualizations, and impact previews where possible |

## Evidence header pattern

Use an evidence header when a section presents material output.

```text
READY · CONFIG v12 · RUN #148 · CALCULATED 2026-05-24 09:41 PT · SOURCE /api/funds/:id/results · CURRENT
```

State language:

- `READY`: result is current for the published config.
- `CALCULATING`: result is in progress; keep previous output visible if available and label it as prior.
- `STALE`: result belongs to an older config or underlying data version.
- `FAILED`: calculation failed; show last known result only if clearly labeled.
- `UNAVAILABLE`: the section is not supported by the server response.
- `DEMO`: synthetic or fixture-backed data, visible to users.

## Chart review checklist

Before merging a chart or dashboard panel, answer:

1. What decision does this chart support?
2. What is the comparison baseline?
3. Are the axes and units honest?
4. Are labels close to the data?
5. Are legends necessary, or can the series be directly labeled?
6. Is color encoding meaning rather than decoration?
7. Is any meaning color-only?
8. Is the data source, run/version, and freshness visible?
9. Does the chart use live data, and if not, is demo/sample data visibly labeled?
10. Would a small multiple, table, or sparkline communicate the same evidence better?
11. Is there a written takeaway or annotation that explains the main pattern?
12. Can the chart survive empty, partial, loading, stale, and failed states?

## Recommended component primitives

These are conceptual names, not mandates for exact implementation names.

- `EvidenceHeader`: status, run, version, timestamp, source, current/stale/demo state.
- `MetricWithProvenance`: KPI value plus evidence trigger and supporting assumptions.
- `ComparisonBand`: side-by-side base/upside/downside/current/plan snapshots.
- `SmallMultipleGrid`: repeated charts with shared units and scales.
- `InlineSparkline`: compact row-level trend cue.
- `AssumptionCallout`: short explanation of what drove a chart or metric.
- `SourceNote`: endpoint/contract/version note for LP/reporting contexts.
- `UnavailableSection`: honest placeholder when the server does not support a section.

## Anti-patterns

Avoid these unless there is a documented reason:

- Large single-number hero metrics with no baseline, source, or timestamp.
- Charts that look production-ready while using sample data.
- Tooltips that contain essential meaning unavailable elsewhere.
- Scenario charts with different scales that make outcomes look more comparable than they are.
- Duplicate legends.
- Dense gridlines, shadows, gradients, or decoration that compete with the data.
- Hiding failed or unavailable sections to make a page look cleaner.
- Exporting LP-facing charts without version and timestamp evidence.

## Testing implications

This doctrine should produce testable guardrails over time. Start with lightweight assertions instead of screenshot-perfect tests.

Suggested tests:

- Production chart components do not import or render `SAMPLE_DATA` without a visible demo/sample label.
- Each fund results section renders an evidence header when the server supplies provenance fields.
- Comparison/small-multiple components share a common domain by default.
- Stale results show a visible stale warning and recalculation action.
- Charts with color encodings include text labels or non-color cues.
- LP/report exports include source/version/timestamp evidence.

## Relationship to Updog Design Philosophy v3.1.1

The broader design philosophy says Updog is dashboard-first, action-near, multi-entity, and provenance-first. This document narrows that philosophy into analytical visualization rules:

- Dashboard-first becomes evidence-first dashboards.
- Action-near becomes decisions near the supporting comparison.
- Provenance-first becomes visible run/version/source state.
- Multi-entity becomes small multiples, ranked tables, and comparable views across funds, SPVs, sidecars, companies, LP groups, and scenarios.
