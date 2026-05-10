---
status: APPROVED
created: 2026-05-10
workflow: ralplan
task: next priority sprint
---

# RALPLAN Final: LP Reporting Package Render Model Foundation

## Consensus Result

Proceed with a narrow render-model foundation sprint:

`assembled report package -> strict package render model -> Metrics-page preview`

This is the next priority after approved report assembly because it advances LP
Reporting toward deliverable reports while preserving the boundary that file
generation, downloads, public sharing, and LP portal delivery remain out of
scope.

## Final Decision

Build a read-only, metric-run-scoped render model for assembled packages.

- Add a strict versioned render-model contract separate from
  `ReportPackageRecordSchema`.
- Add `GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model`.
- Return non-null `{ renderModel }` on success.
- Return 404 `REPORT_PACKAGE_NOT_FOUND` when the metric run exists but no
  package has been assembled.
- Resolve `fundDisplay` server-side from `funds`, but do not persist it into
  package payloads.
- Construct deterministic metric sections, narrative sections, diagnostics, and
  references from the immutable package payload.
- Add a compact preview inside the existing LP Reporting Metrics page package
  area.
- Do not integrate legacy LP-profile report generation or any export/delivery
  lifecycle.

## ADR

### Decision

Introduce a renderer-facing package render model as the first export-adjacent
step after report-package assembly.

### Drivers

- `DECISIONS.md` ADR-017 chooses a unified report data model before
  format-specific export work.
- Current package assembly is intentionally internal and assembled-only.
- Future renderers need stable section structure, fund headings, diagnostics,
  and provenance without reading raw package payload shape directly.
- Metrics already owns the package prerequisite flow, so a narrow preview there
  validates the model without adding a reports surface.

### Alternatives Considered

- API-only render model: rejected because it would not validate the contract in
  the actual GP workflow.
- Full PDF/download sprint: rejected because it starts delivery before the
  render contract is stable.
- Reuse legacy `POST /api/lp/reports/generate`: rejected because it is
  LP-profile scoped and not built on locked metric-run packages.
- Wrap `ReportPackageRecord` as the render response: rejected because it exposes
  assembly internals instead of a renderer-facing document model.

### Consequences

- The next implementation adds contracts, one read-only service, one GET route,
  one hook, a compact UI preview, and source guards.
- Later PDF/XLSX/CSV/JSON export work can consume the render model without
  re-deriving package semantics.
- The distinction between nullable package discovery and non-null render model
  retrieval must remain explicit.

## Approved Artifacts

- Context snapshot:
  `.omx/context/next-priority-sprint-lp-reporting-render-model-20260510T124618Z.md`
- PRD:
  `.omx/plans/prd-next-sprint-lp-reporting-package-render-model-20260510.md`
- Test spec:
  `.omx/plans/test-spec-next-sprint-lp-reporting-package-render-model-20260510.md`

## Review Evidence

- Planner approved the render-model foundation over API-only and full export
  options.
- Architect first returned `ITERATE`, requiring:
  - strict versioned render-model shape;
  - non-null 404 missing-package semantics;
  - server-side fund display metadata;
  - deterministic section/reference ordering; and
  - source guards against legacy export coupling.
- The PRD and test spec were revised to include `renderModelVersion`, `source`,
  `fundDisplay`, ordered `metricSections`, ordered `narrativeSections`,
  diagnostics, sorted `references`, and explicit legacy-export guard tests.
- Architect re-reviewed and returned `APPROVE`.
- Critic returned `APPROVE` with watch-items only.

## Available Agent Types

- `planner`: sequencing, acceptance criteria, sprint boundary review.
- `architect`: contract shape, route semantics, data model and boundary review.
- `executor`: implementation across contracts, service, routes, hooks, and UI.
- `test-engineer`: contract/service/route/hook/page/source guard coverage.
- `verifier`: final evidence, non-goal verification, and quality gate summary.
- `code-reviewer`: post-implementation correctness and regression review.

## Recommended Ralph Handoff

Use single-owner Ralph execution because this is one coherent vertical slice
with a tight contract boundary:

```text
$ralph .omx/plans/prd-next-sprint-lp-reporting-package-render-model-20260510.md .omx/plans/test-spec-next-sprint-lp-reporting-package-render-model-20260510.md
```

Suggested sequence:

1. Contract and service with contract/service tests first.
2. Route and hook wiring with route/hook tests.
3. Metrics-page preview and source guards.
4. Targeted verification plus `npm run check`, `npm run lint`, and
   `npm run build`.

## Recommended Team Handoff

Use team mode only if parallel execution is needed after the contract lands:

```text
$team execute LP Reporting package render model using .omx/plans/prd-next-sprint-lp-reporting-package-render-model-20260510.md and .omx/plans/test-spec-next-sprint-lp-reporting-package-render-model-20260510.md
```

Suggested lanes:

- Executor A: render-model contract and service tests.
- Executor B: service implementation and route after contract settles.
- Executor C: hook and Metrics-page preview after route contract settles.
- Test engineer: source guards and focused regression suite.
- Verifier: final evidence and non-goal checks.

Keep write scopes disjoint; do not let UI work invent response shapes before
the shared contract lands.

## Verification Path

Run focused tests first:

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

## Guardrails For Execution

- Do not add PDF, XLSX, CSV, or JSON file generation.
- Do not add download, public link, email, LP portal delivery, or external
  sharing controls.
- Do not add export queue jobs, storage keys, signed URLs, or report files.
- Do not mutate `lp_report_packages`, locked metric runs, approved narratives,
  `exportedAt`, or any `exported` status.
- Do not add `/lp-reporting/reports` route or navigation.
- Do not call or import legacy `server/queues/report-generation-queue.ts`,
  `server/services/pdf-generation-service.ts`,
  `server/services/xlsx-generation-service.ts`, `server/routes/lp-api.ts`, or
  `client/src/hooks/useLPReports.ts` from the new render-model path.
- Keep `report-package-service.ts` assembly-only.
- Keep the new render-model endpoint non-null on success and 404 on missing
  package.
- No new dependencies.
