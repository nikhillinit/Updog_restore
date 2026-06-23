import { describe, expect, it } from 'vitest';

import { FinancialProvenanceSchema } from '../../../shared/contracts/financial-provenance.contract';
import type { RoutePolicyEntry } from '../../../shared/contracts/route-policy.contract';
import { ROUTE_GOVERNANCE_REGISTRY } from '../../../client/src/app/route-governance-registry';
import {
  ACTIVE_FINANCIAL_GOVERNANCE_ENTRIES,
  API_ROUTE_POLICY_REGISTRY,
  routePolicyKey,
} from '../../../server/route-policy/api-route-policy-registry';
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

function expectPolicy(key: string): RoutePolicyEntry {
  const entry = policyByKey.get(key);
  if (!entry) {
    throw new Error(`Missing route policy entry ${key}`);
  }
  return entry;
}

describe('route policy coverage', () => {
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
});
