---
status: ACTIVE
audience: both
last_updated: 2026-06-02
categories: [design, analytics, rollout, visualization, truthfulness]
keywords:
  [
    fund-results,
    provenance,
    evidence-header,
    scenario-workspace,
    small-multiples,
    sparklines,
    rollout,
    testing,
  ]
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
semantics unless a visualization exposes a data-contract, provenance, or display
truthfulness gap that must be solved at the source.

## Current state — 2026-06-02

The first pass has already landed. Treat the next work as refinement of live
surfaces, not a fresh doctrine exercise.

Delivered since the original proposal:

- Analytics visualization doctrine under `docs/design/`.
- PR-template checklist for Analytics / Results Truthfulness.
- Docs-link CI coverage for active docs and PR-template links.
- `EvidenceHeader` component mounted on selected fund-results sections.
- Retired `portfolio-cost-value-chart.tsx`, which had zero runtime callsites and
  hard-coded `SAMPLE_DATA`.
- Shared scenario-comparison contract and server-backed comparison path.
- Focused scenario workspace at `/fund-model-results/:fundId/scenarios`.
- Broader route/worker/live-surface hardening around canonical fund IDs and
  scoped data visibility.

## Sequencing principle

Do not launch a cosmetic analytics redesign ahead of the data layer. The correct
order is now:

1. Make the result true.
2. Make the result scoped to the right entity.
3. Make the result traceable.
4. Make the result comparable.
5. Make the result beautiful.

## Phase 0 — Adopt the rule, not the redesign

**Status:** Complete.

**Delivered:**

- Analytics visualization doctrine added under `docs/design/`.
- PR review checklist added for analytics/results truthfulness.
- Active documentation links guarded in CI.

**Keep doing:**

- Use the checklist for every production analytics, report, chart, export, or
  scenario-view PR.
- Treat visual truthfulness as a product quality gate, not a design preference.

## Phase 1 — Fund results evidence headers

**Status:** Partially shipped.

**Surface:** `/fund-model-results/:fundId`

**Delivered:**

- `EvidenceHeader` component.
- Lifecycle-backed evidence mounted on Reserve Allocation and Deployment Pacing
  sections.
- Tests for READY, CALCULATING, FAILED, STALE, and UNAVAILABLE states, including
  null run/config fallback behavior.

**Next actions:**

- Extend evidence headers to every material result section. The overview,
  scenarios, economics, waterfall, and reserve/pacing sections can mount a basic
  lifecycle header now from the top-level `lifecycle` field in
  `fund-results-v1.contract.ts` (always present, no backend work). Carry is not
  a separate section; it renders inside the economics card and inherits its
  header.
- Add section-specific source notes where section evidence is more specific than
  the generic fund-results endpoint. Prerequisite: the overview/scorecard
  section is payload-only today (`ScorecardSectionSchema` does not use
  `SectionAvailableSchema`, so it has no section-level `calculatedAt`/`source`).
  A section source note for overview is therefore a separate small contract
  sub-task; the basic header does not need it.
- Make stale evidence actions consistent: users should know whether to
  recalculate, publish, refresh, or wait for polling.

**Tests:**

- Each available result section renders an evidence state when lifecycle data is
  present.
- Stale lifecycle state renders a visible warning and recalculation action.
- Failed or unavailable sections render explanatory panels instead of
  disappearing.

## Phase 2 — Scenario evidence and comparison workspace

**Status:** Shipped foundation; visualization refinement remains.

**Surfaces:** `/fund-model-results/:fundId/scenarios`, scenario summary section
inside `/fund-model-results/:fundId`.

**Delivered:**

- Strict shared comparison contract:
  `shared/contracts/fund-scenario-comparison-v1.contract.ts`.
- Client parsing through shared Zod schemas.
- Protected scenario workspace route.
- Route-scoped fund selection for the nested scenario path.
- Existing scenario-set, status, result, and comparison surfaces wired together
  with calculate/queue actions for existing sets.

**Next actions:**

- Treat the scenario workspace as the new pilot surface instead of the retired
  portfolio cost/value chart.
- Add evidence/source bands to scenario comparison cards: source config version,
  scenario set name, comparison status, staleness, and baseline source.
- Bound the workspace first: it currently fetches detail/status/comparison for
  every scenario set (`fund-scenario-workspace.tsx`). Variant count is capped at
  5 but set count is not. Add scenario-set selection/pagination ("one set at a
  time") before layering density primitives, or the workspace becomes a
  multi-set comparison wall.
- Improve comparison density, toggled via a small segmented toggle (no
  `SegmentedControl` exists yet — build one or use a minimal toggle). Scenario
  sets are capped at 5 variants (`fund-scenario-sets-v1.contract.ts`,
  `.max(5)`), each carrying 8 metric deltas, so density is driven by metric
  breadth, not variant count:
  - **≤3 variants:** `ComparisonBand` (side-by-side).
  - **4–5 variants:** `SmallMultipleGrid` (shared scales).
  - **Dense metric comparison:** a metric×variant cross-tab `matrix` (up to 5 ×
    8), selectable regardless of variant count.
- Keep unsupported reserve-allocation comparisons explicit until reserve
  comparison semantics are implemented.
- Decide the scope of write actions explicitly. The workspace already exposes a
  "Create optimized reserve plan" action (`fund-scenario-workspace.tsx`), which
  contradicts "reading-first." Either gate/defer that action or update this
  scope statement to acknowledge it — do not leave the doc and the live UI
  disagreeing.

**Tests:**

- Scenario comparison cards expose baseline, variant, source config version, and
  stale/unavailable states.
- Unsupported override types remain explicit, not silently hidden.
- Scenario workspace route keeps route-scoped fund selection working.

## Phase 3 — Retired pilot cleanup and next pilot selection

**Status:** Pilot reset.

The original chart pilot, `portfolio-cost-value-chart.tsx`, was retired because
it had zero runtime callsites and embedded hard-coded `SAMPLE_DATA`. Refactoring
a dead component would not have improved the product.

**Next pilot candidates:**

1. Scenario comparison cards/workspace, because the contract and route now
   exist.
2. Economics cashflow and J-curve displays inside fund results, because they are
   live authoritative result sections and currently use compact custom visuals.
3. Publish comparison, because it already supports publish-to-publish deltas and
   drift capability reasons.
4. LP reports/shared dashboards, after report/source evidence is surfaced.

**Selection rule:** Choose the pilot with active users, server-backed data, and
a clear decision loop. Do not pick a dead or sample-backed component.

## Phase 4 — Small multiples and comparison grammar

**Status:** Next product-design layer.

**Surfaces:** Scenario workspace, construction vs. current forecasts, MOIC/TVPI/
DPI/IRR analysis, publish comparison.

**Actions:**

- Introduce a `SmallMultipleGrid` or equivalent layout primitive only after a
  live comparison surface needs it.
- Show base/upside/downside/current/conservative cases side by side where
  applicable.
- Lock scales across compared charts by default.
- Place assumption diffs beside outcome deltas. Prerequisite: the comparison
  contract carries no driver/assumption-diff data and locks `overrideType` to
  `fee_profile` (`fund-scenario-comparison-v1.contract.ts`); broadening it is a
  contract/server slice that precedes this visual work.
- Add short captions that explain the mechanism behind the difference.

**Tests:**

- Small multiples share a common domain unless explicitly overridden.
- Assumption diffs and outcome deltas are visible in the same comparison
  surface.
- Scenario labels are visible without relying on color alone.

## Phase 5 — Reserve planning and ranked tables

**Status:** Future rollout (after this cycle); keep scoped to evidence-backed
surfaces.

**Surfaces:** Reserve planning, optimal reserves ranking, portfolio-company
watchlists, capital allocation tables.

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
- Empty, unsupported, or stale ranking inputs show a truthful state.

## Phase 6 — LP reports and shared dashboards

**Status:** Future rollout (after this cycle); presentation work remains.

**Surfaces:** LP reports, shared dashboards, report exports.

**Actions:**

- Add export timestamp, report version, and data-source notes.
- Include calculation version/run evidence for material metrics.
- Prefer annotated visual summaries over chart-only pages.
- Label demo or preview exports clearly.

**Tests:**

- Export/report surfaces include timestamp and source/version evidence.
- Unsupported sections explain what is missing.
- LP-facing metrics do not render without evidence or a visible fallback state.

## Phase 7 — Visual truthfulness tests and guardrails

**Status:** Started via PR template and docs-link CI; code-level guards remain.

**Actions:**

- Add unit tests around evidence headers and stale/demo states.
- Start a demo-data guardrail EARLY (in parallel with step 1, not at the end):
  first inventory the real demo/mock/sample/fixture patterns in the codebase,
  then add a static check + allowlist. Do not scope the guard to the single
  literal `SAMPLE_DATA` identifier — that misses most demo paths.
- Add component tests for shared-scale behavior in comparison charts.
- Keep docs/checklist references link-checked.

**Avoid initially:**

- Screenshot-perfect tests for every chart.
- Broad chart-library migrations.
- Overly rigid visual linting that blocks legitimate prototypes.

## Contract prerequisites (server/data work that precedes the visuals)

These visual goals depend on data the contracts do not carry yet. Sequence the
contract slice before the matching UI, or the UI ships on missing data.

- **Overview source note:** wrap `ScorecardSectionSchema` in
  `SectionAvailableSchema` so it carries `calculatedAt`/`source` (basic header
  works without this).
- **Access-scope evidence:** add a server-emitted access-scope to the results
  contract; `EvidenceHeaderLifecycle` has no scope field today.
  `AccessScopeNote` must be contract-backed, not inferred client-side from the
  route (self-certifying security is the anti-pattern this doctrine warns
  against).
- **Comparison drivers:** broaden `overrideType` beyond `fee_profile` and add
  assumption-diff/driver data to `fund-scenario-comparison-v1.contract.ts`
  before Phase 4's "why did it change" comparisons.

## Candidate implementation order from here

1. **Lock the `EvidenceHeader` visual contract first:** Tier-1/2/3 hierarchy,
   state→token color mapping, 960px responsive collapse, and DEMO ribbon+border.
   Mount it on the two live sections as the reference implementation.
2. Extend `EvidenceHeader` coverage across all material fund-results sections,
   building from the locked contract (no per-section re-design).
3. Make the scenario workspace the first live visualization-refinement pilot.
4. Add scenario comparison evidence/source bands and the count-threshold density
   switch (band / grid / matrix).
5. Improve economics cashflow/J-curve displays with direct labels, captions, and
   evidence notes.
6. Select a reserve/portfolio ranking table and add sparkline + "why" columns.
7. Add LP/report provenance and export evidence.
8. Add static/sample-data guardrails.
9. Add shared-scale comparison tests after the first small-multiple component
   ships.

Rationale: step 1 previously mounted the header on 5+ sections before its visual
contract existed, guaranteeing rework. Locking the contract first makes the
breadth rollout mechanical.

## Rollout boundary (stop rule)

This rollout is intentionally narrow: **one evidence primitive, one live pilot,
one contract-dependency list, then stop.**

- **In this cycle:** Phases 0–4 — EvidenceHeader contract + breadth, the
  scenario workspace pilot, comparison evidence/density, and the contract
  prerequisites above.
- **Future rollouts (not now):** Phases 5–7 — reserve/portfolio ranking tables,
  LP/report provenance and exports, and broad sparkline/guardrail expansion.
  Sequence them after the contract slices land and the pilot proves the pattern.

Do not start Phase 5+ surfaces before the EvidenceHeader contract and the
scenario pilot are solid.

## Definition of done for an analytics PR

An analytics PR is done when it can answer the questions below. These are the
PR-time subset of the canonical **Chart review checklist** in
`analytics-visualization-principles.md`, which is the single source of truth —
when the checklist changes, update it there, do not fork a new list. The
PR-template Analytics / Results Truthfulness checklist references the same
canonical list.

- What decision does the visual support?
- What is the baseline comparison?
- What data source/run/version produced the values?
- What states are supported: loading, EMPTY (supported, no data), PARTIAL (mixed
  success), stale, failed, demo?
- Are labels, units, and axes honest?
- Is any essential meaning hidden only in a tooltip?
- Is sample data isolated from production paths, and are EMPTY/PARTIAL/DEMO
  client states distinct from calc-status?
- Are sparklines and provenance triggers keyboard- and screen-reader-accessible?
- Do state colors bind to v3.1.1 tokens and meet 4.5:1 contrast?

## Relationship to the current repo

Use this rollout with existing libraries and components first. The repo already
includes chart libraries such as Recharts/Chart.js, route-level fund results
behavior, lifecycle-aware server-backed results, scenario comparison contracts,
and an emerging scenario workspace. The first improvements should refine
evidence, comparison, and labeling rather than introduce a new visualization
stack.
