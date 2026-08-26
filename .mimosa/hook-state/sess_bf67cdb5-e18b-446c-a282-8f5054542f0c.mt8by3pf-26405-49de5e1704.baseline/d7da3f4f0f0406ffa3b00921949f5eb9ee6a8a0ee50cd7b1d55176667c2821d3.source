import { describe, expect, it } from 'vitest';

import { FinancialProvenanceSchema } from '../../../shared/contracts/financial-provenance.contract';
import {
  buildPrototypeFinancialBlockedError,
  makeStaticTemplateProvenance,
  type PortfolioPrototypeRouteId,
} from '../../../server/lib/portfolio-prototype-block';
import { portfolioIntelligenceRouteClassifications } from '../../fixtures/portfolio-intelligence-route-classification';

const routeKey = (route: { method: string; path: string }) =>
  `${route.method.toUpperCase()} ${route.path}`;

function routeIdForPrototypeRoute(key: string): PortfolioPrototypeRouteId {
  switch (key) {
    case 'POST /api/portfolio/scenarios/compare':
      return 'portfolio.scenarios.compare';
    case 'POST /api/portfolio/scenarios/:id/simulate':
      return 'portfolio.scenario.simulate';
    case 'POST /api/portfolio/reserves/optimize':
      return 'portfolio.reserves.optimize';
    case 'POST /api/portfolio/reserves/backtest':
      return 'portfolio.reserves.backtest';
    case 'POST /api/portfolio/forecasts':
      return 'portfolio.forecasts.create';
    case 'POST /api/portfolio/forecasts/validate':
      return 'portfolio.forecasts.validate';
    case 'POST /api/portfolio/quick-scenario':
      return 'portfolio.quickScenario.create';
    case 'GET /api/portfolio/metrics/:scenarioId':
      return 'portfolio.metrics.read';
    default:
      throw new Error(`Missing prototype route id mapping for ${key}`);
  }
}

const prototypeRoutes = portfolioIntelligenceRouteClassifications.filter(
  (route) => route.classification === 'prototype_501'
);

const staticTemplateRoutes = portfolioIntelligenceRouteClassifications.filter(
  (route) => route.classification === 'static_template'
);

describe('prototype 501 provenance contract', () => {
  it('builds schema-valid non-actionable provenance for every prototype 501 route', () => {
    expect(prototypeRoutes.length).toBeGreaterThan(0);

    for (const route of prototypeRoutes) {
      const sourceRoute = routeKey(route);
      const error = buildPrototypeFinancialBlockedError({
        routeId: routeIdForPrototypeRoute(sourceRoute),
        sourceRoute,
      });

      expect(error).toMatchObject({
        error: 'not_implemented',
        code: 'PROTOTYPE_FINANCIAL_OUTPUT_BLOCKED',
      });
      expect(FinancialProvenanceSchema.parse(error.provenance)).toMatchObject({
        sourceKind: 'prototype_blocked',
        actionability: 'non_actionable',
        sourceRoute,
        isFinanciallyActionable: false,
        quarantineReason: 'prototype_financial_output_blocked',
      });
    }
  });

  it('builds schema-valid static template provenance without quarantine metadata', () => {
    expect(staticTemplateRoutes).toHaveLength(1);
    const [templateRoute] = staticTemplateRoutes;
    if (!templateRoute) {
      throw new Error('Expected a static template route classification');
    }

    const provenance = makeStaticTemplateProvenance(routeKey(templateRoute));

    expect(FinancialProvenanceSchema.parse(provenance)).toMatchObject({
      sourceKind: 'static_template',
      actionability: 'non_actionable',
      sourceRoute: 'GET /api/portfolio/templates',
      isFinanciallyActionable: false,
    });
    expect(provenance).not.toHaveProperty('quarantineReason');
  });
});
