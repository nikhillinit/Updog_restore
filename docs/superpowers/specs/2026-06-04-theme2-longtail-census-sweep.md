---
status: DRAFT (scope only — NOT approved for execution)
created: 2026-06-04
topic:
  Theme 2 — long-tail census sweep (wave 3) to declare token rollout 100% done
authors: [claude, nikhil]
related:
  - DESIGN.md
  - client/src/theme/presson.tokens.ts
  - docs/superpowers/specs/2026-06-03-theme2-parallel-hermes-partition-design.md
    (wave 2 — Sec 2 mapping reused verbatim)
  - PR #769 #771 #772 #773 #774 (rollout waves, all merged to main @ 73640dd6)
---

# Theme 2 — Long-Tail Census Sweep (Wave 3)

## Status

**SCOPE ONLY.** This document sizes and partitions the remaining work. It is NOT
an execution plan and nothing here has been dispatched. Execution (writing-plans

- Hermes) is a separate, explicit go.

## Problem

The token rollout migrated its named high-value surfaces across waves 1–2
(#769/#771), the shared layer (#772), the page long-tail (#773), and cap-table +
sensitivity (#774). The **unnamed long tail** — feature components and pages no
wave claimed — still carries raw Tailwind/hex color. This sweep censuses what
remains on **live** surfaces, excludes dead code, and partitions the migration
so the rollout can be formally declared 100% complete.

## Headline numbers (reproducible — see Methodology)

| Bucket                                 | Files  | Occ      | Notes                                |
| -------------------------------------- | ------ | -------- | ------------------------------------ |
| **LIVE migration target**              | **71** | **1096** | the work                             |
| — fresh (untouched files)              | 63     | 1055     | auto-dispatchable                    |
| — residue (already-swept globs / TODO) | 9      | 41       | hand-migrate, hard cases             |
| Transitively DEAD (excluded)           | 42     | 797      | imported only by the 17 dead pages   |
| Token-definition files (excluded)      | 6      | 163      | their hexes ARE the tokens           |
| Shared layer (#772, excluded)          | 1      | 18       | `ui/BrandShowcase.tsx` — verify-only |

Off-token sub-types within the live target:

- **KILL (purple / violet / fuchsia): 23** — hard doctrine violation (rule 7).
  Highest priority. Concentrated in **B2** (16 of 23).
- **indigo: 9** — blue-family, NOT a kill; resolves to charcoal (action) or info
  (static) per rules 2/5.
- **black `#000`: 0** — none (charcoal is `#292929`, not black).
- **white: 68** — `bg-white`/`text-white`, pixel-identical to `pov-white`.
  Cosmetic token-naming only; lowest priority, batch with whatever file owns it.

## Methodology (so this is reproducible without the temp scripts)

**Off-token regexes** (applied to `client/src/**/*.{ts,tsx}`):

```
numbered  \b(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|placeholder|caret|accent|decoration|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)\b
arbitrary \[#[0-9a-fA-F]{3,8}\]                         (e.g. text-[#292929])
hex-lit   ['"`]#[0-9a-fA-F]{6}\b                         (e.g. fill="#3b82f6")
kill      \b(bg|text|border|ring|fill|stroke|from|to|via)-(violet|purple|fuchsia)-
black     \b(bg|text|border|fill|stroke|ring|divide)-black\b
white     \b(bg|text|border|fill|stroke|ring|divide)-white\b   (cosmetic)
```

**Three exclusion sets** (applied before counting):

1. **Tests / stories**: `*.test.{ts,tsx}`, `__tests__/`, `*.stories.*`.
2. **Token-definition files** (hexes are canonical, not strays):
   `client/src/theme/**`, `lib/brand-tokens.ts`, `lib/press-on-theme.ts`,
   `lib/chart-theme/**`.
3. **Dead code**:
   - 17 dead pages (see `project_dead_page_audit` memory) + dead trees
     (`components/investments/**`, `components/portfolio-constructor/**`,
     `components/cap-table/scenario-manager.tsx`).
   - **Transitively-dead** modules: a static import-graph BFS rooted at the Vite
     entry `client/src/main.tsx` (resolving `@/` and relative specs, static +
     `React.lazy` dynamic imports). Any target file NOT in the reachable set is
     imported only by dead pages → excluded. 332 modules are reachable.

**Reachability was spot-validated**: `CohortHeatMap`, `irr-summary`, and the
capital-allocation `AllocationsTable` have zero importers;
`exit-proceeds-recycling` and `optimal-reserves-ranking` are imported only by
`pages/planning.tsx` (dead). The analyzer is sound — false-DEAD risk is low, but
**re-run the reachability check at execution time** (the import graph drifts).

## Transitively-DEAD exclusion list (42 files — DO NOT migrate)

Load-bearing artifact: this is the expensive insight that prevents repeating the
#771 waste (migrating dead pages). Keep dormant per team policy; do not delete.

```
components/recycling/exit-proceeds-recycling.tsx                         (K4)
components/planning/graduation-rate-strategy.tsx                          (K6)
components/planning/exit-analysis.tsx                                     (K5)
components/performance/irr-summary.tsx
components/cohorts/CohortHeatMap.tsx
components/planning/portfolio-construction.tsx                           (K6)
components/custom-fields/custom-fields-manager.tsx                       (K2)
components/reports/mobile-tear-sheet.tsx
components/reserves/optimal-reserves-ranking.tsx
components/budget/budget-creator.tsx
components/cohorts/CohortDefinitionSelector.tsx
components/integrations/NotionIntegrationHub.tsx                         (K1)
components/investment/fund-liquidation-warnings.tsx                      (K1)
components/insights/data-driven-insights.tsx
components/custom-fields/custom-fields-editor.tsx
components/examples/KpiDashboardExample.tsx
components/reports/tearsheet-customization.tsx                           (K3)
components/reserves/ApprovalPanel.tsx
components/cohorts/CoverageIndicator.tsx
components/cohorts/SectorMappingUI.tsx
components/ComingSoonPage.tsx
components/modeling-wizard/steps/capital-allocation/AllocationsTable.tsx
components/metrics/TargetMetricsSnapshot.tsx
hooks/useFlags.tsx
components/metrics/MetricsCard.tsx
components/forecasting/portfolio-insights.tsx
components/timeline/TimelineSlider.tsx
components/modeling-wizard/steps/capital-allocation/PortfolioTable.tsx
components/forecasting/investable-capital-summary.tsx
components/metrics/VarianceBadge.tsx
components/portfolio/SecondaryMarketAnalysis.tsx
features/scenario/ScenarioCompareChart.tsx
components/admin/AIUsageWidget.tsx
components/DemoToolbar.tsx
components/insights/OptimalReservesCard.tsx
components/reserves/ReserveOpportunityTable.tsx
utils/pdf/templates/QuarterlyTemplate.tsx
components/modeling-wizard/steps/capital-allocation/CapitalHeader.tsx
components/modeling-wizard/steps/capital-allocation/PortfolioConfigForm.tsx
components/modeling-wizard/steps/capital-allocation/PortfolioSummary.tsx
components/portfolio/moic-analysis.tsx
utils/pdf/templates/K1Template.tsx
```

> Note: several areas are SPLIT (live + dead). E.g. `reports/reports.tsx` is
> live but `reports/mobile-tear-sheet.tsx` is dead;
> `performance/PerformanceDashboard` live, `performance/irr-summary` dead.
> **Batches are area globs MINUS this dead list** — agents must operate on the
> explicit per-batch manifest below, NOT a blanket `components/<area>/**` glob.

## Canonical mapping

Reuse the wave-2 spec Section 2 **verbatim** (legal vocabulary, hard
constraints, the 8-step decision procedure, the affordance test, colorblind
rule). Do not re-derive. Two clarifications surfaced by this census:

- **indigo** is blue-family → rule 2 (charcoal, if it has an interactive
  affordance) or rule 5 (presson-info, if static). It is NOT a rule-7 kill.
- **`bg-white`/`text-white`** → `bg-pov-white`/`text-pov-white` (mechanical,
  pixel identical). Migrate opportunistically; never a blocker.

## Proposed partition (4 disjoint batches + residue)

Disjoint file sets → can run as parallel Hermes agents on one branch (wave-2
pattern). Each agent owns the explicit manifest, excludes shared layer
(`components/{ui,layout,charts,dashboard,common}`), and flags
shared-layer-blocked surfaces with `// TODO(design)` rather than touching them.

| Batch  | Theme                                                                                                    | Files | Occ | KILL   | indigo |
| ------ | -------------------------------------------------------------------------------------------------------- | ----- | --- | ------ | ------ |
| **B2** | Portfolio construction (allocation/reserves/pipeline/cash/backtesting)                                   | 8     | 365 | **16** | 5      |
| **B1** | Reporting + LP (lp/reports/performance/fund-results/lp-reporting)                                        | 14    | 326 | 6      | 4      |
| **B3** | Analytics + misc components (analytics/results/sensitivity/monte-carlo/portfolio/cap-table/features/...) | 21    | 216 | 1      | 0      |
| **B4** | Pages + app shell (pages/_, pages/v2/_, app/, lib/, utils/)                                              | 20    | 148 | 0      | 0      |
| **R**  | Residue (hand-migrate, NOT auto-dispatch)                                                                | 9     | 41  | —      | —      |

**B2 is the doctrine hotspot** (16 of 23 kills) — run/review it first.

### B2 — Portfolio construction (8f / 365)

```
99      allocation/allocation-ui.tsx
63  K5  allocation/sector-profile-builder.tsx
47  K6  reserves/graduation-reserves-demo.tsx
45  K2  cash-management/cash-management-dashboard.tsx
43  K3  pipeline/DealCard.tsx
42      backtesting/BacktestingWorkspace.tsx
22      pipeline/ImportDealsModal.tsx
4       pipeline/DroppableColumn.tsx
```

### B1 — Reporting + LP (14f / 326)

```
66      performance/PerformanceDashboard.tsx
62      reports/reports.tsx
35  K1  reports/tear-sheet-dashboard.tsx
30  K2  lp/NotificationsWidget.tsx
26  K1  lp/DashboardSummary.tsx
22  K1  lp/DocumentsWidget.tsx
21      lp/CapitalCallsWidget.tsx
21  K1  lp/DistributionsWidget.tsx
13      lp/PerformanceMetricsCard.tsx
11      lp/CapitalAccountTable.tsx
9       fund-results/FundModelScorecard.tsx
5       lp-reporting/XirrDiagnosticPanel.tsx
3       fund-results/ReserveAllocationBreakdown.tsx
2       lp-reporting/MetricsCards.tsx
```

### B3 — Analytics + misc (21f / 216)

```
53  analytics/VarianceChart.tsx          25  ErrorBoundary.tsx
22  analytics/TimelineChart.tsx          12  analytics/StatCard.tsx
12  results/EvidenceHeader.tsx           12  features/analytics-parity/QuarterlyReviewTrace.tsx
11  analytics/AnalyticsErrorBoundary.tsx  9  results/scenario-evidence.ts
8   analytics/ErrorState.tsx              8  cap-table/cap-table-calculator.tsx
8   monte-carlo/MetricDistributionChart.tsx  6  sensitivity/OneWayPanel.tsx
5   portfolio/portfolio-analytics-dashboard.tsx  5  sharing/ShareConfigModal.tsx
4   monte-carlo/CalibrationStatusCard.tsx  4  portfolio/benchmarking-dashboard.tsx
3   sensitivity/TwoWayPanel.tsx           3  StagingRibbon.tsx
2   cap-table/safe-note-editor.tsx        2  demo/DemoBanner.tsx (K1)
2   portfolio/tag-performance-analysis.tsx
```

### B4 — Pages + shell (20f / 148)

```
18  pages/FundBasicsStep.tsx     17  pages/v2/today.tsx     14  pages/v2/cash.tsx
12  pages/help.tsx               10  pages/settings.tsx     10  pages/v2/company.tsx
9   app/app-router.tsx           8   lib/fund-header-metric-calculations.ts
7   app/app-layout.tsx           6   pages/InvestmentRoundsStepV2.tsx
6   pages/v2/insights.tsx        6   pages/v2/portfolio.tsx  5  pages/steps/StepNotFound.tsx
5   utils/pdf/chart-export.ts    4   pages/not-found.tsx     3  lib/reallocation-utils.ts
3   lib/toast.ts                 2   app/app-routes.tsx
2   utils/pdf/components/PdfMetricCard.tsx   1  pages/v2/exits.tsx
```

### R — Residue (9f / 41 — hand-migrate)

Files inside already-swept globs (wave-2 Agent W / #773) or carrying TODO
markers. These are the hard/adjudicated cases; auto-migration is poor at them.
Review by hand, do not dispatch to Codex.

```
13  wizard/StageAccordionRow.tsx      5  pages/reports.tsx (residual)
4   wizard/ModernStepContainer.tsx    4  wizard/ProfileHeader.tsx
4   wizard/SectorProfileSwitcher.tsx  4  pages/fund-setup.tsx (residual)
4   pages/performance.tsx (residual)  3  wizard/WizardCard.tsx
0   sensitivity/StressPanel.tsx       (TODO(a11y) only — belongs to follow-up #4, not here)
```

## Special cases & guardrails

- **Charts**: categorical series → `getChartColor()` / `presson.color.*`,
  fixed-order palette, **≤6 hues** (rule 4b). Existing `// TODO(design)` >6-hue
  deferrals (`charts/fund-expense-charts`, `dashboard/portfolio-concentration`)
  are shared-layer — out of scope.
- **a11y**: sole-color gain/loss → `// TODO(a11y)` only (defer to follow-up #4,
  its own PR). StressPanel already carries this marker.
- **shadcn semantic tokens** (`bg-muted`, `border-input`, `*-foreground`,
  `ring-ring`) are NOT numbered-palette and are correctly excluded — do not
  rewrite primitives (the #772 lesson; see
  `feedback_token_migration_shadcn_exclusion`).
- **Sanctioned arbitrary-hex tags** (muted teal/lavender/orange/pink
  classification chips) are the TARGET vocabulary — leave them; do not
  neutralize.
- **white** (`bg-white`/`text-white`) is cosmetic — migrate opportunistically
  only.

## Risks

| ID  | Risk                                                     | Mitigation                                                                                                         |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| R1  | False-DEAD (live file misread as dead → under-migration) | Re-run `main.tsx` reachability + grep importers at execution; analyzer spot-validated                              |
| R2  | Auto-migration churns the hard residue                   | Residue (batch R) is hand-migrated, never dispatched                                                               |
| R3  | Cross-batch token inconsistency                          | Shared wave-2 Sec 2 mapping + reviewer cross-surface cohesion diff                                                 |
| R4  | Test asserts an old raw color                            | Grep touched files' tests for old values before push (the StressPanel #774 lesson)                                 |
| R5  | Blanket `area/**` glob sweeps a dead sibling             | Agents use the explicit per-batch manifest, not area globs                                                         |
| R6  | Self-promotion to the calc gate                          | Keep the `--task` string finance-keyword-free; detail in `.hermes-*.md`; dry-run must show `risk:standard score:0` |

## Acceptance

Reuse wave-2 spec Section 5 acceptance criteria (AC#1–10) per batch. Plus: a
final re-census (this methodology) over live surfaces returns **0** off-token
classes except explicit `// TODO(design)`/`// TODO(a11y)` escalations → rollout
100% done.

## Next step (requires explicit approval — NOT taken)

On approval: re-verify reachability, then `writing-plans` to produce the
executable plan (per-batch `.hermes-*.md` + branch/PR checklist). B2 first
(doctrine hotspot). Do not launch Hermes or writing-plans from this scope doc
alone.
