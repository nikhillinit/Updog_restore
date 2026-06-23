import {
  ROUTE_GOVERNANCE_REGISTRY,
  type RouteGovernanceEntry,
} from '../../client/src/app/route-governance-registry';
import {
  RoutePolicyEntrySchema,
  type ApiAuthBoundary,
  type ExportPolicy,
  type FinancialSurface,
  type FundScopeMode,
  type RouteLifecycle,
  type RoutePolicyEntry,
} from '../../shared/contracts/route-policy.contract';
import {
  portfolioIntelligenceRouteClassifications,
  type PortfolioIntelligenceRouteClassification,
} from '../../tests/fixtures/portfolio-intelligence-route-classification';

type PortfolioIntelligenceClassificationEntry =
  (typeof portfolioIntelligenceRouteClassifications)[number];

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

function authBoundaryForGovernanceEntry(
  entry: RouteGovernanceEntry,
  financialSurface: FinancialSurface
): ApiAuthBoundary {
  if (entry.path === '/shared/:shareId') {
    return 'signed_public_share';
  }

  if (entry.surface === 'lp-route') {
    return 'require_auth_and_lp_access';
  }

  if (financialSurface === 'export_artifact' || entry.path.startsWith('/lp-reporting')) {
    return 'require_auth_and_fund_access';
  }

  if (entry.isProtected) {
    return 'require_auth_and_fund_access';
  }

  return financialSurface === 'none' ? 'none_public' : 'require_auth';
}

function fundScopeModeForGovernanceEntry(
  entry: RouteGovernanceEntry,
  authBoundary: ApiAuthBoundary
): FundScopeMode {
  if (entry.path === '/shared/:shareId') {
    return 'share_token_scope';
  }

  if (entry.surface === 'lp-route') {
    return 'lp_claim_scope';
  }

  if (entry.path.includes(':fundId')) {
    return 'route_param_fund_id';
  }

  if (authBoundary === 'require_auth_and_fund_access') {
    return 'parent_entity_lookup';
  }

  return 'not_applicable';
}

function exportPolicyForGovernanceEntry(
  entry: RouteGovernanceEntry,
  financialSurface: FinancialSurface
): ExportPolicy {
  if (entry.path === '/shared/:shareId') {
    return 'preview_only';
  }

  if (financialSurface === 'export_artifact' || entry.path === '/lp/reports') {
    return 'qualified_exportable';
  }

  return 'not_exportable';
}

function workflowRequirementForGovernanceEntry(
  entry: RouteGovernanceEntry,
  authBoundary: ApiAuthBoundary
): string | null {
  if (authBoundary === 'require_auth_and_lp_access') {
    return 'lp_access_verified';
  }

  if (authBoundary === 'require_auth_and_fund_access') {
    return 'fund_scope_verified';
  }

  if (entry.path === '/shared/:shareId') {
    return 'share_token_verified';
  }

  return null;
}

function toGovernancePolicyEntry(entry: RouteGovernanceEntry): RoutePolicyEntry {
  const financialSurface = getFinancialSurfaceForGovernanceEntry(entry);
  const apiAuthBoundary = authBoundaryForGovernanceEntry(entry, financialSurface);
  const fundScopeMode = fundScopeModeForGovernanceEntry(entry, apiAuthBoundary);
  const exportPolicy = exportPolicyForGovernanceEntry(entry, financialSurface);

  return {
    id: `client:${entry.path}`,
    path: entry.path,
    lifecycle: 'durable_crud',
    governanceRef: entry.path,
    surface: entry.surface,
    owner: ownerForFinancialSurface(financialSurface),
    telemetryKey: telemetryKeyForRoute('client.route', entry.path),
    financialSurface,
    apiAuthBoundary,
    fundScopeMode,
    workflowRequirement: workflowRequirementForGovernanceEntry(entry, apiAuthBoundary),
    exportPolicy,
    provenanceRequired: false,
    staleBlocksExport: exportPolicy !== 'not_exportable',
    staleBlocksRender: financialSurface !== 'none',
    humanReviewRequired: financialSurface !== 'none',
    performanceBudgetMs: null,
    ...(entry.notes ? { notes: entry.notes } : {}),
  };
}

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

function financialSurfaceForPortfolioIntelligenceRoute(
  route: PortfolioIntelligenceClassificationEntry
): FinancialSurface {
  if (route.path.includes('/reserves') || route.path.includes('/metrics')) {
    return 'moic_reserves';
  }

  if (route.path.includes('/forecasts') || route.path.includes('/scenarios')) {
    return 'fund_modeling';
  }

  return 'portfolio_management';
}

function fundScopeModeForPortfolioIntelligenceRoute(
  route: PortfolioIntelligenceClassificationEntry
): FundScopeMode {
  if (route.path.includes(':fundId')) {
    return 'route_param_fund_id';
  }

  if (
    route.method === 'POST' &&
    (route.path === '/api/portfolio/strategies' ||
      route.path === '/api/portfolio/scenarios' ||
      route.path === '/api/portfolio/reserves/optimize' ||
      route.path === '/api/portfolio/forecasts')
  ) {
    return 'query_param_fund_id';
  }

  if (route.path === '/api/portfolio/templates') {
    return 'not_applicable';
  }

  return 'parent_entity_lookup';
}

function authBoundaryForPortfolioIntelligenceRoute(
  route: PortfolioIntelligenceClassificationEntry
): ApiAuthBoundary {
  return route.path === '/api/portfolio/templates'
    ? 'require_auth'
    : 'require_auth_and_fund_access';
}

function toPortfolioIntelligencePolicyEntry(
  route: PortfolioIntelligenceClassificationEntry
): RoutePolicyEntry {
  const financialSurface = financialSurfaceForPortfolioIntelligenceRoute(route);
  const apiAuthBoundary = authBoundaryForPortfolioIntelligenceRoute(route);
  const fundScopeMode = fundScopeModeForPortfolioIntelligenceRoute(route);
  const lifecycle = route.classification satisfies PortfolioIntelligenceRouteClassification;
  const workflowRequirement =
    route.classification === 'prototype_501'
      ? 'prototype_financial_output_blocked'
      : apiAuthBoundary === 'require_auth_and_fund_access'
        ? 'fund_scope_verified'
        : null;

  return {
    id: `api:${route.method.toLowerCase()}:${route.path}`,
    method: route.method.toUpperCase(),
    path: route.path,
    lifecycle: lifecycle as RouteLifecycle,
    governanceRef: governanceRefForPortfolioIntelligenceRoute(route),
    surface: 'portfolio-intelligence-api',
    owner: ownerForFinancialSurface(financialSurface),
    telemetryKey: telemetryKeyForRoute('api.route', route.path),
    financialSurface,
    apiAuthBoundary,
    fundScopeMode,
    workflowRequirement,
    exportPolicy: route.classification === 'static_template' ? 'preview_only' : 'not_exportable',
    provenanceRequired: route.classification !== 'durable_crud',
    staleBlocksExport: false,
    staleBlocksRender: true,
    humanReviewRequired: true,
    performanceBudgetMs: null,
    ...(route.classification === 'prototype_501'
      ? { notes: 'Prototype route must return 501 with non_actionable provenance.' }
      : {}),
  };
}

const routePolicyEntries: RoutePolicyEntry[] = [
  ...ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES.map(toGovernancePolicyEntry),
  ...portfolioIntelligenceRouteClassifications.map(toPortfolioIntelligencePolicyEntry),
];

export const API_ROUTE_POLICY_REGISTRY: RoutePolicyEntry[] =
  RoutePolicyEntrySchema.array().parse(routePolicyEntries);
