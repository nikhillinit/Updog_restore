import {
  ROUTE_GOVERNANCE_REGISTRY,
  type RouteGovernanceEntry,
} from '../../client/src/app/route-governance-registry';
import {
  RoutePolicyEntrySchema,
  type FinancialSurface,
  type RoutePolicyEntry,
} from '../../shared/contracts/route-policy.contract';
import { portfolioIntelligenceRouteClassifications } from '../../tests/fixtures/portfolio-intelligence-route-classification';

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
  | 'staleBlocksRender'
  | 'humanReviewRequired'
  | 'performanceBudgetMs'
  | 'notes'
>;

type PortfolioIntelligenceRouteDecisionMap = {
  [Route in PortfolioIntelligenceClassificationEntry as `${Route['method']} ${Route['path']}`]: RoutePolicyDecision;
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

  if (entry.path === '/shared/:shareId') {
    return 'lp_reporting';
  }

  if (entry.path === '/reports') {
    return 'export_artifact';
  }

  if (entry.path === '/performance' || entry.path === '/moic-analysis') {
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    provenanceRequired: false,
    staleBlocksExport: false,
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
  },
  '/moic-analysis': {
    lifecycle: 'durable_crud',
    financialSurface: 'moic_reserves',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'parent_entity_lookup',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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

const PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_DECISIONS: Readonly<PortfolioIntelligenceRouteDecisionMap> = {
  'POST /api/portfolio/strategies': {
    lifecycle: 'durable_crud',
    financialSurface: 'portfolio_management',
    apiAuthBoundary: 'require_auth_and_fund_access',
    fundScopeMode: 'query_param_fund_id',
    workflowRequirement: 'fund_scope_verified',
    exportPolicy: 'not_exportable',
    provenanceRequired: false,
    staleBlocksExport: false,
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    provenanceRequired: false,
    staleBlocksExport: false,
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
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
    staleBlocksRender: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    notes: PROTOTYPE_ROUTE_NOTE,
  },
};

export const PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_KEYS = new Set<string>(
  Object.keys(PORTFOLIO_INTELLIGENCE_ROUTE_POLICY_DECISIONS)
);

export const EXPLICIT_API_ROUTE_POLICY_ENTRIES: RoutePolicyEntry[] = [];

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
