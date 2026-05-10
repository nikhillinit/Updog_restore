---
status: DRAFT
created: 2026-05-10
workflow: ralplan
scope: next priority sprint
---

# Context: Next Priority Sprint - LP Reporting Render Model

## Task

Plan the next priority sprint after the merged LP Reporting approved report
assembly work.

## Desired Outcome

Create a consensus-ready sprint plan that advances LP Reporting toward
deliverable reports without prematurely adding PDF generation, downloads,
public sharing, LP portal delivery, or a broad report-management surface.

## Known Facts

- The latest local main history includes:
  - `39917c47 Create durable LP report packages from locked runs`
  - `7f2945b2 Enforce narrative approval before package assembly`
  - `0ce034b6 Create narrative drafts from locked metric runs`
  - `bb76d20c Surface locked metric run evidence snapshots`
- The approved report assembly sprint intentionally stopped at:
  `locked metric run + approved narrative set -> assembled internal package`.
- Current report package contracts live in
  `shared/contracts/lp-reporting/lp-report-package.contract.ts`.
- Current report package service lives in
  `server/services/lp-reporting/report-package-service.ts`.
- Current metric-run-scoped package routes are:
  - `GET /api/funds/:fundId/metric-runs/:metricRunId/report-package`
  - `POST /api/funds/:fundId/metric-runs/:metricRunId/report-package`
- The package payload already includes versioned metric results, diagnostics,
  source IDs, evidence IDs, and approved narrative payload rows.
- Source guard tests intentionally prevent an export lifecycle from being added
  to the package assembly service.
- `DECISIONS.md` ADR-017, "Export Strategy - BullMQ Async Pipeline with
  Unified Data Model", chooses a unified report data model as the first export
  enhancement before progress exposure, JSON/CSV improvements, or larger export
  handling.
- Legacy LP report generation still exists under:
  - `server/queues/report-generation-queue.ts`
  - `server/services/pdf-generation-service.ts`
  - `server/services/xlsx-generation-service.ts`
  - `server/routes/lp-api.ts`
  - `client/src/hooks/useLPReports.ts`
- Legacy export routes are LP-profile scoped and do not yet consume the new
  locked metric-run/report-package foundation.

## Constraints

- Keep the next sprint narrow and reversible.
- No new dependencies.
- Do not mutate locked metric runs, approved narratives, package assembly audit,
  `exportedAt`, or `exported` statuses.
- Do not add PDF/download/share/public-link/email/LP-portal delivery yet.
- Do not add a standalone `/lp-reporting/reports` navigation route unless the
  plan explicitly justifies why the package preview cannot live in the current
  Metrics page.
- Preserve metric-run route ownership for fund and metric-run scope.
- Keep `report-package-service.ts` focused on assembly semantics; add any
  export/render preparation as a separate contract/service boundary.
- Treat report-package payload as immutable source material for the render
  model.

## Unknowns

- Whether the next deliverable should include UI preview only, API render model
  only, or both.
- The exact render model naming: "render model", "export model", or "report
  document model".
- Whether fund display metadata is already available in a stable service for
  report headings, or whether the first version should avoid fund lookups beyond
  IDs and dates.
- Whether later PDF generation should reuse the legacy `lp_reports` queue or
  introduce a package-scoped job type. This sprint should avoid deciding more
  than necessary.

## Likely Touchpoints

- `shared/contracts/lp-reporting/lp-report-package.contract.ts`
- `shared/contracts/lp-reporting/index.ts`
- `server/services/lp-reporting/report-package-render-model-service.ts`
- `server/routes/lp-reporting/metric-runs.ts`
- `client/src/hooks/lp-reporting/useMetricsDryRun.ts`
- `client/src/hooks/lp-reporting/index.ts`
- `client/src/pages/lp-reporting/metrics.tsx`
- `tests/unit/contract/lp-reporting/lp-report-package.contract.test.ts`
- `tests/unit/services/lp-reporting/report-package-render-model-service.test.ts`
- `tests/unit/routes/lp-reporting/metric-runs-routes.test.ts`
- `tests/unit/hooks/lp-reporting/useMetricsDryRun.test.tsx`
- `tests/unit/pages/lp-reporting/metrics.test.tsx`
- `tests/unit/source/lp-reporting-report-package-source-guards.test.ts`

## Planning Hypothesis

The next priority should be an LP Reporting report-package render model
foundation:

`assembled report package -> strict package render model -> Metrics-page preview`

This is the smallest useful step toward PDF/export because it converts the
immutable package into a stable renderer-facing data contract without starting a
delivery lifecycle.
