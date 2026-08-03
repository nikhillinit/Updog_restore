import {
  ROUTE_GOVERNANCE_REGISTRY,
  type RouteGovernanceEntry,
} from '../../shared/routes/route-governance-registry';
import {
  RoutePolicyEntrySchema,
  type FinancialSurface,
  type RoutePolicyEntry,
} from '../../shared/contracts/route-policy.contract';
import { portfolioIntelligenceRouteClassifications } from '../../tests/fixtures/portfolio-intelligence-route-classification';
import type { FinancialCommonApiRouteId } from '../../shared/routes/api-route-manifest';

type PortfolioIntelligenceClassificationEntry =
  (typeof portfolioIntelligenceRouteClassifications)[number];

type RoutePolicyDecision = Pick<
  RoutePolicyEntry,
  | 'lifecycle'
  | 'financialSurface'
  | 'apiAuthBoundary'
  | 'fundScopeMode'
  | 'workflowRequirement'
  | 'exportPolicy'
  | 'provenanceRequired'
  | 'staleBlocksExport'
  | 'humanReviewRequired'
  | 'performanceBudgetMs'
  | 'notes'
>;

type PortfolioIntelligenceRouteDecisionMap = {
  [
    Route in PortfolioIntelligenceClassificationEntry as `${Route['method']} ${Route['path']}`
  ]: RoutePolicyDecision;
};

type PortfolioIntelligenceRouteKey = keyof PortfolioIntelligenceRouteDecisionMap & string;

function telemetryKeyForRoute(prefix: string, path: string): string {
  const normalized = path
    .replace(/^\/+/, '')
    .replace(/[:*]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

  return `${prefix}.${normalized || 'root'}`;
}

export function routePolicyKey(route: Pick<RoutePolicyEntry, 'method' | 'path'>): string {
  return route.method ? `${route.method.toUpperCase()} ${route.path}` : route.path;
}

export function getFinancialSurfaceForGovernanceEntry(
  entry: RouteGovernanceEntry
): FinancialSurface {
  if (
    entry.exposure === 'archived-placeholder' ||
    entry.exposure === 'legacy-redirect' ||
    entry.surface === 'admin-gated'
  ) {
    return 'none';
  }

  if (entry.surface === 'lp-route' || entry.path.startsWith('/lp-reporting')) {
    return 'lp_reporting';
  }

  // Plan 9 Wave 9B1 (D-F.3): the fund-scoped reports destination hosts the LP
  // reporting metrics pipeline, not fund modeling.
  if (entry.path === '/fund-model-results/:fundId/reports') {
    return 'lp_reporting';
  }

  if (entry.path === '/shared/:shareId') {
    return 'lp_reporting';
  }

  if (entry.path === '/reports') {
    return 'export_artifact';
  }

  if (entry.path === '/performance' || entry.path === '/fund-model-results/:fundId/moic-analysis') {
    return 'moic_reserves';
  }

  if (
    entry.path === '/fund-setup' ||
    entry.path === '/financial-modeling' ||
    entry.path === '/forecasting' ||
    entry.path === '/model-results' ||
    entry.path === '/sensitivity-analysis' ||
    entry.path === '/variance-tracking' ||
    entry.path.startsWith('/fund-model-results')
  ) {
    return 'fund_modeling';
  }

  if (
    entry.path === '/dashboard' ||
    entry.path === '/pipeline' ||
    entry.path === '/portfolio' ||
    entry.path.startsWith('/portfolio/')
  ) {
    return 'portfolio_management';
  }

  return 'none';
}

export const ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES = ROUTE_GOVERNANCE_REGISTRY.filter(
  (entry) => getFinancialSurfaceForGovernanceEntry(entry) !== 'none'
);

function ownerForFinancialSurface(surface: FinancialSurface): string {
  switch (surface) {
    case 'lp_reporting':
      return 'lp-reporting';
    case 'moic_reserves':
      return 'analytics';
    case 'export_artifact':
      return 'reporting';
    case 'fund_modeling':
    case 'portfolio_management':
      return 'gp-team';
    case 'none':
      return 'platform';
  }
}

function requireGovernanceEntry(path: string): RouteGovernanceEntry {
  const entry = ROUTE_GOVERNANCE_REGISTRY.find((candidate) => candidate.path === path);
  if (!entry) {
    throw new Error(`Missing governed route reference for route policy: ${path}`);
  }
  return entry;
}

const GOVERNANCE_ROUTE_POLICY_DECISIONS: Readonly<Record<string, RoutePolicyDecision>> = {
  '/shared/:shareId': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'signed_public_share',
    fundScopeMode: 'share_token_scope',
    workflowRequirement: 'share_token_verified',
    exportPolicy: 'preview_only',
    provenanceRequired: false,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/fund-setup': {
    lifecycle: 'durable_crud',
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth',
    fundScopeMode: 'not_applicable',
    workflowRequirement: null,
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/dashboard': {
    lifecycle: 'durable_crud',
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/portfolio/company/:id': {
    lifecycle: 'durable_crud',
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/portfolio': {
    lifecycle: 'durable_crud',
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/performance': {
    lifecycle: 'durable_crud',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/forecasting': {
    lifecycle: 'durable_crud',
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/financial-modeling': {
    lifecycle: 'durable_crud',
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/model-results': {
    lifecycle: 'durable_crud',
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/fund-model-results/:fundId/scenarios': {
    lifecycle: 'durable_crud',
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/fund-model-results/:fundId': {
    lifecycle: 'durable_crud',
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/fund-model-results/:fundId/moic-analysis': {
    lifecycle: 'durable_crud',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  // Plan 9 Wave 9B1 (D-F.3): fund-scoped reports destination hosting the LP
  // reporting metrics pipeline. Client-route posture mirrors the
  // /lp-reporting/metrics compatibility route; the qualified_exportable
  // gates stay on the API export routes themselves.
  '/fund-model-results/:fundId/reports': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  // PLAN_61 Task 18 (Wave G). Internal reference snapshots on one coherent facts
  // basis -- never closes, restatements, or approved reports, so there is no
  // export path off this destination at all.
  '/fund-model-results/:fundId/internal-analysis': {
    lifecycle: 'durable_crud',
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/fund-model-results/:fundId/analysis': {
    lifecycle: 'durable_crud',
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/sensitivity-analysis': {
    lifecycle: 'durable_crud',
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/reports': {
    lifecycle: 'durable_crud',
    financialSurface: 'export_artifact',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'qualified_exportable',
    provenanceRequired: false,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/variance-tracking': {
    lifecycle: 'durable_crud',
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/pipeline': {
    lifecycle: 'durable_crud',
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/lp-reporting/ledger': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/lp-reporting/valuations': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/lp-reporting/metrics': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/lp-reporting/imports': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/lp/dashboard': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_lp_access',
    fundScopeMode: 'lp_claim_scope',
    workflowRequirement: 'lp_access_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/lp/fund-detail/:fundId': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_lp_access',
    fundScopeMode: 'lp_claim_scope',
    workflowRequirement: 'lp_access_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/lp/capital-account': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_lp_access',
    fundScopeMode: 'lp_claim_scope',
    workflowRequirement: 'lp_access_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/lp/performance': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_lp_access',
    fundScopeMode: 'lp_claim_scope',
    workflowRequirement: 'lp_access_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/lp/reports': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_lp_access',
    fundScopeMode: 'lp_claim_scope',
    workflowRequirement: 'lp_access_verified',
    exportPolicy: 'qualified_exportable',
    provenanceRequired: false,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/lp/settings': {
    lifecycle: 'durable_crud',
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_lp_access',
    fundScopeMode: 'lp_claim_scope',
    workflowRequirement: 'lp_access_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
};

export const EXPLICIT_GOVERNANCE_POLICY_KEYS = new Set<string>(
  Object.keys(GOVERNANCE_ROUTE_POLICY_DECISIONS)
);

function governanceRefForPortfolioIntelligenceRoute(
  route: PortfolioIntelligenceClassificationEntry
): string {
  if (route.path.includes('/forecasts')) {
    return '/forecasting';
  }

  if (route.path.includes('/scenarios')) {
    return '/fund-model-results/:fundId/scenarios';
  }

  return '/portfolio';
}

const PROTOTYPE_ROUTE_NOTE = 'Prototype route must return 501 with non_actionable provenance.';
const LP_REPORT_PACKAGE_EXPORT_WORKFLOW_REQUIREMENT = 'metric_run_locked_or_exported';
const LP_REPORT_PACKAGE_EXPORT_NOTE =
  'ADR-041: Surface-A report-package export requires the global partner/admin role, metric-run workflow state locked or exported, and H9 qualification; per-fund grants do not constrain these internal investment-team roles. The export contract scopes visual watermarking out by ADR-027 because h9Stamp plus contentHash provide JSON/CSV hash attestation.';
const LP_REPORT_PACKAGE_EXPORT_STATUS_NOTE =
  'Readiness-metadata status GET (ADR-040 as amended by ADR-041): global partner/admin role and workflow-state gated, but intentionally H9-independent and non-exportable. It serves stored-export metadata only; the authoritative artifact GET re-validates H9 before any artifact bytes are served.';

type LpReportingRoutePolicyGroup = Pick<
  RoutePolicyEntry,
  'workflowRequirement' | 'exportPolicy' | 'provenanceRequired'
> &
  Partial<Pick<RoutePolicyEntry, 'notes'>> & {
    governanceRef: '/lp-reporting/metrics' | '/lp-reporting/imports';
    routes: ReadonlyArray<readonly [method: string, path: string]>;
  };

const LP_REPORTING_ADDITIONAL_ROUTE_POLICY_GROUPS = [
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [['POST', '/api/funds/:fundId/metric-runs/dry-run']],
    workflowRequirement: 'source_rows_and_preview_hash_generated',
    exportPolicy: 'preview_only',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [['POST', '/api/funds/:fundId/metric-runs/commit']],
    workflowRequirement: 'preview_hash_source_rows_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [
      ['GET', '/api/funds/:fundId/metric-runs/latest'],
      ['GET', '/api/funds/:fundId/metric-runs/:metricRunId'],
      ['GET', '/api/funds/:fundId/metric-runs/:metricRunId/report-package'],
      ['GET', '/api/funds/:fundId/metric-runs/:metricRunId/evidence-records'],
      ['GET', '/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs'],
      ['GET', '/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId'],
    ],
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [['POST', '/api/funds/:fundId/metric-runs/:metricRunId/approve']],
    workflowRequirement: 'draft_metric_run_evidence_and_expected_version_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [['POST', '/api/funds/:fundId/metric-runs/:metricRunId/lock']],
    workflowRequirement: 'approved_metric_run_and_expected_version_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [['POST', '/api/funds/:fundId/metric-runs/:metricRunId/report-package']],
    workflowRequirement: 'locked_metric_run_and_approved_narrative_versions_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [['POST', '/api/funds/:fundId/metric-runs/:metricRunId/evidence-records']],
    workflowRequirement: 'draft_metric_run_and_idempotency_key_dedup',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    notes:
      'Idempotency on this route is key-only deduplication: a replayed Idempotency-Key returns the stored evidence record without comparing the request body, so a different body with the same key is silently accepted (metric-run-evidence-service). Request-hash comparison returning 409 is an ADR-040 follow-up.',
  },
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [['POST', '/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs']],
    workflowRequirement: 'locked_metric_run_source_contract_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [
      ['PATCH', '/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId'],
    ],
    workflowRequirement: 'locked_metric_run_draft_and_expected_version_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [
      ['POST', '/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/review'],
    ],
    workflowRequirement: 'locked_metric_run_edited_draft_and_expected_version_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/metrics',
    routes: [
      [
        'POST',
        '/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/approve',
      ],
    ],
    workflowRequirement: 'locked_metric_run_edited_review_and_expected_version_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/imports',
    routes: [
      ['POST', '/api/funds/:fundId/imports/ledger/dry-run'],
      ['POST', '/api/funds/:fundId/imports/valuation-marks/dry-run'],
    ],
    workflowRequirement: 'reconciliation_preview_hash_generated',
    exportPolicy: 'preview_only',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/imports',
    routes: [
      ['POST', '/api/funds/:fundId/imports/ledger/commit'],
      ['POST', '/api/funds/:fundId/imports/valuation-marks/commit'],
    ],
    workflowRequirement: 'clean_preview_hash_fund_references_and_source_hashes_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    governanceRef: '/lp-reporting/imports',
    routes: [
      ['POST', '/api/funds/:fundId/imports/artifacts'],
      ['POST', '/api/funds/:fundId/imports/mapping-profiles'],
    ],
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    // Task 6 R1: CSV observed-actual staging (Idempotency-Key required).
    governanceRef: '/lp-reporting/imports',
    routes: [['POST', '/api/funds/:fundId/imports/batches']],
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    // Task 6 R2/R3/R4/R5: batch status, case list, and case resolution.
    governanceRef: '/lp-reporting/imports',
    routes: [
      ['GET', '/api/funds/:fundId/imports/batches/:batchId'],
      ['GET', '/api/funds/:fundId/reconciliation/cases'],
      ['POST', '/api/funds/:fundId/reconciliation/cases/:caseId/resolve'],
      ['POST', '/api/funds/:fundId/reconciliation/cases/bulk-resolve'],
    ],
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
  {
    // Task 6 R6: acceptance-only commit of requested singleton groups.
    governanceRef: '/lp-reporting/imports',
    routes: [['POST', '/api/funds/:fundId/imports/batches/:batchId/commit']],
    workflowRequirement: 'clean_preview_hash_fund_references_and_source_hashes_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
  },
] satisfies ReadonlyArray<LpReportingRoutePolicyGroup>;

const LP_REPORTING_ADDITIONAL_ROUTE_POLICY_ENTRIES: RoutePolicyEntry[] =
  LP_REPORTING_ADDITIONAL_ROUTE_POLICY_GROUPS.flatMap(({ routes, governanceRef, ...decision }) =>
    routes.map(([method, path]) => ({
      id: `api:${method.toLowerCase()}:${path}`,
      method,
      path,
      lifecycle: 'durable_crud',
      governanceRef,
      surface:
        governanceRef === '/lp-reporting/imports'
          ? 'lp-reporting-imports-api'
          : 'lp-reporting-metric-runs-api',
      owner: ownerForFinancialSurface('lp_reporting'),
      telemetryKey: telemetryKeyForRoute('api.route', path),
      financialSurface: 'lp_reporting',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'route_param_fund_id',
      ...decision,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
    }))
  );

const PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_DECISIONS: Readonly<PortfolioIntelligenceRouteDecisionMap> =
  {
    'POST /api/portfolio/strategies': {
      lifecycle: 'durable_crud',
      financialSurface: 'portfolio_management',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'query_param_fund_id',
      workflowRequirement: 'fund_scope_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: false,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
    },
    'GET /api/portfolio/strategies/:fundId': {
      lifecycle: 'durable_crud',
      financialSurface: 'portfolio_management',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'route_param_fund_id',
      workflowRequirement: 'fund_scope_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: false,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
    },
    'PUT /api/portfolio/strategies/:id': {
      lifecycle: 'durable_crud',
      financialSurface: 'portfolio_management',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'parent_entity_lookup',
      workflowRequirement: 'fund_scope_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: false,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
    },
    'DELETE /api/portfolio/strategies/:id': {
      lifecycle: 'durable_crud',
      financialSurface: 'portfolio_management',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'parent_entity_lookup',
      workflowRequirement: 'fund_scope_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: false,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
    },
    'POST /api/portfolio/scenarios': {
      lifecycle: 'durable_crud',
      financialSurface: 'fund_modeling',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'query_param_fund_id',
      workflowRequirement: 'fund_scope_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: false,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
    },
    'GET /api/portfolio/scenarios/:fundId': {
      lifecycle: 'durable_crud',
      financialSurface: 'fund_modeling',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'route_param_fund_id',
      workflowRequirement: 'fund_scope_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: false,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
    },
    'POST /api/portfolio/scenarios/compare': {
      lifecycle: 'prototype_501',
      financialSurface: 'fund_modeling',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'parent_entity_lookup',
      workflowRequirement: 'prototype_financial_output_blocked',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
      notes: PROTOTYPE_ROUTE_NOTE,
    },
    'POST /api/portfolio/scenarios/:id/simulate': {
      lifecycle: 'prototype_501',
      financialSurface: 'fund_modeling',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'parent_entity_lookup',
      workflowRequirement: 'prototype_financial_output_blocked',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
      notes: PROTOTYPE_ROUTE_NOTE,
    },
    'POST /api/portfolio/reserves/optimize': {
      lifecycle: 'prototype_501',
      financialSurface: 'moic_reserves',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'query_param_fund_id',
      workflowRequirement: 'prototype_financial_output_blocked',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
      notes: PROTOTYPE_ROUTE_NOTE,
    },
    'GET /api/portfolio/reserves/strategies/:fundId': {
      lifecycle: 'durable_crud',
      financialSurface: 'moic_reserves',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'route_param_fund_id',
      workflowRequirement: 'fund_scope_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
      staleBlocksExport: true,
      humanReviewRequired: true,
      performanceBudgetMs: null,
    },
    'POST /api/portfolio/reserves/backtest': {
      lifecycle: 'prototype_501',
      financialSurface: 'moic_reserves',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'parent_entity_lookup',
      workflowRequirement: 'prototype_financial_output_blocked',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
      notes: PROTOTYPE_ROUTE_NOTE,
    },
    'POST /api/portfolio/forecasts': {
      lifecycle: 'prototype_501',
      financialSurface: 'fund_modeling',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'query_param_fund_id',
      workflowRequirement: 'prototype_financial_output_blocked',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
      notes: PROTOTYPE_ROUTE_NOTE,
    },
    'GET /api/portfolio/forecasts/:scenarioId': {
      lifecycle: 'durable_crud',
      financialSurface: 'fund_modeling',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'parent_entity_lookup',
      workflowRequirement: 'fund_scope_verified',
      exportPolicy: 'not_exportable',
      provenanceRequired: false,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
    },
    'POST /api/portfolio/forecasts/validate': {
      lifecycle: 'prototype_501',
      financialSurface: 'fund_modeling',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'parent_entity_lookup',
      workflowRequirement: 'prototype_financial_output_blocked',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
      notes: PROTOTYPE_ROUTE_NOTE,
    },
    'GET /api/portfolio/templates': {
      lifecycle: 'static_template',
      financialSurface: 'portfolio_management',
      apiAuthBoundary: 'require_auth',
      fundScopeMode: 'not_applicable',
      workflowRequirement: null,
      exportPolicy: 'preview_only',
      provenanceRequired: true,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
    },
    'POST /api/portfolio/quick-scenario': {
      lifecycle: 'prototype_501',
      financialSurface: 'portfolio_management',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'parent_entity_lookup',
      workflowRequirement: 'prototype_financial_output_blocked',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
      notes: PROTOTYPE_ROUTE_NOTE,
    },
    'GET /api/portfolio/metrics/:scenarioId': {
      lifecycle: 'prototype_501',
      financialSurface: 'moic_reserves',
      apiAuthBoundary: 'require_auth_and_fund_access',
      fundScopeMode: 'parent_entity_lookup',
      workflowRequirement: 'prototype_financial_output_blocked',
      exportPolicy: 'not_exportable',
      provenanceRequired: true,
      staleBlocksExport: false,
      humanReviewRequired: true,
      performanceBudgetMs: null,
      notes: PROTOTYPE_ROUTE_NOTE,
    },
  };

export const PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_KEYS = new Set<string>(
  Object.keys(PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_DECISIONS)
);

export const EXPLICIT_API_ROUTE_POLICY_ENTRIES: RoutePolicyEntry[] = [
  {
    id: 'api:get:/api/funds/:fundId/moic/rankings',
    method: 'GET',
    path: '/api/funds/:fundId/moic/rankings',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/moic-analysis',
    surface: 'fund-moic-rankings-api',
    owner: 'analytics',
    telemetryKey: 'api.route.api.funds.fundId.moic.rankings',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'H9 source-fingerprint actionability is enforced in the route before candidate MOIC rankings can be served.',
  },
  {
    id: 'api:get:/api/funds/:fundId/moic/marginal-rankings',
    method: 'GET',
    path: '/api/funds/:fundId/moic/marginal-rankings',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/moic-analysis',
    surface: 'marginal-reserve-moic-internal-soak-api',
    owner: 'analytics',
    telemetryKey: 'api.route.api.funds.fundId.moic.marginal.rankings',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'require_auth_fund_access_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'internal_soak_review_required',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Default-off, server-only flag gates this mode/H9/readiness-governed internal soak; it remains dormant until separately-governed activation.',
  },
  {
    id: 'api:post:/api/funds/:fundId/moic/reserve-intelligence/runs',
    method: 'POST',
    path: '/api/funds/:fundId/moic/reserve-intelligence/runs',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/moic-analysis',
    surface: 'reserve-intelligence-run-command-api',
    owner: 'analytics',
    telemetryKey: 'api.route.api.funds.fundId.moic.reserve.intelligence.runs',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'require_auth_fund_access_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'internal_soak_review_required',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Idempotent reserve-intelligence commands persist payload-only fund snapshots for governed internal review.',
  },
  {
    id: 'api:get:/api/funds/:fundId/moic/reserve-intelligence/latest',
    method: 'GET',
    path: '/api/funds/:fundId/moic/reserve-intelligence/latest',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/moic-analysis',
    surface: 'reserve-intelligence-latest-read-api',
    owner: 'analytics',
    telemetryKey: 'api.route.api.funds.fundId.moic.reserve.intelligence.latest',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'require_auth_fund_access_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'internal_soak_review_required',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Fund-scoped read returns the latest persisted reserve-intelligence snapshot without rerunning calculations.',
  },
  {
    id: 'api:get:/api/funds/:fundId/moic/reserve-intelligence/runs/:snapshotId',
    method: 'GET',
    path: '/api/funds/:fundId/moic/reserve-intelligence/runs/:snapshotId',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/moic-analysis',
    surface: 'reserve-intelligence-run-read-api',
    owner: 'analytics',
    telemetryKey: 'api.route.api.funds.fundId.moic.reserve.intelligence.runs.snapshotId',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'require_auth_fund_access_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'internal_soak_review_required',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Typed fund-scoped lookup prevents cross-fund and cross-snapshot-type reserve-intelligence reads.',
  },
  {
    id: 'api:get:/api/portfolio-overview',
    method: 'GET',
    path: '/api/portfolio-overview',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'portfolio-overview-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute('api.route', '/api/portfolio-overview'),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'query_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'PR #918 portfolio overview returns actionable financial provenance for a query-scoped fund.',
  },
  {
    id: 'api:get:/api/funds/:fundId/actuals/facts',
    method: 'GET',
    path: '/api/funds/:fundId/actuals/facts',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId',
    surface: 'fund-company-actuals-facts-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute('api.route', '/api/funds/:fundId/actuals/facts'),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Read-only Round/FMV-derived model-input facts; no export or UI actionability claim is introduced in this slice.',
  },
  {
    id: 'api:get:/api/funds/:fundId/financial-facts/latest',
    method: 'GET',
    path: '/api/funds/:fundId/financial-facts/latest',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId',
    surface: 'financial-facts-latest-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute('api.route', '/api/funds/:fundId/financial-facts/latest'),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Fund-scoped read surface serves the latest persisted accepted financial-facts snapshot without creating data during reads.',
  },
  {
    id: 'api:get:/api/funds/:fundId/current-plan-versions',
    method: 'GET',
    path: '/api/funds/:fundId/current-plan-versions',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId',
    surface: 'current-plan-versions-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute('api.route', '/api/funds/:fundId/current-plan-versions'),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: 'Fund-scoped read lists immutable accepted current-plan versions.',
  },
  {
    id: 'api:post:/api/funds/:fundId/current-plan-versions',
    method: 'POST',
    path: '/api/funds/:fundId/current-plan-versions',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId',
    surface: 'current-plan-versions-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute('api.route', '/api/funds/:fundId/current-plan-versions'),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: 'Idempotent fund-scoped mutation mints an immutable accepted current-plan version.',
  },
  {
    id: 'api:post:/api/funds/:fundId/current-forecast/runs',
    method: 'POST',
    path: '/api/funds/:fundId/current-forecast/runs',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId',
    surface: 'current-forecast-runs-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute('api.route', '/api/funds/:fundId/current-forecast/runs'),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: 'Fund-scoped current-forecast runs bind accepted plan and financial-facts inputs.',
  },
  {
    id: 'api:get:/api/companies/:companyId/scenarios',
    method: 'GET',
    path: '/api/companies/:companyId/scenarios',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/scenarios',
    surface: 'company-scenario-list-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute('api.route', '/api/companies/:companyId/scenarios'),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Authenticated read resolves company ownership before fund-scope enforcement; no mutation or feature gate.',
  },
  {
    id: 'api:post:/api/funds/:fundId/scenario-analysis/scenarios/:scenarioId/cases/from-seed',
    method: 'POST',
    path: '/api/funds/:fundId/scenario-analysis/scenarios/:scenarioId/cases/from-seed',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/scenarios',
    surface: 'scenario-case-seed-creation-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/scenario-analysis/scenarios/:scenarioId/cases/from-seed'
    ),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_fund_access_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_optimistic_lock_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Idempotent case creation preserves the selected actuals snapshot and requires optimistic locking on the parent scenario.',
  },
  ...LP_REPORTING_ADDITIONAL_ROUTE_POLICY_ENTRIES,
  {
    id: 'api:get:/api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model',
    method: 'GET',
    path: '/api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model',
    lifecycle: 'durable_crud',
    governanceRef: '/lp-reporting/metrics',
    surface: 'lp-reporting-report-package-export-api',
    owner: ownerForFinancialSurface('lp_reporting'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model'
    ),
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: LP_REPORT_PACKAGE_EXPORT_WORKFLOW_REQUIREMENT,
    exportPolicy: 'qualified_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: LP_REPORT_PACKAGE_EXPORT_NOTE,
  },
  {
    id: 'api:get:/api/funds/:fundId/metric-runs/:metricRunId/report-package/export/json',
    method: 'GET',
    path: '/api/funds/:fundId/metric-runs/:metricRunId/report-package/export/json',
    lifecycle: 'durable_crud',
    governanceRef: '/lp-reporting/metrics',
    surface: 'lp-reporting-report-package-export-api',
    owner: ownerForFinancialSurface('lp_reporting'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/export/json'
    ),
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: LP_REPORT_PACKAGE_EXPORT_WORKFLOW_REQUIREMENT,
    exportPolicy: 'qualified_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: LP_REPORT_PACKAGE_EXPORT_NOTE,
  },
  {
    id: 'api:post:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json',
    method: 'POST',
    path: '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json',
    lifecycle: 'durable_crud',
    governanceRef: '/lp-reporting/metrics',
    surface: 'lp-reporting-report-package-export-api',
    owner: ownerForFinancialSurface('lp_reporting'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json'
    ),
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: LP_REPORT_PACKAGE_EXPORT_WORKFLOW_REQUIREMENT,
    exportPolicy: 'qualified_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: LP_REPORT_PACKAGE_EXPORT_NOTE,
  },
  {
    id: 'api:get:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json',
    method: 'GET',
    path: '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json',
    lifecycle: 'durable_crud',
    governanceRef: '/lp-reporting/metrics',
    surface: 'lp-reporting-report-package-export-api',
    owner: ownerForFinancialSurface('lp_reporting'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json'
    ),
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: LP_REPORT_PACKAGE_EXPORT_WORKFLOW_REQUIREMENT,
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: LP_REPORT_PACKAGE_EXPORT_STATUS_NOTE,
  },
  {
    id: 'api:get:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json/artifact',
    method: 'GET',
    path: '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json/artifact',
    lifecycle: 'durable_crud',
    governanceRef: '/lp-reporting/metrics',
    surface: 'lp-reporting-report-package-export-api',
    owner: ownerForFinancialSurface('lp_reporting'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json/artifact'
    ),
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: LP_REPORT_PACKAGE_EXPORT_WORKFLOW_REQUIREMENT,
    exportPolicy: 'qualified_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: LP_REPORT_PACKAGE_EXPORT_NOTE,
  },
  {
    id: 'api:post:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv',
    method: 'POST',
    path: '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv',
    lifecycle: 'durable_crud',
    governanceRef: '/lp-reporting/metrics',
    surface: 'lp-reporting-report-package-export-api',
    owner: ownerForFinancialSurface('lp_reporting'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv'
    ),
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: LP_REPORT_PACKAGE_EXPORT_WORKFLOW_REQUIREMENT,
    exportPolicy: 'qualified_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: LP_REPORT_PACKAGE_EXPORT_NOTE,
  },
  {
    id: 'api:get:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv',
    method: 'GET',
    path: '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv',
    lifecycle: 'durable_crud',
    governanceRef: '/lp-reporting/metrics',
    surface: 'lp-reporting-report-package-export-api',
    owner: ownerForFinancialSurface('lp_reporting'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv'
    ),
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: LP_REPORT_PACKAGE_EXPORT_WORKFLOW_REQUIREMENT,
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: LP_REPORT_PACKAGE_EXPORT_STATUS_NOTE,
  },
  {
    id: 'api:get:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv/artifact',
    method: 'GET',
    path: '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv/artifact',
    lifecycle: 'durable_crud',
    governanceRef: '/lp-reporting/metrics',
    surface: 'lp-reporting-report-package-export-api',
    owner: ownerForFinancialSurface('lp_reporting'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv/artifact'
    ),
    financialSurface: 'lp_reporting',
    apiAuthBoundary: 'require_auth_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: LP_REPORT_PACKAGE_EXPORT_WORKFLOW_REQUIREMENT,
    exportPolicy: 'qualified_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: LP_REPORT_PACKAGE_EXPORT_NOTE,
  },
  {
    id: 'api:put:/api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId',
    method: 'PUT',
    path: '/api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/moic-analysis',
    surface: 'fund-moic-input-admin-api',
    owner: 'analytics',
    telemetryKey: 'api.route.api.admin.funds.fundId.moic.inputs.portfolio.companies.companyId',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'admin_only',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'admin_moic_input_update_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Express middleware enforces fund access and admin role; route-policy verification allows this scoped admin financial-control API.',
  },
  {
    id: 'api:put:/api/admin/funds/:fundId/calculation-modes/fund-moic-rankings',
    method: 'PUT',
    path: '/api/admin/funds/:fundId/calculation-modes/fund-moic-rankings',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/moic-analysis',
    surface: 'fund-moic-mode-admin-api',
    owner: 'analytics',
    telemetryKey: 'api.route.api.admin.funds.fundId.calculation.modes.fund.moic.rankings',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'admin_only',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'admin_mode_update_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Express middleware enforces fund access and admin role; route-policy verification allows this scoped admin financial-control API.',
  },
  {
    id: 'api:put:/api/admin/funds/:fundId/calculation-modes/current-forecast',
    method: 'PUT',
    path: '/api/admin/funds/:fundId/calculation-modes/current-forecast',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId',
    surface: 'current-forecast-mode-admin-api',
    owner: 'analytics',
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/admin/funds/:fundId/calculation-modes/current-forecast'
    ),
    // TODO(13): replace with a current_forecast surface when the policy type supports it.
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'admin_only',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'admin_mode_update_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Express middleware enforces fund access and admin role; route-policy verification allows this scoped admin financial-control API.',
  },
  {
    id: 'api:post:/api/admin/funds/:fundId/current-forecast/references',
    method: 'POST',
    path: '/api/admin/funds/:fundId/current-forecast/references',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId',
    surface: 'current-forecast-reference-admin-api',
    owner: 'analytics',
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/admin/funds/:fundId/current-forecast/references'
    ),
    // TODO(13): replace with a current_forecast surface when the policy type supports it.
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'admin_only',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Idempotent admin override/rollback: clones an existing current-forecast reference into a new append-only candidate (PLAN_61 13.1-svc).',
  },
  {
    id: 'api:post:/api/admin/funds/:fundId/current-forecast/activate',
    method: 'POST',
    path: '/api/admin/funds/:fundId/current-forecast/activate',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId',
    surface: 'current-forecast-activation-admin-api',
    owner: 'analytics',
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/admin/funds/:fundId/current-forecast/activate'
    ),
    // TODO(13): replace with a current_forecast surface when the policy type supports it.
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'admin_only',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'admin_mode_update_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'DORMANT activation command (executed only by Task 23): atomically writes mode on + activated_at + cutover_reference_id + candidate flip.',
  },
  {
    id: 'api:post:/api/funds/:fundId/investment-ledger/financing-events',
    method: 'POST',
    path: '/api/funds/:fundId/investment-ledger/financing-events',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/financing-events'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 9 canonical financing event. A repeat (companyIdentity, eventKey) resolves onto the existing event rather than duplicating the parent identity.',
  },
  {
    id: 'api:post:/api/funds/:fundId/investment-ledger/financing-events/:eventId/tranches',
    method: 'POST',
    path: '/api/funds/:fundId/investment-ledger/financing-events/:eventId/tranches',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/financing-events/:eventId/tranches'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 9 independent closing recorded as tranche version 1; the write synthesizes a manual observation in the same transaction.',
  },
  {
    id: 'api:post:/api/funds/:fundId/investment-ledger/tranches/:trancheId/corrections',
    method: 'POST',
    path: '/api/funds/:fundId/investment-ledger/tranches/:trancheId/corrections',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/tranches/:trancheId/corrections'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 9 correction supersedes the tranche head with an incremented version row; the superseded row is never edited in place. The downstream cascade is Task 10.',
  },
  {
    id: 'api:post:/api/funds/:fundId/investment-ledger/tranches/:trancheId/participations',
    method: 'POST',
    path: '/api/funds/:fundId/investment-ledger/tranches/:trancheId/participations',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/tranches/:trancheId/participations'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 10 vehicle participation atomically records canonical economics, compatibility rows, and accepted observation provenance.',
  },
  {
    id: 'api:post:/api/funds/:fundId/investment-ledger/tranches/:trancheId/ledger-corrections',
    method: 'POST',
    path: '/api/funds/:fundId/investment-ledger/tranches/:trancheId/ledger-corrections',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/tranches/:trancheId/ledger-corrections'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 10 atomic correction command supersedes a tranche and its complete dependent participation set with compatibility and reconciliation updates.',
  },
  {
    id: 'api:get:/api/funds/:fundId/investment-ledger/financing-events/:eventId',
    method: 'GET',
    path: '/api/funds/:fundId/investment-ledger/financing-events/:eventId',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/financing-events/:eventId'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Fund-scoped read of one financing event with its current tranche heads and full version history; reads create nothing.',
  },
  {
    id: 'api:get:/api/funds/:fundId/investment-ledger/positions',
    method: 'GET',
    path: '/api/funds/:fundId/investment-ledger/positions',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/positions'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 11 position read is registered for policy coverage only; handler mounting is deferred to the Task 11C route slice.',
  },
  {
    id: 'api:post:/api/funds/:fundId/investment-ledger/position-events',
    method: 'POST',
    path: '/api/funds/:fundId/investment-ledger/position-events',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/position-events'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 11 append-only position event command; route handler is mounted on the common investment-ledger router.',
  },
  {
    id: 'api:post:/api/funds/:fundId/investment-ledger/position-conversions',
    method: 'POST',
    path: '/api/funds/:fundId/investment-ledger/position-conversions',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/position-conversions'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 11 conversion command records source and resulting participation lineage; route handler is mounted on the common investment-ledger router.',
  },
  {
    id: 'api:post:/api/funds/:fundId/investment-ledger/position-corrections',
    method: 'POST',
    path: '/api/funds/:fundId/investment-ledger/position-corrections',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/position-corrections'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 11 correction command registers append-only replacement/reversal policy; route handler is mounted on the common investment-ledger router.',
  },
  {
    id: 'api:get:/api/funds/:fundId/investment-ledger/ownership-snapshots',
    method: 'GET',
    path: '/api/funds/:fundId/investment-ledger/ownership-snapshots',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/ownership-snapshots'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 11 ownership snapshot read is registered for policy coverage only; handler mounting is deferred to Task 11C.',
  },
  {
    id: 'api:post:/api/funds/:fundId/investment-ledger/ownership-snapshots',
    method: 'POST',
    path: '/api/funds/:fundId/investment-ledger/ownership-snapshots',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/ownership-snapshots'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 11 immutable ownership snapshot command; route handler mounting is deferred to the Task 11C service slice.',
  },
  {
    id: 'api:get:/api/funds/:fundId/investment-ledger/position-valuations',
    method: 'GET',
    path: '/api/funds/:fundId/investment-ledger/position-valuations',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/position-valuations'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 11 direct/derived position valuation selection; public reads use server knowledge cutoff only.',
  },
  {
    id: 'api:post:/api/funds/:fundId/investment-ledger/position-valuations',
    method: 'POST',
    path: '/api/funds/:fundId/investment-ledger/position-valuations',
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'investment-ledger-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/investment-ledger/position-valuations'
    ),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Task 11 direct position valuation command creates direct-position FMV marks; route handler mounting is deferred to Task 11C.',
  },
  {
    id: 'api:post:/api/funds/:fundId/internal-economics/runs',
    method: 'POST',
    path: '/api/funds/:fundId/internal-economics/runs',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/internal-analysis',
    surface: 'internal-economics-run-create-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute('api.route', '/api/funds/:fundId/internal-economics/runs'),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_fund_access_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'idempotent_immutable_run_creation',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Investment-team-only idempotent creation of one immutable internal LP economics scenario run. This surface is not policy authoring, a consequential configuration mutation, or an export.',
  },
  {
    id: 'api:get:/api/funds/:fundId/internal-economics/runs/:runId',
    method: 'GET',
    path: '/api/funds/:fundId/internal-economics/runs/:runId',
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId/internal-analysis',
    surface: 'internal-economics-run-read-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute(
      'api.route',
      '/api/funds/:fundId/internal-economics/runs/:runId'
    ),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_fund_access_and_role',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'immutable_run_receipt_read',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Investment-team-only read of one immutable internal LP economics run receipt. This surface is not an LP route or an export.',
  },
  ...(
    [
      ['GET', '/api/funds/:fundId/internal-analysis/drafts', 'List revisable analysis drafts.'],
      [
        'GET',
        '/api/funds/:fundId/internal-analysis/drafts/:draftId',
        'Read one draft; the response ETag is what a refresh or save must echo in If-Match.',
      ],
      [
        'GET',
        '/api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review',
        'Read exact-basis internal quarterly review roster and completion state.',
      ],
      [
        'PATCH',
        '/api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review/companies/:companyId/items/:category',
        'Update one exact-basis quarterly review item with immutable command receipt.',
      ],
      [
        'POST',
        '/api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review/companies/:companyId/waiver',
        'Apply terminal partner/admin waiver with immutable command receipt.',
      ],
      [
        'POST',
        '/api/funds/:fundId/internal-analysis/drafts',
        'Create a manual-period draft; quarterly drafts come from the job_outbox planner.',
      ],
      [
        'PATCH',
        '/api/funds/:fundId/internal-analysis/drafts/:draftId/economics-reference',
        'Attach or clear one completed same-fund economics run under the draft If-Match.',
      ],
      [
        'POST',
        '/api/funds/:fundId/internal-analysis/drafts/:draftId/refresh',
        'Advance the cutoff and repin every consumer from ONE facts snapshot (D6); rotates the ETag.',
      ],
      [
        'POST',
        '/api/funds/:fundId/internal-analysis/drafts/:draftId/save',
        'Freeze a draft into an immutable reference; rejects a mixed facts basis unless acknowledged (D6/R34-d).',
      ],
      [
        'GET',
        '/api/funds/:fundId/internal-analysis/references',
        'List immutable references, terminal-per-revision-chain by default.',
      ],
      [
        'GET',
        '/api/funds/:fundId/internal-analysis/references/:referenceId',
        'Read one immutable reference, including its persisted mixed-basis flag.',
      ],
      [
        'POST',
        '/api/funds/:fundId/internal-analysis/references/:referenceId/drafts',
        'Start a late-correction draft; saving it supersedes the source reference.',
      ],
      [
        'POST',
        '/api/admin/funds/:fundId/internal-analysis/quarterly-draft-run',
        'Manual quarterly planner trigger (R33-b escape hatch); enqueues only, never processes.',
      ],
    ] as const
  ).map(([method, path, notes]): RoutePolicyEntry => ({
    id: `api:${method.toLowerCase()}:${path}`,
    method,
    path,
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId',
    surface: 'internal-analysis-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute('api.route', path),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: path.startsWith('/api/admin/')
      ? 'require_auth_fund_access_and_role'
      : 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    // Internal reference snapshots are never closes, restatements, or approved
    // reports -- there is no export path off this surface at all (Task 18 gate).
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: `PLAN_61 Task 18. ${notes}`,
  })),
  ...(
    [
      [
        'GET',
        '/api/funds/:fundId/kpi-observations',
        'List collected KPI observations for a fund, filtered by company, metric, basis, review state, or period.',
      ],
      [
        'GET',
        '/api/funds/:fundId/kpi-observations/:observationId',
        'Read one observation; the response ETag is what a review must echo in If-Match.',
      ],
      [
        'POST',
        '/api/funds/:fundId/kpi-observations',
        'Record one manually entered observation under a required Idempotency-Key.',
      ],
      [
        'POST',
        '/api/funds/:fundId/kpi-observations/imports',
        'Import a fixed-template CSV batch; each row lands through the same idempotent command.',
      ],
      [
        'PATCH',
        '/api/funds/:fundId/kpi-observations/:observationId/review',
        'Record a reviewer decision under If-Match optimistic locking.',
      ],
    ] as const
  ).map(([method, path, notes]): RoutePolicyEntry => ({
    id: `api:${method.toLowerCase()}:${path}`,
    method,
    path,
    lifecycle: 'durable_crud',
    governanceRef: '/portfolio',
    surface: 'kpi-observations-api',
    owner: ownerForFinancialSurface('portfolio_management'),
    telemetryKey: telemetryKeyForRoute('api.route', path),
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    // Internal KPI collection is internal-only and CSV-first: no company-facing
    // request form, no recipient, no send, and no export path at all (GR2-4a).
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: `Issue #1300. ${notes}`,
  })),
  ...(
    [
      [
        'GET',
        '/api/funds/:fundId/internal-analysis/narratives',
        'Read the terminal source-linked narrative for an anchor (draft or reference).',
      ],
      [
        'POST',
        '/api/funds/:fundId/internal-analysis/narratives/generate',
        'Generate a narrative from an anchor basis; regeneration carries user commentary forward.',
      ],
      [
        'POST',
        '/api/funds/:fundId/internal-analysis/narratives/revise',
        'Persist an operator edit as a new narrative revision superseding the terminal.',
      ],
      [
        'GET',
        '/api/funds/:fundId/internal-analysis/notes',
        'List append-only notes for an anchor.',
      ],
      [
        'POST',
        '/api/funds/:fundId/internal-analysis/notes',
        'Append a note, or a correction that supersedes one, for an anchor.',
      ],
    ] as const
  ).map(([method, path, notes]): RoutePolicyEntry => ({
    id: `api:${method.toLowerCase()}:${path}`,
    method,
    path,
    lifecycle: 'durable_crud',
    governanceRef: '/fund-model-results/:fundId',
    surface: 'internal-analysis-api',
    owner: ownerForFinancialSurface('fund_modeling'),
    telemetryKey: telemetryKeyForRoute('api.route', path),
    financialSurface: 'fund_modeling',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'fund_scope_and_idempotency_verified',
    // Narratives and notes are internal reference artifacts -- no recipient, send,
    // approval, or export path exists on this surface at all (Task 19 gate).
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: false,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: `PLAN_61 Task 19. ${notes}`,
  })),
];

export const EXPLICIT_API_ROUTE_POLICY_KEYS = new Set<string>(
  EXPLICIT_API_ROUTE_POLICY_ENTRIES.map(routePolicyKey)
);

function buildGovernancePolicyEntry(entry: RouteGovernanceEntry): RoutePolicyEntry | undefined {
  const decision = GOVERNANCE_ROUTE_POLICY_DECISIONS[entry.path];
  if (!decision) {
    return undefined;
  }

  return {
    id: `client:${entry.path}`,
    path: entry.path,
    governanceRef: entry.path,
    surface: entry.surface,
    owner: ownerForFinancialSurface(decision.financialSurface),
    telemetryKey: telemetryKeyForRoute('client.route', entry.path),
    ...decision,
    ...(decision.notes || entry.notes ? { notes: decision.notes ?? entry.notes } : {}),
  };
}

function buildPortfolioIntelligencePolicyEntry(
  route: PortfolioIntelligenceClassificationEntry
): RoutePolicyEntry | undefined {
  const key = `${route.method} ${route.path}` as PortfolioIntelligenceRouteKey;
  const decision = PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_DECISIONS[key];
  if (!decision) {
    return undefined;
  }

  const governanceRef = governanceRefForPortfolioIntelligenceRoute(route);
  const governanceEntry = requireGovernanceEntry(governanceRef);

  return {
    id: `api:${route.method.toLowerCase()}:${route.path}`,
    method: route.method.toUpperCase(),
    path: route.path,
    governanceRef,
    surface: 'portfolio-intelligence-api',
    owner: ownerForFinancialSurface(decision.financialSurface),
    telemetryKey: telemetryKeyForRoute('api.route', route.path),
    ...decision,
    ...(governanceEntry.notes && !decision.notes ? { notes: governanceEntry.notes } : {}),
  };
}

const routePolicyEntries: RoutePolicyEntry[] = [
  ...ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES.flatMap((entry) => {
    const policyEntry = buildGovernancePolicyEntry(entry);
    return policyEntry ? [policyEntry] : [];
  }),
  ...portfolioIntelligenceRouteClassifications.flatMap((route) => {
    const policyEntry = buildPortfolioIntelligencePolicyEntry(route);
    return policyEntry ? [policyEntry] : [];
  }),
  ...EXPLICIT_API_ROUTE_POLICY_ENTRIES,
];

export const API_ROUTE_POLICY_REGISTRY: RoutePolicyEntry[] =
  RoutePolicyEntrySchema.array().parse(routePolicyEntries);

export const COMMON_API_ROUTE_POLICY_IDS = {
  'dual-forecast': ['client:/forecasting'],
  'dashboard-summary': ['client:/dashboard'],
  'fund-actuals': ['api:get:/api/funds/:fundId/actuals/facts'],
  'financial-facts': ['api:get:/api/funds/:fundId/financial-facts/latest'],
  'internal-analysis': [
    'api:get:/api/funds/:fundId/internal-analysis/drafts',
    'api:get:/api/funds/:fundId/internal-analysis/drafts/:draftId',
    'api:post:/api/funds/:fundId/internal-analysis/drafts',
    'api:patch:/api/funds/:fundId/internal-analysis/drafts/:draftId/economics-reference',
    'api:post:/api/funds/:fundId/internal-analysis/drafts/:draftId/refresh',
    'api:post:/api/funds/:fundId/internal-analysis/drafts/:draftId/save',
    'api:get:/api/funds/:fundId/internal-analysis/references',
    'api:get:/api/funds/:fundId/internal-analysis/references/:referenceId',
    'api:post:/api/funds/:fundId/internal-analysis/references/:referenceId/drafts',
    'api:post:/api/admin/funds/:fundId/internal-analysis/quarterly-draft-run',
    'api:get:/api/funds/:fundId/internal-analysis/narratives',
    'api:post:/api/funds/:fundId/internal-analysis/narratives/generate',
    'api:post:/api/funds/:fundId/internal-analysis/narratives/revise',
    'api:get:/api/funds/:fundId/internal-analysis/notes',
    'api:post:/api/funds/:fundId/internal-analysis/notes',
  ],
  'current-forecast': [
    'api:get:/api/funds/:fundId/current-plan-versions',
    'api:post:/api/funds/:fundId/current-plan-versions',
    'api:post:/api/funds/:fundId/current-forecast/runs',
    'api:put:/api/admin/funds/:fundId/calculation-modes/current-forecast',
    'api:post:/api/admin/funds/:fundId/current-forecast/references',
    'api:post:/api/admin/funds/:fundId/current-forecast/activate',
  ],
  funds: ['client:/fund-setup'],
  'fund-metrics': ['client:/dashboard'],
  investments: ['client:/portfolio'],
  'portfolio-companies': ['client:/portfolio/company/:id'],
  'portfolio-overview': ['api:get:/api/portfolio-overview'],
  'portfolio-lots': ['client:/portfolio'],
  'performance-api': ['client:/performance'],
  variance: ['client:/variance-tracking'],
  'fund-config': ['client:/fund-setup'],
  allocations: ['client:/portfolio'],
  'allocation-scenarios': ['client:/fund-model-results/:fundId/scenarios'],
  'planning-fmv-overrides': ['client:/lp-reporting/valuations'],
  'fund-scenario-sets': ['client:/fund-model-results/:fundId/scenarios'],
  'fund-moic': ['api:get:/api/funds/:fundId/moic/rankings'],
  timeline: ['client:/fund-model-results/:fundId'],
  shares: ['client:/shared/:shareId'],
  'public-shares': ['client:/shared/:shareId'],
  'capital-allocation': ['client:/fund-model-results/:fundId/moic-analysis'],
  liquidity: ['client:/financial-modeling'],
  graduation: ['client:/performance'],
  reallocation: ['client:/portfolio'],
  'cash-flow-events': ['client:/lp-reporting/ledger'],
  'operating-object-tasks': ['client:/dashboard'],
  'kpi-observations': [
    'api:get:/api/funds/:fundId/kpi-observations',
    'api:get:/api/funds/:fundId/kpi-observations/:observationId',
    'api:post:/api/funds/:fundId/kpi-observations',
    'api:post:/api/funds/:fundId/kpi-observations/imports',
    'api:patch:/api/funds/:fundId/kpi-observations/:observationId/review',
  ],
  'deal-pipeline': ['client:/pipeline'],
  'cohort-analysis': ['client:/portfolio'],
  sensitivity: ['client:/sensitivity-analysis'],
  'lp-api': ['client:/lp/dashboard'],
  'lp-capital-calls': ['client:/lp/capital-account'],
  'lp-distributions': ['client:/lp/capital-account'],
  'lp-documents': ['client:/lp/reports'],
  'lp-notifications': ['client:/lp/settings'],
  'lp-reporting-imports': ['client:/lp-reporting/imports'],
  'lp-reporting-metric-runs': ['client:/lp-reporting/metrics'],
  backtesting: ['client:/performance'],
  'investment-ledger': [
    'api:post:/api/funds/:fundId/investment-ledger/financing-events',
    'api:post:/api/funds/:fundId/investment-ledger/financing-events/:eventId/tranches',
    'api:post:/api/funds/:fundId/investment-ledger/tranches/:trancheId/corrections',
    'api:post:/api/funds/:fundId/investment-ledger/tranches/:trancheId/participations',
    'api:post:/api/funds/:fundId/investment-ledger/tranches/:trancheId/ledger-corrections',
    'api:get:/api/funds/:fundId/investment-ledger/financing-events/:eventId',
    'api:get:/api/funds/:fundId/investment-ledger/positions',
    'api:post:/api/funds/:fundId/investment-ledger/position-events',
    'api:post:/api/funds/:fundId/investment-ledger/position-conversions',
    'api:post:/api/funds/:fundId/investment-ledger/position-corrections',
    'api:get:/api/funds/:fundId/investment-ledger/ownership-snapshots',
    'api:post:/api/funds/:fundId/investment-ledger/ownership-snapshots',
    'api:get:/api/funds/:fundId/investment-ledger/position-valuations',
    'api:post:/api/funds/:fundId/investment-ledger/position-valuations',
  ],
  'internal-economics': [
    'api:post:/api/funds/:fundId/internal-economics/runs',
    'api:get:/api/funds/:fundId/internal-economics/runs/:runId',
  ],
} as const satisfies Record<FinancialCommonApiRouteId, readonly string[]>;
