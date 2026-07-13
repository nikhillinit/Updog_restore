import { describe, expect, it } from 'vitest';

import { FinancialProvenanceSchema } from '../../../shared/contracts/financial-provenance.contract';
import type { RoutePolicyEntry } from '../../../shared/contracts/route-policy.contract';
import { ROUTE_GOVERNANCE_REGISTRY } from '../../../shared/routes/route-governance-registry';
import {
  ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES,
  API_ROUTE_POLICY_REGISTRY,
  routePolicyKey,
} from '../../../server/route-policy/api-route-policy-registry';
import {
  defaultRoutePolicyVerificationInput,
  verifyRoutePolicy,
} from '../../../scripts/verify-route-policy';
import {
  buildPrototypeFinancialBlockedError,
  type PortfolioPrototypeRouteId,
} from '../../../server/lib/portfolio-prototype-block';
import { portfolioIntelligenceRouteClassifications } from '../../fixtures/portfolio-intelligence-route-classification';

type PrototypeRouteKey = `${string} ${string}`;

const prototypeRouteIds: Record<PrototypeRouteKey, PortfolioPrototypeRouteId> = {
  'POST /api/portfolio/scenarios/compare': 'portfolio.scenarios.compare',
  'POST /api/portfolio/scenarios/:id/simulate': 'portfolio.scenario.simulate',
  'POST /api/portfolio/reserves/optimize': 'portfolio.reserves.optimize',
  'POST /api/portfolio/reserves/backtest': 'portfolio.reserves.backtest',
  'POST /api/portfolio/forecasts': 'portfolio.forecasts.create',
  'POST /api/portfolio/forecasts/validate': 'portfolio.forecasts.validate',
  'POST /api/portfolio/quick-scenario': 'portfolio.quickScenario.create',
  'GET /api/portfolio/metrics/:scenarioId': 'portfolio.metrics.read',
};

function routeKey(route: { method: string; path: string }): string {
  return `${route.method.toUpperCase()} ${route.path}`;
}

const policyByKey = new Map(
  API_ROUTE_POLICY_REGISTRY.map((entry) => [routePolicyKey(entry), entry])
);

const LP_REPORT_PACKAGE_EXPORT_POLICY_KEYS = [
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/export/json',
  'POST /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json/artifact',
  'POST /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv',
  'GET /api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv/artifact',
] as const;

function expectPolicy(key: string): RoutePolicyEntry {
  const entry = policyByKey.get(key);
  if (!entry) {
    throw new Error(`Missing route policy entry ${key}`);
  }
  return entry;
}

describe('route policy coverage', () => {
  it('passes the shared route-policy verifier for the checked-in registry', () => {
    expect(verifyRoutePolicy()).toEqual([]);
  });

  it('covers every active financial governance route', () => {
    expect(ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES.length).toBeGreaterThan(0);

    for (const governanceEntry of ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES) {
      const policyEntry = expectPolicy(governanceEntry.path);

      expect(policyEntry.method).toBeUndefined();
      expect(policyEntry.governanceRef).toBe(governanceEntry.path);
      expect(policyEntry.financialSurface).not.toBe('none');
    }
  });

  it('does not treat client route protection as API auth or fund scope', () => {
    const governanceByPath = new Map(ROUTE_GOVERNANCE_REGISTRY.map((entry) => [entry.path, entry]));

    for (const policyEntry of API_ROUTE_POLICY_REGISTRY.filter(
      (entry) => entry.financialSurface !== 'none'
    )) {
      const governanceEntry = governanceByPath.get(policyEntry.governanceRef);
      expect(governanceEntry, policyEntry.governanceRef).toBeDefined();

      if (!governanceEntry?.isProtected) {
        continue;
      }

      expect(policyEntry.apiAuthBoundary, routePolicyKey(policyEntry)).not.toBe('none_public');
      expect(policyEntry.fundScopeMode, routePolicyKey(policyEntry)).not.toBe('none');
    }
  });

  it('covers LP financial routes with the LP auth boundary', () => {
    const lpGovernanceEntries = ROUTE_GOVERNANCE_REGISTRY.filter(
      (entry) => entry.surface === 'lp-route'
    );

    expect(lpGovernanceEntries.length).toBeGreaterThan(0);

    for (const governanceEntry of lpGovernanceEntries) {
      const policyEntry = expectPolicy(governanceEntry.path);

      expect(policyEntry.financialSurface).toBe('lp_reporting');
      expect(policyEntry.apiAuthBoundary).toBe('require_auth_and_lp_access');
      expect(policyEntry.fundScopeMode).toBe('lp_claim_scope');
    }
  });

  it('maps portfolio-intelligence prototype routes to 501 non-actionable provenance', () => {
    const prototypeRoutes = portfolioIntelligenceRouteClassifications.filter(
      (route) => route.classification === 'prototype_501'
    );

    expect(prototypeRoutes.length).toBeGreaterThan(0);

    for (const route of prototypeRoutes) {
      const key = routeKey(route);
      const policyEntry = expectPolicy(key);
      const routeId = prototypeRouteIds[key as PrototypeRouteKey];

      expect(policyEntry.lifecycle).toBe('prototype_501');
      expect(policyEntry.provenanceRequired).toBe(true);
      expect(policyEntry.financialSurface).not.toBe('none');
      if (!routeId) {
        throw new Error(`Missing prototype route id for ${key}`);
      }

      const blockedError = buildPrototypeFinancialBlockedError({
        routeId,
        sourceRoute: key,
      });
      const provenance = FinancialProvenanceSchema.parse(blockedError.provenance);

      expect(blockedError.error).toBe('not_implemented');
      expect(provenance.actionability).toBe('non_actionable');
      expect(provenance.isFinanciallyActionable).toBe(false);
    }
  });

  it('covers the portfolio overview API route with query-scoped fund access', () => {
    const policyEntry = expectPolicy('GET /api/portfolio-overview');

    expect(policyEntry.governanceRef).toBe('/portfolio');
    expect(policyEntry.financialSurface).toBe('portfolio_management');
    expect(policyEntry.apiAuthBoundary).toBe('require_auth_and_fund_access');
    expect(policyEntry.fundScopeMode).toBe('query_param_fund_id');
    expect(policyEntry.workflowRequirement).toBe('fund_scope_verified');
    expect(policyEntry.provenanceRequired).toBe(true);
  });

  it('classifies the Round FMV actuals facts route as non-exportable fund modeling input', () => {
    const policy = expectPolicy('GET /api/funds/:fundId/actuals/facts');

    expect(policy.financialSurface).toBe('fund_modeling');
    expect(policy.apiAuthBoundary).toBe('require_auth_and_fund_access');
    expect(policy.fundScopeMode).toBe('route_param_fund_id');
    expect(policy.exportPolicy).toBe('not_exportable');
    expect(policy.provenanceRequired).toBe(true);
  });

  it('classifies from-seed case creation as a fund-scoped provenance mutation', () => {
    const policy = expectPolicy(
      'POST /api/funds/:fundId/scenario-analysis/scenarios/:scenarioId/cases/from-seed'
    );

    expect(policy.governanceRef).toBe('/fund-model-results/:fundId/scenarios');
    expect(policy.financialSurface).toBe('fund_modeling');
    expect(policy.apiAuthBoundary).toBe('require_auth_and_fund_access');
    expect(policy.fundScopeMode).toBe('route_param_fund_id');
    expect(policy.exportPolicy).toBe('not_exportable');
    expect(policy.provenanceRequired).toBe(true);
  });

  it('covers PRD #996 Surface-A report-package exports with role-gated fund access', () => {
    for (const key of LP_REPORT_PACKAGE_EXPORT_POLICY_KEYS) {
      const policyEntry = expectPolicy(key);

      expect(policyEntry.apiAuthBoundary, key).toBe('require_auth_fund_access_and_role');
      expect(policyEntry.financialSurface, key).toBe('lp_reporting');
      expect(policyEntry.fundScopeMode, key).toBe('route_param_fund_id');
      expect(policyEntry.exportPolicy, key).toBe('qualified_exportable');
      expect(policyEntry.provenanceRequired, key).toBe(true);
      expect(policyEntry.staleBlocksExport, key).toBe(true);
      expect(policyEntry.workflowRequirement, key).toBe('metric_run_locked_or_exported');
    }
  });

  it('fails verification when an active financial governance route has no explicit policy', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      activeFinancialGovernanceEntries: [
        ...defaultRoutePolicyVerificationInput.activeFinancialGovernanceEntries,
        {
          path: '/synthetic-financial-route',
          surface: 'app-route',
          exposure: 'internal-live',
          isProtected: true,
        },
      ],
    });

    expect(errors).toContain('Missing active financial route policy: /synthetic-financial-route');
  });

  it('fails verification when a scoped financial route downgrades API auth', () => {
    const mutatedPolicyEntries = API_ROUTE_POLICY_REGISTRY.map((entry) =>
      routePolicyKey(entry) === '/portfolio'
        ? { ...entry, apiAuthBoundary: 'require_auth' as const }
        : entry
    );

    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      policyEntries: mutatedPolicyEntries,
    });

    expect(errors).toContain(
      'Policy /portfolio does not declare API-side fund, LP, or share scope'
    );
  });

  it('fails verification when a portfolio-intelligence fixture route lacks an explicit override', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      portfolioIntelligenceRouteClassifications: [
        ...defaultRoutePolicyVerificationInput.portfolioIntelligenceRouteClassifications,
        {
          method: 'GET',
          path: '/api/portfolio/synthetic',
          classification: 'durable_crud',
        },
      ],
    });

    expect(errors).toContain(
      'Missing explicit portfolio-intelligence route policy override: GET /api/portfolio/synthetic'
    );
  });

  it('fails verification when a financial common route loses policy coverage', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      commonRoutePolicyIds: {
        ...defaultRoutePolicyVerificationInput.commonRoutePolicyIds,
        'fund-moic': [],
      },
    });

    expect(errors).toContain('Missing route policy coverage for common financial route: fund-moic');
  });

  it('fails verification when common-route coverage references a missing policy id', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      commonRoutePolicyIds: {
        ...defaultRoutePolicyVerificationInput.commonRoutePolicyIds,
        'fund-moic': ['api:get:/api/funds/:fundId/moic/missing'],
      },
    });

    expect(errors).toContain(
      'Common route fund-moic references missing route policy id: api:get:/api/funds/:fundId/moic/missing'
    );
  });

  it('fails verification when route schema metadata names an uncovered table', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      commonApiRoutes: defaultRoutePolicyVerificationInput.commonApiRoutes.map((entry) =>
        entry.id === 'fund-moic'
          ? {
              ...entry,
              schemaTables: [...entry.schemaTables, 'missing_route_table'],
            }
          : entry
      ),
    });

    expect(errors).toContain(
      'Common route fund-moic references table missing from the production schema registry: missing_route_table'
    );
  });

  it('fails verification when a C1 table is absent from route schema metadata', () => {
    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      commonApiRoutes: defaultRoutePolicyVerificationInput.commonApiRoutes.map((entry) =>
        entry.id === 'fund-moic'
          ? {
              ...entry,
              migrationParity: {
                kind: 'c1' as const,
                tables: [...entry.migrationParity.tables, 'missing_route_table'],
              },
            }
          : entry
      ),
    });

    expect(errors).toContain(
      'Common route fund-moic C1 table is missing from route schema metadata: missing_route_table'
    );
  });

  it('fails verification when a C1 table loses reconciliation-manifest coverage', () => {
    const productionReconciliationTables = new Set(
      defaultRoutePolicyVerificationInput.productionReconciliationTables
    );
    productionReconciliationTables.delete('reconciliation_runs');

    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      productionReconciliationTables,
    });

    expect(errors).toContain(
      'Common route fund-moic C1 table is missing from production reconciliation manifests: reconciliation_runs'
    );
  });

  it('fails verification when a runtime-specific route loses its reason', () => {
    const [firstRoute, ...remainingRoutes] =
      defaultRoutePolicyVerificationInput.runtimeSpecificRoutes;
    if (!firstRoute) throw new Error('Expected at least one runtime-specific route');

    const errors = verifyRoutePolicy({
      ...defaultRoutePolicyVerificationInput,
      runtimeSpecificRoutes: [{ ...firstRoute, reason: '' }, ...remainingRoutes],
    });

    expect(errors).toContain(`Runtime-specific route ${firstRoute.id} is missing a reason`);
  });
});
