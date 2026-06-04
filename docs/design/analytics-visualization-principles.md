---
status: ACTIVE
audience: both
last_updated: 2026-06-02
categories: [design, analytics, visualization, truthfulness]
keywords:
  [
    charts,
    dashboards,
    tufte,
    evidence,
    provenance,
    comparison,
    fund-scope,
    small-multiples,
    sparklines,
    fund-results,
  ]
source_of_truth: true
agent_routing:
  priority: 1
  route_hint:
    'Use for any Updog chart, dashboard, report, fund results, scenario
    comparison, reserve analysis, or LP-facing analytical display.'
  use_cases:
    [
      chart_review,
      dashboard_review,
      fund_model_results,
      scenario_builder,
      reserve_planning,
      lp_reporting,
      visual_truthfulness,
    ]
maintenance:
  owner: 'Product + Frontend'
  review_cadence: 'P60D'
---

# Analytics Visualization Principles

## Purpose

This document converts the Tufte-style visualization guidance into
Updog-specific presentation-layer rules. It is highly relevant to dashboards,
charts, reports, fund-model results, scenario comparison, reserve planning, MOIC
analysis, portfolio monitoring, and LP reporting.

It is intentionally not a rewrite of the calculation engines, persistence layer,
worker orchestration, schema contracts, or CI architecture. Those systems must
continue to prioritize truthful first-run results, authoritative contracts,
deterministic validation, tenant/fund-scope enforcement, and canonical route
parsing. The presentation layer then makes those results understandable,
comparable, access-safe, and auditable.

## The operating thesis

Updog’s analytical UI is only valuable when users can answer five questions
quickly:

1. What changed?
2. Compared to what?
3. Why did it change?
4. Can I trust the number?
5. Is this number scoped to the user and entity viewing it?

Every chart, KPI, table, report block, and dashboard panel should answer at
least one of those questions. The best analytical surfaces answer all five
without forcing the user into a separate explanation page.

### The trust arc behind the five questions

The five questions are not a checklist; they are the emotional spine of two
high-stakes moments:

- **GP, fund results.** A GP opens `/fund-model-results/:fundId` minutes before
  an IC or LP conversation. The felt question is "is this number current, and
  can I defend it?" The evidence header exists to relieve that anxiety at a
  glance, not to satisfy an audit.
- **LP, shared report.** An LP opens a report and silently asks "is this my
  fund, and is it the latest?" Access-scope + version evidence exist to make the
  answer obvious before they read a single metric.

Design the surfaces so the relieving evidence arrives _before_ the user has to
ask. A correct number that arrives without confidence still loses the moment.

## Non-negotiables

### 1. Truthfulness beats polish

A polished chart with placeholder, stale, or mock-only data is worse than an
empty state. Production-facing analytics must clearly distinguish live data,
demo data, sample data, stale data, unavailable sections, and pending
calculation states.

Rules:

- No production chart should silently import `SAMPLE_DATA`, mock fixtures, or
  placeholder records.
- Demo/sample states must be visibly labeled in the surface, not only in code.
- Stale results must show why they are stale and what action recalculates or
  republishes them.
- Failed or unavailable sections must remain visible with an explanation rather
  than disappearing.

### 2. Comparison is the default analytical act

A single metric is rarely useful in venture modeling. A fund model is useful
because it compares construction vs. current forecast, base vs. upside/downside,
planned reserves vs. deployed reserves, initial allocation vs. follow-on demand,
and current value vs. cost.

Rules:

- Every major number should answer “compared to what?”
- Scenario views should show cases side by side before asking users to inspect
  one case deeply.
- Use common scales when comparing cases, cohorts, years, companies, or
  scenarios.
- Prefer small multiples when users need to compare patterns, not just totals.

### 3. Access scope is part of visual truthfulness

A chart is not truthful if it can show a correct number to the wrong user.
Production analytics must be backed by access-scoped routes or workers, not only
by visually persuasive UI.

Rules:

- Do not build a production dashboard, report, chart, or live stream on an
  unauthenticated or unscoped route.
- Fund-scoped analytics should use endpoints guarded by the appropriate
  fund-access helper before rendering material values.
- LP-facing analytics should only render fund data that is within the LP’s
  commitment scope.
- Canonical fund ID parsing matters. Do not hand-parse route fund IDs in a way
  that can disagree with the server guard.
- Native browser `EventSource` cannot send bearer headers. Treat
  bearer-protected SSE routes as server-side defense-in-depth until an explicit
  query-token or cookie transport is designed.

### 4. Evidence must travel with the number

Every material output should carry enough evidence to make it inspectable. The
UI does not need to show every field at full volume, but it must expose
provenance near the number.

Each major metric or result section should be able to show:

- Fund or entity ID/name.
- Published config version.
- Calculation run ID or equivalent run marker.
- Last calculated timestamp.
- Source endpoint or contract section.
- Current lifecycle state: ready, calculating, failed, stale, unavailable, demo.
- Access scope when relevant: GP fund-scope, LP commitment scope, shared-link
  scope, or authenticated-only stream.
- Key assumptions or drivers behind the output.

This is especially important for `/fund-model-results/:fundId`,
`/fund-model-results/:fundId/scenarios`, LP reports, shared dashboards, scenario
exports, real-time/event surfaces, and board/IC-ready summaries.

### 5. Words, numbers, and graphics belong together

Do not isolate the chart from the explanation. Labels, annotations, captions,
source notes, and assumption callouts should live close to the visual evidence.

Rules:

- Place labels near the data they describe.
- Use short interpretive captions under charts: “The fund is two quarters behind
  plan,” “Upside case depends on a higher Series C conversion rate,” etc.
- Explain material assumptions inside the chart card or immediately adjacent
  rail.
- Avoid making tooltips the only place where meaning appears.

### 6. Reduce chart furniture

Remove visual elements that do not carry analytical meaning. Gridlines, legends,
borders, gradients, shadows, dual legends, and decorative colors should earn
their presence.

Rules:

- Prefer direct labels over legends when the label can sit near the series.
- Do not show a Recharts/Chart.js legend and then repeat a custom legend below
  the chart.
- Use lighter gridlines or fewer gridlines unless the user needs precise
  reading.
- Use color to encode meaning, not decoration.
- Do not rely on color alone; pair it with labels, shapes, ordering, or text.

### 7. Axis integrity is a product requirement

Misleading scales are product bugs. Venture data can easily distort if charts
change domains per scenario, truncate baselines without disclosure, or compare
values with incompatible units.

Rules:

- Shared comparison charts must use shared scales unless the difference is
  clearly labeled.
- Axis truncation must be intentional and disclosed.
- Units must be visible: dollars, cents, %, x, bps, quarters, years.
- Avoid mixing dollars and multiples on the same axis unless the design makes
  the encoding unmistakable.

### 8. Compact trend cues should support scanning

Tables are a primary interface for venture operations. Users often need to scan
many companies, investments, LPs, reserves, calls, or assumptions before opening
a detail view.

Rules:

- Use inline sparklines for row-level trends where a full chart would be
  excessive.
- Sparklines should show shape, not decorative noise.
- Pair sparklines with the current value and, when useful, a short delta.
- Use them for portfolio-company tables, reserve rankings, KPI rows, LP
  reporting summaries, and watchlists.

Example patterns:

```text
TVPI             2.1x   ▁▂▃▅▇
Reserve need    $3.2M  ▇▆▅▃▂
Ownership       8.4%   ▆▅▄▃▂
Runway          9 mo   ▃▃▂▂▁
```

## Updog surface rules

| Surface                                 | Primary visualization job                                         | Required evidence pattern                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/fund-model-results/:fundId`           | Explain authoritative published results                           | Evidence header per section: config version, run, timestamp, source, status                                               |
| `/fund-model-results/:fundId/scenarios` | Compare existing scenario sets against the authoritative baseline | Source config, scenario-set status, calculation status, comparison staleness, and fund-scoped endpoints                   |
| Scenario builder                        | Compare changed assumptions and outcomes                          | Base vs. changed assumptions side by side; identical scales for outcome charts                                            |
| Reserve planning                        | Rank follow-on needs and explain why                              | Table with reserve need, current/planned/deployed reserve, ownership effect, trigger annotation                           |
| MOIC / TVPI / DPI / IRR analysis        | Show return mechanics, not only headline metrics                  | Direct labels, assumptions, time horizon, calculation version, stale state                                                |
| Construction vs. current forecasts      | Reveal drift from the original plan                               | Small multiples or paired charts with shared scales and variance callouts                                                 |
| Portfolio dashboards                    | Support scanning and triage                                       | KPI tiles with provenance, company tables with sparklines, exception annotations                                          |
| LP reports / shared dashboards          | Build trust with clear evidence                                   | Integrated words/numbers/charts, source notes, export timestamp, version badge, LP commitment scope                       |
| Wizard inputs                           | Explain effect of assumptions                                     | Inline examples, micro-visualizations, and impact previews where possible                                                 |
| SSE / real-time surfaces                | Stream state changes without leaking cross-fund events            | Auth transport decision, fund-scope validation before stream open, no browser-native consumer until transport is designed |

## Evidence header pattern

Use an evidence header when a section presents material output.

```text
READY · CONFIG v12 · RUN #148 · CALCULATED 2026-06-02 09:41 PT · SOURCE /api/funds/:id/results · CURRENT
```

State language:

- `READY`: result is current for the published config.
- `CALCULATING`: result is in progress; keep previous output visible if
  available and label it as prior.
- `STALE`: result belongs to an older config or underlying data version.
- `FAILED`: calculation failed; show last known result only if clearly labeled.
- `EMPTY`: the section is supported and current, but has no data yet (e.g., a
  fund with no scenarios). Distinct from `UNAVAILABLE`. Render a warm zero-state
  with the primary action, never a bare "No items found."
- `PARTIAL`: some metrics in the section calculated and others failed or are
  pending. Render the available metrics plus an inline note for the rest; do not
  hide the whole section.
- `UNAVAILABLE`: the section is not supported by the server response.
- `DEMO`: synthetic or fixture-backed data, visible to users.

State axes (load-bearing for implementation): `READY`, `CALCULATING`, `STALE`,
`FAILED`, and `UNAVAILABLE` are derived from the calculation-status contract
(`FundStateReadV1['calculationState']['status']` =
`ready|submitted|calculating|failed|not_requested`). `EMPTY` and `PARTIAL` are
NOT new contract states — derive them client-side from the section payload
(empty payload = `EMPTY`; mixed sourced/unsourced fields = `PARTIAL`). `DEMO` is
an orthogonal data-source flag ("real vs. sample data"), not a
calculation-status value. Do not extend the shared calculation-status enum to
add these.

### Evidence header hierarchy and responsive behavior

The header is a thin inline rail, not a card. It carries three tiers of weight:

- **Tier 1 — glanceable (always visible at every width):** lifecycle state and
  access state. Strongest visual weight, leftmost, color-coded (see State visual
  mapping). This is the trust signal and must never be truncated.
- **Tier 2 — scannable:** config version and run ID. Medium weight, monospace.
- **Tier 3 — audit detail:** calculated timestamp and source endpoint. Lowest
  weight (muted `text-charcoal-400`), shown last.

Responsive rule: below the 960px breakpoint (or when the section panel is
narrow), keep Tier 1 inline and collapse Tier 2 + Tier 3 behind a single `ⓘ`
affordance that opens the existing `Tooltip`/popover. Do not let the rail wrap
into an unranked block.

Example, wide:

```text
READY · FUND-SCOPED   CONFIG v12 · RUN #148   2026-06-02 09:41 PT · /api/funds/:id/results
└ Tier 1 (color) ───┘ └ Tier 2 (mono) ─────┘ └ Tier 3 (muted) ──────────────────────────┘
```

Example, narrow:

```text
READY · FUND-SCOPED   ⓘ
```

### State visual mapping (live Tailwind theme)

Bind every lifecycle/access state to the live Tailwind theme — the same approach
`EvidenceHeader.tsx` already uses (a `Badge` rail with `emerald/amber/rose` +
`charcoal/beige`, `font-poppins`). The app has no `--pos/--warn/--neg` CSS
variables; v3.1.1's palette is realized through this theme (`charcoal` =
#292929, `beige` = #E0D8D1). Always pair color with the text label (color is
never the only signal).

| State                              | Tailwind classes                                                           | Treatment                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `READY`                            | `border-emerald-200 bg-emerald-50 text-emerald-800`                        | calm; no emphasis                                                                                                 |
| `CALCULATING`                      | `border-sky-200 bg-sky-50 text-sky-800`                                    | skeleton/in-progress; reduced-motion degrades to instant. (Live currently reuses amber — distinguish from STALE.) |
| `STALE`                            | `border-amber-200 bg-amber-50 text-amber-800`                              | + visible recalculation action                                                                                    |
| `FAILED`                           | `border-rose-200 bg-rose-50 text-rose-800`                                 | + explanation; last result only if labeled                                                                        |
| `EMPTY`                            | `text-charcoal-500`                                                        | neutral; warm zero-state + primary action                                                                         |
| `PARTIAL`                          | `border-amber-200 bg-amber-50 text-amber-800`                              | available metrics render; inline note for the rest                                                                |
| `UNAVAILABLE`                      | `border-beige-200 text-charcoal-500`                                       | UnavailableSection placeholder                                                                                    |
| `DEMO`                             | solid `bg-amber-600 text-white` ribbon + `border-amber-400` section border | see Demo treatment                                                                                                |
| `FUND-SCOPED` / `LP-SCOPED`        | `text-emerald-800`                                                         | AccessScopeNote chip                                                                                              |
| `AUTH-ONLY` / `TRANSPORT-DEFERRED` | `text-charcoal-500`                                                        | AccessScopeNote chip                                                                                              |

### Demo / sample-data treatment

Truthfulness is the product thesis, so the demo signal must be impossible to
miss and must not depend on the reader noticing a subtle badge.

When a production surface renders sample/fixture data, it must show **both**:

1. A persistent `DEMO` corner ribbon (top-right of the section): a solid amber
   `Badge` (`bg-amber-600 text-white`) so it reads as a deliberate stamp.
2. An `border-amber-400` border around the whole section.

The ribbon and border are non-blocking (the user can still interact). A `DEMO`
pill in the evidence header alone is not sufficient — that is the exact "looks
production-ready while using sample data" anti-pattern this doctrine forbids.

Access-state language when relevant:

- `FUND-SCOPED`: route has enforced fund access before returning material data.
- `LP-SCOPED`: worker or route has verified LP commitment access to requested
  funds.
- `AUTH-ONLY`: route requires authentication but does not claim fund binding.
- `TRANSPORT-DEFERRED`: stream or live surface is intentionally not exposed to a
  browser consumer yet.

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
9. Is the endpoint/worker access-scoped for the user and entity rendering it?
10. Does the chart use live data, and if not, is demo/sample data visibly
    labeled?
11. Would a small multiple, table, or sparkline communicate the same evidence
    better?
12. Is there a written takeaway or annotation that explains the main pattern?
13. Can the chart survive empty, partial, loading, stale, failed, forbidden, and
    unauthenticated states?

## Recommended component primitives

These are conceptual names, not mandates for exact implementation names.

- `EvidenceHeader`: status, run, version, timestamp, source, current/stale/demo
  state.
- `AccessScopeNote`: compact display of fund-scope, LP-scope, shared-link scope,
  or transport-deferred state when relevant.
- `MetricWithProvenance`: KPI value plus evidence trigger and supporting
  assumptions.
- `ComparisonBand`: side-by-side base/upside/downside/current/plan snapshots.
- `SmallMultipleGrid`: repeated charts with shared units and scales.
- `InlineSparkline`: compact row-level trend cue.
- `AssumptionCallout`: short explanation of what drove a chart or metric.
- `SourceNote`: endpoint/contract/version note for LP/reporting contexts.
- `UnavailableSection`: honest placeholder when the server does not support a
  section.

### Design-system binding (live theme; v3.1.1 is the north star)

These primitives extend the live components and Tailwind theme. v3.1.1 is the
design north star, but the app does not use its CSS variables — bind to what
ships today.

| Analytics primitive                    | Build from                                                                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EvidenceHeader`                       | EXTEND the live `client/src/components/results/EvidenceHeader.tsx` (a `Badge` rail, `emerald/amber/rose` + `charcoal/beige`, `font-poppins`). Add EMPTY/PARTIAL/DEMO handling client-side. Not a new component. |
| `AccessScopeNote`                      | NEW — requires a server-emitted access-scope field (see Contract prerequisites in the rollout). Do not infer scope from the route.                                                                              |
| `MetricWithProvenance`                 | KPI value + `Tooltip`/icon trigger; provenance fields from the fund-results contract.                                                                                                                           |
| `ComparisonBand` / `SmallMultipleGrid` | NEW layout primitives + a toggle. NOTE: `SegmentedControl` does not exist yet — build a small toggle or add the component.                                                                                      |
| `InlineSparkline`                      | NEW compact element (today `TVPISparkline` is a stub); pairs with the row value + delta (see a11y).                                                                                                             |
| `UnavailableSection`                   | muted placeholder using `charcoal/beige` surface + border.                                                                                                                                                      |

Step-1 plumbing (do before breadth): the live `StatusChip` only supports
`complete|partial|fallback`, so it cannot render lifecycle states — either add
lifecycle variants to it or keep EvidenceHeader's own `Badge` color map; and
build the `SegmentedControl`/toggle the comparison layouts need.

Fonts: the rail uses `font-poppins` (live); numerics use the `mono` family (Fira
Code per tailwind.config), not JetBrains Mono.

Motion: `CALCULATING` uses skeleton-then-fade and must honor
`prefers-reduced-motion` (degrade to instant). Do not invent a new spinner.

This chart-review checklist composes with — does not replace — the v3.1.1
acceptance rubric (truth-first hierarchy, accountable context, keyboard parity,
purposeful motion, LP-safe sharing). A chart PR must pass both.

## Anti-patterns

Avoid these unless there is a documented reason:

- Large single-number hero metrics with no baseline, source, or timestamp.
- Charts that look production-ready while using sample data.
- Analytics surfaces built on unauthenticated or unscoped endpoints.
- Browser-native EventSource dashboards that depend on bearer-only SSE routes.
- Tooltips that contain essential meaning unavailable elsewhere.
- Scenario charts with different scales that make outcomes look more comparable
  than they are.
- Duplicate legends.
- Dense gridlines, shadows, gradients, or decoration that compete with the data.
- Hiding failed, forbidden, or unavailable sections to make a page look cleaner.
- Exporting LP-facing charts without version, timestamp, and LP-scope evidence.

## Accessibility and responsive requirements

These are requirements, not suggestions. A chart or evidence surface is not done
until it satisfies them (and the v3.1.1 keyboard-parity rubric).

- **Sparklines.** The `▁▂▃▅▇` glyphs are illustrative only. A real sparkline
  must be `aria-hidden` with a visually-hidden text alternative naming the value
  and direction, e.g. "TVPI 2.1x, trending up over 5 quarters." Never expose raw
  block glyphs to a screen reader.
- **Evidence trigger / provenance popover.** Keyboard-focusable, opens on
  Enter/Space, closes on Escape, `aria-expanded` reflects state, focus returns
  to the trigger on close. Reuse the v3.1.1 `Tooltip` focus behavior.
- **Contrast.** State colors must meet 4.5:1 against the rail/section
  background. Amber on light surfaces is the contrast trap (use
  `text-amber-800`, not a lighter amber) — verify STALE/DEMO explicitly.
- **Touch targets.** Evidence trigger, recalculate, and band/grid/matrix toggles
  are ≥44px.
- **Reduced motion.** All CALCULATING/scan motion degrades to instant under
  `prefers-reduced-motion`, per the v3.1.1 motion grammar.
- **Responsive.** Evidence header follows the Tier-1-always / Tier-2+3-collapse
  rule at 960px. Comparison surfaces follow the density thresholds in the
  rollout plan (≤3 band, 4–5 grid, metric×variant matrix).
- **Color independence.** Every color-encoded state also carries a text label,
  shape, or ordering cue.

## Testing implications

This doctrine should produce testable guardrails over time. Start with
lightweight assertions instead of screenshot-perfect tests.

Suggested tests:

- Production chart components do not import or render `SAMPLE_DATA` without a
  visible demo/sample label.
- Each fund results section renders an evidence header when the server supplies
  provenance fields.
- Comparison/small-multiple components share a common domain by default.
- Stale results show a visible stale warning and recalculation action.
- Forbidden/unauthenticated states render honest unavailable/access messages,
  not empty charts.
- Charts with color encodings include text labels or non-color cues.
- LP/report exports include source/version/timestamp evidence and LP-scope
  evidence.

## Relationship to Updog Design Philosophy v3.1.1

The broader design philosophy says Updog is dashboard-first, action-near,
multi-entity, and provenance-first. This document narrows that philosophy into
analytical visualization rules:

- Dashboard-first becomes evidence-first dashboards.
- Action-near becomes decisions near the supporting comparison.
- Provenance-first becomes visible run/version/source/access state.
- Multi-entity becomes small multiples, ranked tables, and comparable views
  across funds, SPVs, sidecars, companies, LP groups, and scenarios.
