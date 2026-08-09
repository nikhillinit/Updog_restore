# Canary exclusion closed worklist

Source: `API_ROUTE_POLICY_REGISTRY` in
`server/route-policy/api-route-policy-registry.ts`. A route is in this universe
when `financialSurface !== 'none'` OR `exportPolicy !== 'not_exportable'`. This
snapshot contains 143 policy entries. Regenerate/check with:

```sh
npx tsx -e "import {API_ROUTE_POLICY_REGISTRY} from './server/route-policy/api-route-policy-registry.ts'; console.log(API_ROUTE_POLICY_REGISTRY.filter(e => e.financialSurface !== 'none' || e.exportPolicy !== 'not_exportable').length)"
```

## Policy read-surface universe

- [x] `UI /shared/:shareId` — lp_reporting / preview_only.
- [x] `UI /fund-setup` — fund_modeling / not_exportable.
- [x] `UI /dashboard` — portfolio_management / not_exportable.
- [x] `UI /portfolio/company/:id` — portfolio_management / not_exportable.
- [x] `UI /portfolio` — portfolio_management / not_exportable.
- [x] `UI /performance` — moic_reserves / not_exportable.
- [x] `UI /forecasting` — fund_modeling / not_exportable.
- [x] `UI /financial-modeling` — fund_modeling / not_exportable.
- [x] `UI /model-results` — fund_modeling / not_exportable.
- [x] `UI /fund-model-results/:fundId/scenarios` — fund_modeling /
      not_exportable.
- [x] `UI /fund-model-results/:fundId/moic-analysis` — moic_reserves /
      not_exportable.
- [x] `UI /fund-model-results/:fundId/reports` — lp_reporting / not_exportable.
- [x] `UI /fund-model-results/:fundId/internal-analysis` — fund_modeling /
      not_exportable.
- [x] `UI /fund-model-results/:fundId/analysis` — fund_modeling /
      not_exportable.
- [x] `UI /fund-model-results/:fundId` — fund_modeling / not_exportable.
- [x] `UI /sensitivity-analysis` — fund_modeling / not_exportable.
- [x] `UI /reports` — export_artifact / qualified_exportable.
- [x] `UI /variance-tracking` — fund_modeling / not_exportable.
- [x] `UI /pipeline` — portfolio_management / not_exportable.
- [x] `UI /lp-reporting/ledger` — lp_reporting / not_exportable.
- [x] `UI /lp-reporting/valuations` — lp_reporting / not_exportable.
- [x] `UI /lp-reporting/metrics` — lp_reporting / not_exportable.
- [x] `UI /lp-reporting/imports` — lp_reporting / not_exportable.
- [x] `UI /lp/dashboard` — lp_reporting / not_exportable.
- [x] `UI /lp/fund-detail/:fundId` — lp_reporting / not_exportable.
- [x] `UI /lp/capital-account` — lp_reporting / not_exportable.
- [x] `UI /lp/performance` — lp_reporting / not_exportable.
- [x] `UI /lp/reports` — lp_reporting / qualified_exportable.
- [x] `UI /lp/settings` — lp_reporting / not_exportable.
- [x] `POST /api/portfolio/strategies` — portfolio_management / not_exportable.
- [x] `GET /api/portfolio/strategies/:fundId` — portfolio_management /
      not_exportable.
- [x] `PUT /api/portfolio/strategies/:id` — portfolio_management /
      not_exportable.
- [x] `DELETE /api/portfolio/strategies/:id` — portfolio_management /
      not_exportable.
- [x] `POST /api/portfolio/scenarios` — fund_modeling / not_exportable.
- [x] `GET /api/portfolio/scenarios/:fundId` — fund_modeling / not_exportable.
- [x] `POST /api/portfolio/scenarios/compare` — fund_modeling / not_exportable.
- [x] `POST /api/portfolio/scenarios/:id/simulate` — fund_modeling /
      not_exportable.
- [x] `POST /api/portfolio/reserves/optimize` — moic_reserves / not_exportable.
- [x] `GET /api/portfolio/reserves/strategies/:fundId` — moic_reserves /
      not_exportable.
- [x] `POST /api/portfolio/reserves/backtest` — moic_reserves / not_exportable.
- [x] `POST /api/portfolio/forecasts` — fund_modeling / not_exportable.
- [x] `GET /api/portfolio/forecasts/:scenarioId` — fund_modeling /
      not_exportable.
- [x] `POST /api/portfolio/forecasts/validate` — fund_modeling / not_exportable.
- [x] `GET /api/portfolio/templates` — portfolio_management / preview_only.
- [x] `POST /api/portfolio/quick-scenario` — portfolio_management /
      not_exportable.
- [x] `GET /api/portfolio/metrics/:scenarioId` — moic_reserves / not_exportable.
- [x] `POST /api/portfolio-companies` — portfolio_management / not_exportable.
- [x] `PATCH /api/portfolio-companies/:id` — portfolio_management /
      not_exportable.
- [x] `PUT /api/lp/settings` — lp_reporting / not_exportable.
- [x] `GET /api/funds/:fundId/moic/rankings` — moic_reserves / not_exportable.
- [x] `GET /api/funds/:fundId/moic/marginal-rankings` — moic_reserves /
      not_exportable.
- [x] `POST /api/funds/:fundId/moic/reserve-intelligence/runs` — moic_reserves /
      not_exportable.
- [x] `GET /api/funds/:fundId/moic/reserve-intelligence/latest` — moic_reserves
      / not_exportable.
- [x] `GET /api/funds/:fundId/moic/reserve-intelligence/runs/:snapshotId` —
      moic_reserves / not_exportable.
- [x] `GET /api/portfolio-overview` — portfolio_management / not_exportable.
- [x] `GET /api/funds/:fundId/actuals/facts` — fund_modeling / not_exportable.
- [x] `GET /api/funds/:fundId/financial-facts/latest` — fund_modeling /
      not_exportable.
- [x] `GET /api/funds/:fundId/current-plan-versions` — fund_modeling /
      not_exportable.
- [x] `POST /api/funds/:fundId/current-plan-versions` — fund_modeling /
      not_exportable.
- [x] `POST /api/funds/:fundId/current-forecast/runs` — fund_modeling /
      not_exportable.
- [x] `GET /api/companies/:companyId/scenarios` — fund_modeling /
      not_exportable.
- [x] `POST /api/funds/:fundId/scenario-analysis/scenarios/:scenarioId/cases/from-seed`
      — fund_modeling / not_exportable.
- [x] `POST /api/funds/:fundId/metric-runs/dry-run` — lp_reporting /
      preview_only.
- [x] `POST /api/funds/:fundId/metric-runs/commit` — lp_reporting /
      not_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/latest` — lp_reporting /
      not_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId` — lp_reporting /
      not_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId/report-package` —
      lp_reporting / not_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId/evidence-records` —
      lp_reporting / not_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs` —
      lp_reporting / not_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId`
      — lp_reporting / not_exportable.
- [x] `POST /api/funds/:fundId/metric-runs/:metricRunId/approve` — lp_reporting
      / not_exportable.
- [x] `POST /api/funds/:fundId/metric-runs/:metricRunId/lock` — lp_reporting /
      not_exportable.
- [x] `POST /api/funds/:fundId/metric-runs/:metricRunId/report-package` —
      lp_reporting / not_exportable.
- [x] `POST /api/funds/:fundId/metric-runs/:metricRunId/evidence-records` —
      lp_reporting / not_exportable.
- [x] `POST /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs` —
      lp_reporting / not_exportable.
- [x] `PATCH /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId`
      — lp_reporting / not_exportable.
- [x] `POST /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/review`
      — lp_reporting / not_exportable.
- [x] `POST /api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/approve`
      — lp_reporting / not_exportable.
- [x] `POST /api/funds/:fundId/imports/ledger/dry-run` — lp_reporting /
      preview_only.
- [x] `POST /api/funds/:fundId/imports/valuation-marks/dry-run` — lp_reporting /
      preview_only.
- [x] `POST /api/funds/:fundId/imports/ledger/commit` — lp_reporting /
      not_exportable.
- [x] `POST /api/funds/:fundId/imports/valuation-marks/commit` — lp_reporting /
      not_exportable.
- [x] `POST /api/funds/:fundId/imports/artifacts` — lp_reporting /
      not_exportable.
- [x] `POST /api/funds/:fundId/imports/mapping-profiles` — lp_reporting /
      not_exportable.
- [x] `POST /api/funds/:fundId/imports/batches` — lp_reporting / not_exportable.
- [x] `GET /api/funds/:fundId/imports/batches/:batchId` — lp_reporting /
      not_exportable.
- [x] `GET /api/funds/:fundId/reconciliation/cases` — lp_reporting /
      not_exportable.
- [x] `POST /api/funds/:fundId/reconciliation/cases/:caseId/resolve` —
      lp_reporting / not_exportable.
- [x] `POST /api/funds/:fundId/reconciliation/cases/bulk-resolve` — lp_reporting
      / not_exportable.
- [x] `POST /api/funds/:fundId/imports/batches/:batchId/commit` — lp_reporting /
      not_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model`
      — lp_reporting / qualified_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/export/json`
      — lp_reporting / qualified_exportable.
- [x] `POST /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json`
      — lp_reporting / qualified_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json`
      — lp_reporting / not_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json/artifact`
      — lp_reporting / qualified_exportable.
- [x] `POST /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv`
      — lp_reporting / qualified_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv`
      — lp_reporting / not_exportable.
- [x] `GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv/artifact`
      — lp_reporting / qualified_exportable.
- [x] `PUT /api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId`
      — moic_reserves / not_exportable.
- [x] `PUT /api/admin/funds/:fundId/calculation-modes/fund-moic-rankings` —
      moic_reserves / not_exportable.
- [x] `PUT /api/admin/funds/:fundId/calculation-modes/current-forecast` —
      moic_reserves / not_exportable.
- [x] `POST /api/admin/funds/:fundId/calculation-modes/current-forecast/resume`
      — moic_reserves / not_exportable.
- [x] `POST /api/admin/funds/:fundId/current-forecast/references` —
      moic_reserves / not_exportable.
- [x] `POST /api/admin/funds/:fundId/current-forecast/activate` — moic_reserves
      / not_exportable.
- [x] `POST /api/funds/:fundId/investment-ledger/financing-events` —
      portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/investment-ledger/financing-events/:eventId/tranches`
      — portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/investment-ledger/tranches/:trancheId/corrections`
      — portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/investment-ledger/tranches/:trancheId/participations`
      — portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/investment-ledger/tranches/:trancheId/ledger-corrections`
      — portfolio_management / not_exportable.
- [x] `GET /api/funds/:fundId/investment-ledger/financing-events/:eventId` —
      portfolio_management / not_exportable.
- [x] `GET /api/funds/:fundId/investment-ledger/positions` —
      portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/investment-ledger/position-events` —
      portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/investment-ledger/position-conversions` —
      portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/investment-ledger/position-corrections` —
      portfolio_management / not_exportable.
- [x] `GET /api/funds/:fundId/investment-ledger/ownership-snapshots` —
      portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/investment-ledger/ownership-snapshots` —
      portfolio_management / not_exportable.
- [x] `GET /api/funds/:fundId/investment-ledger/position-valuations` —
      portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/investment-ledger/position-valuations` —
      portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/internal-economics/runs` — fund_modeling /
      not_exportable.
- [x] `GET /api/funds/:fundId/internal-economics/runs/:runId` — fund_modeling /
      not_exportable.
- [x] `GET /api/funds/:fundId/internal-analysis/drafts` — fund_modeling /
      not_exportable.
- [x] `GET /api/funds/:fundId/internal-analysis/drafts/:draftId` — fund_modeling
      / not_exportable.
- [x] `GET /api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review`
      — fund_modeling / not_exportable.
- [x] `PATCH /api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review/companies/:companyId/items/:category`
      — fund_modeling / not_exportable.
- [x] `POST /api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review/companies/:companyId/waiver`
      — fund_modeling / not_exportable.
- [x] `POST /api/funds/:fundId/internal-analysis/drafts` — fund_modeling /
      not_exportable.
- [x] `PATCH /api/funds/:fundId/internal-analysis/drafts/:draftId/economics-reference`
      — fund_modeling / not_exportable.
- [x] `POST /api/funds/:fundId/internal-analysis/drafts/:draftId/refresh` —
      fund_modeling / not_exportable.
- [x] `POST /api/funds/:fundId/internal-analysis/drafts/:draftId/save` —
      fund_modeling / not_exportable.
- [x] `GET /api/funds/:fundId/internal-analysis/references` — fund_modeling /
      not_exportable.
- [x] `GET /api/funds/:fundId/internal-analysis/references/:referenceId` —
      fund_modeling / not_exportable.
- [x] `POST /api/funds/:fundId/internal-analysis/references/:referenceId/drafts`
      — fund_modeling / not_exportable.
- [x] `POST /api/admin/funds/:fundId/internal-analysis/quarterly-draft-run` —
      fund_modeling / not_exportable.
- [x] `GET /api/funds/:fundId/kpi-observations` — portfolio_management /
      not_exportable.
- [x] `GET /api/funds/:fundId/kpi-observations/:observationId` —
      portfolio_management / not_exportable.
- [x] `POST /api/funds/:fundId/kpi-observations` — portfolio_management /
      not_exportable.
- [x] `POST /api/funds/:fundId/kpi-observations/imports` — portfolio_management
      / not_exportable.
- [x] `PATCH /api/funds/:fundId/kpi-observations/:observationId/review` —
      portfolio_management / not_exportable.
- [x] `GET /api/funds/:fundId/internal-analysis/narratives` — fund_modeling /
      not_exportable.
- [x] `POST /api/funds/:fundId/internal-analysis/narratives/generate` —
      fund_modeling / not_exportable.
- [x] `POST /api/funds/:fundId/internal-analysis/narratives/revise` —
      fund_modeling / not_exportable.
- [x] `GET /api/funds/:fundId/internal-analysis/notes` — fund_modeling /
      not_exportable.
- [x] `POST /api/funds/:fundId/internal-analysis/notes` — fund_modeling /
      not_exportable.

## Concrete governed query sites

- [x] `server/routes/funds.ts` — cross-fund fund-list read; fund-id detail read
      remains direct.
- [x] `server/routes/lp-capital-calls.ts` — LP capital-call list/detail reads.
- [x] `server/routes/lp-distributions.ts` — LP distribution
      list/summary/tax/detail reads.
- [x] `server/routes/lp-documents.ts` — LP document list/search/detail/download
      reads.
- [x] `server/services/internal-analysis/analysis-checkpoint-service.ts` —
      active-fund enumeration.
- [x] `server/services/lp-calculator.ts` — LP commitment, account, and
      performance aggregations.
- [x] `server/services/lp-queries.ts` — LP fund-name and fund-performance reads.
- [x] `server/services/pdf-generation/data-fetchers.ts` — LP report commitment
      reads.
- [x] `server/routes/lp-api.ts` — LP benchmark commitment selection.
- [x] `server/services/time-travel-analytics.ts` — cross-fund latest-event read.
- [x] `server/storage.ts` — shared cross-fund fund-list/health read.

## Boundary decisions

- [x] Fund-scoped dashboard, portfolio overview, portfolio-company, fund,
      current-forecast, and metrics reads reviewed; no predicate added because
      authorized smoke-principal detail visibility is required.
- [x] Mutation-only, worker-calculation, and persistence paths reviewed;
      excluded from reporting worklist.

## Serving-seam consumer review

- [x] `server/routes/dual-forecast.ts` — fund-scoped current-forecast read;
      direct authorized visibility retained.
- [x] `server/routes/fund-metrics.ts` — fund-scoped metrics read; direct
      authorized visibility retained.
- [x] `server/services/current-forecast-serving-seam.ts` — facade only; callers
      remain fund-scoped.
- [x] `server/services/metrics-aggregator.ts` — fund-scoped aggregation; direct
      authorized visibility retained.
- [x] `server/services/h9-artifact-invalidation-service.ts` — cache invalidation
      only; no reporting rows read.

The query-site files above are the governed-reporting glob enforced by
`scripts/guardrails/check-canary-exclusion.mjs`. Each query joining or resolving
a fund in these sites uses `productionFundPredicate()`; direct fund-scoped reads
remain intentionally visible to an authorized canary principal.

## Canary mutation boundary

Canary creation is the sole canary-principal mutation in this phase. Its
fail-closed residue preflight is serialized and runs before the transaction's
first mutation. Per-mutation caps for later governed smoke mutations belong to
the G4 canary-runner implementation; this phase does not pretend its creation
preflight covers those future mutation paths. Terminal canary-run transitions
reconcile dedicated residue counts before status changes, and purge planning
reconciles expired runs inside its dry-run/execute transaction.
