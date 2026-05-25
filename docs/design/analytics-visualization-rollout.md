---
status: ACTIVE
audience: both
last_updated: 2026-05-24
categories: [design, analytics, rollout, visualization, truthfulness]
keywords:
  [fund-results, provenance, small-multiples, sparklines, rollout, testing]
source_of_truth: false
agent_routing:
  priority: 2
  route_hint:
    'Use after accepting analytics-visualization-principles.md to plan
    implementation PRs.'
  use_cases:
    [
      implementation_planning,
      chart_refactor,
      fund_results_provenance,
      scenario_comparison,
      visual_truthfulness_tests,
    ]
maintenance:
  owner: 'Product + Frontend'
  review_cadence: 'P60D'
---

# Analytics Visualization Rollout Plan

## Purpose

This plan applies `docs/design/analytics-visualization-principles.md` to the
`Updog_restore` product without distracting from the core priority: a truthful,
authoritative fund-modeling flow from setup to published results.

The rollout is presentation-layer first. It should not modify calculation
semantics unless a visualization exposes a data-contract gap that must be solved
at the source.

## Sequencing principle

Do not launch a cosmetic analytics redesign ahead of the data layer. The correct
order is:

1. Make the result true.
2. Make the result traceable.
3. Make the result comparable.
4. Make the result beautiful.

## Phase 0 — Adopt the rule, not the redesign

**Goal:** Establish a shared review standard for analytical displays.

**Actions:**

- Add `analytics-visualization-principles.md` to design docs.
- Route chart/dashboard reviews through its checklist.
- Treat it as presentation-layer doctrine, not backend architecture guidance.
- Require any production analytics surface to state whether it is live, stale,
  unavailable, or demo/sample-backed.

**Exit criteria:**

- The doctrine is discoverable through `docs/design/README.md`.
- New chart PRs can cite the checklist.
- Designers and engineers agree that visual truthfulness outranks decorative
  polish.

## Phase 1 — Fund results evidence headers

**Surface:** `/fund-model-results/:fundId`

**Why first:** This is the authoritative post-publish destination for the fund
model. It is where users need the clearest evidence that outputs came from
server-backed results rather than UI state or local placeholders.

**Actions:**

- Introduce an `EvidenceHeader` or equivalent component.
- Add evidence headers to each major results section when server fields are
  available.
- Include calculation status, published config version, run ID, timestamp,
  source section, and current/stale state.
- Keep unavailable sections visible with clear explanations.
- Preserve background polling and lifecycle behavior; do not hide prior results
  during recalculation unless the prior result is invalid.

**Suggested UI copy:**

```text
READY · CONFIG v12 · RUN #148 · CALCULATED MAY 24, 2026 09:41 PT · SOURCE /api/funds/:id/results · CURRENT
```

**Engineering notes:**

- Prefer existing contract fields before expanding API contracts.
- If a needed provenance field is missing, add a small contract change rather
  than fabricating UI-only evidence.
- Keep evidence compact by default; allow expanded details for audit/review
  workflows.

**Tests:**

- Each available results section renders its evidence state.
- Stale lifecycle state renders a visible warning and recalculation action.
- Failed or unavailable sections render an explanatory panel instead of
  disappearing.

## Phase 2 — Pilot chart refactor: retired

**Status:** The `portfolio-cost-value-chart.tsx` component has been retired.

**Reason:** The component had zero callsites in the production codebase and
contained hard-coded `SAMPLE_DATA` rendered silently, which violates the
analytics visualization doctrine (no silent sample data in production import
paths). Rather than maintaining an unused, doctrine-violating file, the
component was removed.

**Next pilot:** When chart implementation work resumes, the new pilot will be
selected from the remaining Phase 3--5 candidates: scenario comparison and small
multiples, reserve planning and ranked tables, or LP report provenance and
export evidence.

## Phase 3 — Scenario comparison and small multiples

**Surfaces:** Scenario builder, construction vs. current forecasts,
MOIC/TVPI/DPI/IRR analysis.

**Why:** Venture modeling is inherently comparative. Users need to see how
assumptions change outcomes without mentally translating across different
charts.

**Actions:**

- Add `SmallMultipleGrid` or an equivalent layout primitive.
- Show base/upside/downside/current/conservative cases side by side where
  applicable.
- Lock scales across compared charts by default.
- Place assumption diffs beside outcome deltas.
- Add short captions that explain the mechanism behind the difference.

**Tests:**

- Small multiples share a common domain unless explicitly overridden.
- Assumption diffs and outcome deltas are visible in the same comparison
  surface.
- Scenario labels are visible without relying on color alone.

## Phase 4 — Reserve planning and ranked tables

**Surfaces:** Reserve planning, optimal reserves ranking, portfolio-company
watchlists, capital allocation tables.

**Why:** Reserve planning is a ranked decision problem. The UI should explain
why a company needs follow-on dollars, not just show a static total.

**Actions:**

- Add row-level sparklines for compact trend reading.
- Include current/planned/deployed reserve columns where the underlying data
  supports it.
- Add “why this company?” annotations: runway, ownership effect, round timing,
  valuation movement, or trigger condition.
- Keep ranking methodology visible near the table.

**Tests:**

- Ranking tables expose the ranking basis.
- Sparklines render with text values and do not encode meaning by color alone.
- Empty or unsupported ranking inputs show an unavailable state.

## Phase 5 — LP reports and shared dashboards

**Surfaces:** LP reports, shared dashboards, report exports.

**Why:** LP-facing surfaces need high trust and low ambiguity. They should
integrate words, numbers, charts, and evidence notes.

**Actions:**

- Add export timestamp, report version, and data-source notes.
- Include calculation version/run evidence for material metrics.
- Prefer annotated visual summaries over chart-only pages.
- Label demo or preview exports clearly.

**Tests:**

- Export/report surfaces include timestamp and source/version evidence.
- Unsupported sections explain what is missing.
- LP-facing metrics do not render without evidence or a visible fallback state.

## Phase 6 — Visual truthfulness tests and guardrails

**Goal:** Convert the doctrine into sustainable lightweight checks.

**Actions:**

- Add unit tests around evidence headers and stale/demo states.
- Add lint or static checks for suspicious `SAMPLE_DATA` usage in production
  chart components.
- Add component tests for shared-scale behavior in comparison charts.
- Add review checklist references to PR templates or design-review notes when
  appropriate.

**Avoid initially:**

- Screenshot-perfect tests for every chart.
- Broad chart-library migrations.
- Overly rigid visual linting that blocks legitimate prototypes.

## Candidate implementation order

1. `docs/design/*` doctrine and README entry point.
2. `EvidenceHeader` component prototype.
3. Fund results section evidence headers.
4. Portfolio Cost and Value chart pilot refactor.
5. Scenario small-multiple primitive.
6. Reserve ranking table improvements.
7. LP/report provenance and export evidence.
8. Static/sample-data guardrails.

## Definition of done for a chart PR

A chart PR is done when it can answer:

- What decision does the visual support?
- What is the baseline comparison?
- What data source/run/version produced the values?
- What states are supported: loading, empty, partial, stale, failed, demo?
- Are labels, units, and axes honest?
- Is any essential meaning hidden only in a tooltip?
- Is sample data isolated from production paths?

## Relationship to the current repo

Use this rollout with existing libraries and components first. The repo already
includes chart libraries such as Recharts/Chart.js, route-level fund results
behavior, and lifecycle-aware server-backed results. The first improvements
should refine evidence, comparison, and labeling rather than introduce a new
visualization stack.
