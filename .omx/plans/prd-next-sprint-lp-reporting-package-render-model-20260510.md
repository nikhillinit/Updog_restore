---
status: APPROVED
created: 2026-05-10
workflow: ralplan
scope: next sprint
context: .omx/context/next-priority-sprint-lp-reporting-render-model-20260510T124618Z.md
---

# PRD: LP Reporting Package Render Model Foundation

## Problem

LP Reporting can now assemble a durable internal report package from a locked
metric run and approved narratives. The next gap is not PDF delivery yet; it is
a stable renderer-facing model that every future PDF/XLSX/CSV/JSON or preview
surface can consume without re-deriving package semantics from raw payloads.

Without this layer, the first export sprint will either couple directly to the
assembly service, reuse legacy LP-profile report generation paths that do not
understand locked metric runs, or let each renderer invent its own mapping.

## Users

- Internal GP/operator users working from the existing LP Reporting Metrics
  page.
- Future renderer/export jobs that need a deterministic document model sourced
  from the assembled package.
- Developers who need a strict contract between package assembly and later file
  generation.

## Goals

- Convert one assembled report package into a strict, deterministic render
  model.
- Keep package assembly and render preparation as separate service boundaries.
- Expose the render model through a read-only, metric-run-scoped endpoint.
- Add a compact Metrics-page preview that proves the model shape with real UI
  rendering.
- Preserve all current package assembly behavior and non-export guardrails.

## Non-Goals

- No PDF, XLSX, CSV, or JSON file generation.
- No download, public link, email delivery, LP portal delivery, or external
  sharing.
- No export queue job, report-generation worker, or legacy
  `POST /api/lp/reports/generate` integration.
- No mutation of `lp_report_packages`, locked metric runs, approved narratives,
  `exportedAt`, or any `exported` status.
- No standalone `/lp-reporting/reports` route or navigation item.
- No report library, report history, report superseding, report reassembly, or
  delivery lifecycle.
- No AI generation, narrative rewriting, comments, assignments, notifications,
  or attachments.
- No new dependencies.

## Product Rules

- Render-model generation requires an existing assembled report package for the
  route-scoped fund and metric run.
- The render model is derived from `ReportPackageRecord.payload`; it does not
  change the package row or source rows.
- The route owns `fundId` and `metricRunId`; the client does not submit any
  package, fund, user, audit, status, or export fields.
- The render model is deterministic for the same package record.
- The render model should use the package's immutable snapshot fields instead
  of live narrative or metric-run rows whenever possible.
- Fund display metadata is resolved server-side from the current `funds` row
  and is not persisted into the immutable package payload.
- Metric sections and narrative sections use explicit, contract-defined order;
  construction must not rely on object key traversal or persisted JSON order.
- Package assembly remains unchanged and remains the only operation that writes
  to `lp_report_packages`.

## Data Model

No migration is required.

Add a render-model contract under LP Reporting contracts. Suggested file:

`shared/contracts/lp-reporting/lp-report-package-render-model.contract.ts`

Top-level response:

```ts
{
  renderModel: ReportPackageRenderModel;
}
```

Render model:

```ts
{
  renderModelVersion: 1;
  source: {
    reportPackageId: positiveInteger;
    fundId: positiveInteger;
    metricRunId: positiveInteger;
    reportPackageStatus: 'assembled';
    asOfDate: dateString;
    metricRunVersion: positiveInteger;
    assembledBy: positiveInteger;
    assembledAt: dateTimeString;
    metricRunLockedBy: positiveInteger | null;
    metricRunLockedAt: dateTimeString | null;
    packageVersion: positiveInteger;
    payloadVersion: 1;
  };
  fundDisplay: {
    fundId: positiveInteger;
    name: string;
    vintageYear: positiveInteger | null;
    size: decimalString | null;
  };
  metricSections: Array<{
    sectionId: 'performance' | 'capital' | 'mark_confidence';
    title: string;
    rows: Array<{
      metricId:
        | 'dpi'
        | 'rvpi'
        | 'tvpi'
        | 'moic'
        | 'netIrr'
        | 'grossIrr'
        | 'contributionsTotal'
        | 'distributionsTotal'
        | 'currentNav'
        | 'markConfidenceHigh'
        | 'markConfidenceMedium'
        | 'markConfidenceLow';
      label: string;
      value: decimalString | nonnegativeInteger | null;
      valueKind: 'multiple' | 'irr' | 'money' | 'count';
      currency: 'USD' | null;
    }>;
  }>;
  narrativeSections: Array<{
    sectionId:
      | 'no_dpi'
      | 'methodology'
      | 'portfolio_update'
      | 'risk_disclosure';
    title: string;
    narrativeType: NarrativeType;
    narrativeRunId: positiveInteger;
    narrativeVersion: positiveInteger;
    approvedBy: positiveInteger | null;
    approvedAt: dateTimeString;
    textHash: sha256Hex;
    body: string;
  }>;
  diagnostics: {
    engineVersion: string;
    decimalPrecision: positiveInteger;
    excludedFutureMarks: positiveInteger[];
    warnings: Array<{ code: string; message: string }>;
    xirr: {
      net: XirrDiagnostic;
      gross: XirrDiagnostic;
    };
  };
  references: {
    sourceEventIds: positiveInteger[];
    sourceMarkIds: positiveInteger[];
    evidenceRecordIds: positiveInteger[];
    narrativeRunIds: positiveInteger[];
  };
}
```

Notes:

- `fundDisplay` must be resolved server-side from `funds` so internal previews
  and future server-side renderers use the same headings.
- `metricSections` order is exactly:
  `performance`, `capital`, `mark_confidence`.
- `performance` row order is exactly:
  `dpi`, `rvpi`, `tvpi`, `moic`, `netIrr`, `grossIrr`.
- `capital` row order is exactly:
  `contributionsTotal`, `distributionsTotal`, `currentNav`.
- `mark_confidence` row order is exactly:
  `markConfidenceHigh`, `markConfidenceMedium`, `markConfidenceLow`.
- `narrativeSections` order is the existing canonical narrative order:
  `no_dpi`, `methodology`, `portfolio_update`, `risk_disclosure`.
- `references` arrays are normalized to ascending numeric order.
- Keep file-renderer hints, layout metadata, export format names, signed URLs,
  storage keys, and queue IDs out of this model.

## API Scope

### Get Report Package Render Model

`GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model`

Response:

```ts
{
  renderModel: ReportPackageRenderModel;
}
```

Rules:

- Require existing auth, fund access, and metric-run route rate limiting.
- Return 404 `REPORT_PACKAGE_NOT_FOUND` when no assembled package exists for
  the route-scoped metric run.
- Return 404 for wrong fund or metric-run scope.
- Validate the service result through the response contract before sending.
- Perform no writes.
- Do not call legacy LP report generation routes, queues, PDF services, XLSX
  services, storage services, or workers.

## Service Scope

Add a read-only service:

`server/services/lp-reporting/report-package-render-model-service.ts`

Responsibilities:

- Load the route-scoped metric run enough to preserve existing 404 behavior.
- Load the assembled report package for `(fundId, metricRunId)`.
- Load server-side fund display metadata from the `funds` row:
  `id`, `name`, `vintageYear`, and `size`.
- Parse the package row through `ReportPackageRecordSchema` and payload through
  `ReportPackagePayloadSchema`.
- Map metric results into explicit metric sections and row order.
- Map narrative payload rows into the canonical narrative section order,
  independent of persisted JSON order.
- Map diagnostics and evidence/source references into explicit render-model
  fields.
- Normalize reference ID arrays to ascending numeric order.
- Return a contract-validated response.

Explicit non-responsibilities:

- No inserts, updates, deletes, row locks, transactions, or status changes.
- No export job creation.
- No storage key or signed URL generation.
- No live narrative text reloads.
- No legacy LP-profile report data fetches.
- No imports or calls to `server/queues/report-generation-queue.ts`,
  `server/services/pdf-generation-service.ts`,
  `server/services/xlsx-generation-service.ts`, `server/routes/lp-api.ts`, or
  `client/src/hooks/useLPReports.ts`.

## UX Scope

Extend `client/src/pages/lp-reporting/metrics.tsx`.

- Show a compact render preview only when a report package exists.
- The preview belongs inside or directly under the current "Approved report
  package" card.
- Show fund display name, as-of date, key metric sections, diagnostics warning
  count, and ordered narrative section titles.
- Render narrative body snippets or full text in a compact internal-preview
  style; do not add print/export/download controls.
- Render not-found/no-package state by hiding the preview while preserving the
  existing package assembly UI.
- Render server errors through the existing LP Reporting error-envelope pattern.

Suggested hook:

- `useMetricRunReportPackageRenderModel(fundId, metricRunId)`

Suggested query key:

- `['lp-reporting', 'metric-run-report-package-render-model', fundId, metricRunId]`

## Acceptance Criteria

- An assembled package produces a strict, deterministic render model through the
  metric-run-scoped GET endpoint.
- A missing package returns a stable 404 `REPORT_PACKAGE_NOT_FOUND`.
- The render model includes source metadata, server-side fund display metadata,
  explicit metric sections, diagnostics, all approved narrative sections, and
  source/evidence references.
- Metric sections and narrative sections are stable even when the persisted
  package payload has narratives in a different order.
- Source/evidence reference IDs are stable even when a test-created or legacy
  package payload stores them out of order.
- The service performs no writes and does not mutate package, metric-run, or
  narrative rows.
- Metrics page displays a compact preview after package assembly exists.
- Package assembly tests continue to pass unchanged.
- Source guards prove the sprint does not add export lifecycle, download/share
  controls, `/lp-reporting/reports`, or legacy export infrastructure coupling.

## Risks

- A too-large render model could recreate the raw package payload instead of a
  renderer contract. Mitigation: keep the model sectioned and renderer-facing.
- A fund-name lookup could widen the service scope. Mitigation: read only
  `id`, `name`, `vintageYear`, and `size` from `funds`, and keep those fields
  out of the persisted package payload.
- Naming the model "export" could confuse the lifecycle boundary. Mitigation:
  use "render model" for this sprint.
- Preview work could become report-management UI. Mitigation: keep it on the
  existing Metrics page and assert no standalone reports route/navigation.

## Open Follow-Ups

- Decide whether package-scoped PDF generation should adapt the legacy BullMQ
  report queue or use a new package-scoped job type.
- Decide when to introduce download/public-link/share semantics.
- Decide whether a dedicated LP Reporting Reports page is needed after more
  than one package/export workflow exists.
