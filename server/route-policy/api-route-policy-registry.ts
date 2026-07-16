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
  'PRD #996 AC-1, AC-2, AC-3, D1, D2, and D3: Surface-A report-package export requires partner/admin role, denies empty-fundIds non-admin exports, requires metric-run workflow state locked or exported, and scopes visual watermarking out by ADR-027 because h9Stamp plus contentHash provide JSON/CSV hash attestation.';
const LP_REPORT_PACKAGE_EXPORT_STATUS_NOTE =
  'Readiness-metadata status GET (in-code Finding 8, ADR-040): partner/admin role, export-grant, and workflow-state gated, but intentionally H9-independent and non-exportable. It serves stored-export metadata only; the authoritative artifact GET re-validates H9 before any artifact bytes are served.';

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
    surface: 'marginal-reserve-moic-shadow-api',
    owner: 'analytics',
    telemetryKey: 'api.route.api.funds.fundId.moic.marginal.rankings',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'route_param_fund_id',
    workflowRequirement: 'shadow_review_required',
    exportPolicy: 'not_exportable',
    provenanceRequired: true,
    staleBlocksExport: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes:
      'Server-only flag gates this non-persistent shadow ranking surface; investment-team review remains required.',
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
    apiAuthBoundary: 'require_auth_fund_access_and_role',
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
    apiAuthBoundary: 'require_auth_fund_access_and_role',
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
    apiAuthBoundary: 'require_auth_fund_access_and_role',
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
    apiAuthBoundary: 'require_auth_fund_access_and_role',
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
    apiAuthBoundary: 'require_auth_fund_access_and_role',
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
    apiAuthBoundary: 'require_auth_fund_access_and_role',
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
    apiAuthBoundary: 'require_auth_fund_access_and_role',
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
    apiAuthBoundary: 'require_auth_fund_access_and_role',
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
} as const satisfies Record<FinancialCommonApiRouteId, readonly string[]>;
