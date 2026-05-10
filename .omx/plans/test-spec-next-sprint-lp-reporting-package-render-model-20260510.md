---
status: APPROVED
created: 2026-05-10
workflow: ralplan
scope: next sprint
context: .omx/context/next-priority-sprint-lp-reporting-render-model-20260510T124618Z.md
prd: .omx/plans/prd-next-sprint-lp-reporting-package-render-model-20260510.md
---

# Test Spec: LP Reporting Package Render Model Foundation

## Verification Principle

Tests must prove that the new render model is a deterministic read model over
an assembled report package, not a nullable package viewer, export lifecycle, or
thin wrapper around legacy LP-profile report generation.

## Contract Tests

Create:

`tests/unit/contract/lp-reporting/lp-report-package-render-model.contract.test.ts`

Coverage:

- `ReportPackageRenderModelResponseSchema` parses:
  `{ renderModel: ReportPackageRenderModel }`.
- `ReportPackageRenderModelSchema` requires `renderModelVersion: 1`.
- `source` requires:
  - `reportPackageId`
  - `fundId`
  - `metricRunId`
  - `reportPackageStatus: 'assembled'`
  - `asOfDate`
  - `metricRunVersion`
  - `metricRunLockedBy`
  - `metricRunLockedAt`
  - `assembledBy`
  - `assembledAt`
  - `packageVersion`
  - `payloadVersion: 1`
- `fundDisplay` requires:
  - `fundId`
  - `name`
  - `vintageYear`
  - `size`
- `metricSections` accepts only the explicit metric section IDs:
  `performance`, `capital`, and `mark_confidence`.
- Metric rows accept only the explicit metric IDs and value kinds planned in
  the PRD.
- `narrativeSections` accepts only:
  `no_dpi`, `methodology`, `portfolio_update`, and `risk_disclosure`.
- `diagnostics` includes engine version, decimal precision, warning rows,
  excluded future marks, and net/gross XIRR diagnostics.
- `references` includes source event IDs, source mark IDs, evidence record IDs,
  and narrative run IDs.
- Unknown fields are rejected at every object boundary.
- The render model is not interchangeable with `ReportPackageRecordSchema`;
  parsing a package record as a render model fails.
- The response cannot be nullable; `{ renderModel: null }` and
  `{ record: null }` fail.
- No URL, file, download, export, queue, storage, or signed-link fields are
  accepted.

## Service Tests

Create:

`tests/unit/services/lp-reporting/report-package-render-model-service.test.ts`

Coverage:

### Successful Mapping

- A route-scoped assembled package maps to a contract-valid render model.
- The service loads fund display metadata server-side from `funds` and exposes
  `fundDisplay.name`, `fundDisplay.vintageYear`, and `fundDisplay.size`.
- The service uses package payload metric results and diagnostics, not live
  metric-run recalculation.
- `source` audit/version fields mirror the package record.
- `metricSections` are exactly ordered:
  `performance`, `capital`, `mark_confidence`.
- `performance` rows are exactly ordered:
  `dpi`, `rvpi`, `tvpi`, `moic`, `netIrr`, `grossIrr`.
- `capital` rows are exactly ordered:
  `contributionsTotal`, `distributionsTotal`, `currentNav`.
- `mark_confidence` rows are exactly ordered:
  `markConfidenceHigh`, `markConfidenceMedium`, `markConfidenceLow`.
- Narrative payload rows are re-sorted to canonical narrative order:
  `no_dpi`, `methodology`, `portfolio_update`, `risk_disclosure`, even when the
  package payload stores them out of order.
- `references` arrays are sorted ascending even when a test-created package
  payload stores them out of order.
- Returned output parses through
  `ReportPackageRenderModelResponseSchema`.

### Read-Only Behavior

- The service performs no inserts, updates, deletes, row locks, transaction
  writes, status changes, or timestamp writes.
- It does not modify the in-memory package row, metric-run row, narrative rows,
  or fund row used by the test database.
- It does not call report generation queues, PDF/XLSX services, storage
  services, or legacy LP report data fetchers.

### Error Behavior

- Missing metric run or wrong fund/metric-run scope returns 404
  `METRIC_RUN_NOT_FOUND`.
- Existing metric run with no report package returns 404
  `REPORT_PACKAGE_NOT_FOUND`.
- Missing fund display row returns a stable 404 error, preferably
  `FUND_NOT_FOUND`.
- Invalid package payload returns a stable 500
  `REPORT_PACKAGE_PAYLOAD_INVALID` or existing row-invalid error.
- Invalid persisted package metadata returns a stable 500
  `REPORT_PACKAGE_ROW_INVALID`.

## Route Tests

Extend:

`tests/unit/routes/lp-reporting/metric-runs-routes.test.ts`

Coverage:

- Add the exact GET route:
  `/api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model`.
- Route requires authentication, fund access, and the existing metric-run rate
  limiter.
- Invalid `fundId` and `metricRunId` preserve existing parse errors.
- Missing package returns status 404 and error
  `REPORT_PACKAGE_NOT_FOUND`.
- Assembled package returns status 200 and a response that parses through
  `ReportPackageRenderModelResponseSchema`.
- Response includes server-side fund display metadata from the mocked `funds`
  table.
- Route validates service output through the shared response schema.
- Existing nullable package endpoint remains unchanged:
  `GET .../report-package` still returns `200 { record: null }` before
  assembly.
- The route inventory/source guard is updated to include the new GET route and
  does not add any POST/export/download routes.

## Hook Tests

Extend:

`tests/unit/hooks/lp-reporting/useMetricsDryRun.test.tsx`

Coverage:

- Add `useMetricRunReportPackageRenderModel`.
- Hook is disabled without `fundId` or `metricRunId`.
- Hook calls exactly:
  `/api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model`.
- Hook parses `ReportPackageRenderModelResponseSchema`.
- Hook preserves server error codes, especially `REPORT_PACKAGE_NOT_FOUND`.
- Successful package assembly invalidates both:
  - `['lp-reporting', 'metric-run-report-package', fundId, metricRunId]`
  - `['lp-reporting', 'metric-run-report-package-render-model', fundId, metricRunId]`
- Hook does not import or call `client/src/hooks/useLPReports.ts`.

## Page Tests

Extend:

`tests/unit/pages/lp-reporting/metrics.test.tsx`

Coverage:

- Before package assembly, the existing package readiness/assemble UI remains
  unchanged and the render preview is absent.
- After package assembly exists, the page requests the render-model endpoint.
- Render preview shows fund display name, as-of date, package ID, key metric
  section labels, diagnostics warning count, and ordered narrative section
  labels.
- If render model returns 404 `REPORT_PACKAGE_NOT_FOUND`, the package assembly
  card remains usable and the preview is hidden or shows a non-blocking internal
  unavailable state.
- Render-model server errors use the existing LP Reporting error-envelope
  pattern.
- No PDF, XLSX, CSV, JSON export, download, share, public link, email,
  comments, attachments, AI, or LP portal controls appear.
- No `/lp-reporting/reports` route or navigation copy appears.

## Source Guard Tests

Extend:

`tests/unit/source/lp-reporting-report-package-source-guards.test.ts`

Coverage:

- `server/services/lp-reporting/report-package-service.ts` remains free of
  export lifecycle mutations such as `exportedAt`, `status: 'exported'`, and
  export-status writes.
- The new render-model service does not import:
  - `server/queues/report-generation-queue`
  - `server/services/pdf-generation-service`
  - `server/services/xlsx-generation-service`
  - `server/routes/lp-api`
  - storage service modules
- The new metric-run render-model route does not call legacy LP report
  generation handlers or queues.
- `client/src/hooks/lp-reporting/useMetricsDryRun.ts` does not import
  `client/src/hooks/useLPReports.ts`.
- `client/src/pages/lp-reporting/metrics.tsx` does not import
  `client/src/hooks/useLPReports.ts`.
- `client/src/App.tsx` and `client/src/config/navigation.ts` still do not add
  `/lp-reporting/reports`.
- `package.json` has no new dependencies for this sprint.

## Suggested Verification Commands

Run targeted tests first:

```powershell
npm test -- --run tests/unit/contract/lp-reporting/lp-report-package-render-model.contract.test.ts
npm test -- --run tests/unit/services/lp-reporting/report-package-render-model-service.test.ts
npm test -- --run tests/unit/routes/lp-reporting/metric-runs-routes.test.ts
npm test -- --run tests/unit/hooks/lp-reporting/useMetricsDryRun.test.tsx
npm test -- --run tests/unit/pages/lp-reporting/metrics.test.tsx
npm test -- --run tests/unit/source/lp-reporting-report-package-source-guards.test.ts
npm run check
npm run lint
npm run build
```

Run full `npm test` before push if route test infrastructure, shared fixtures,
or contract barrels change in a way that affects broader suites.
