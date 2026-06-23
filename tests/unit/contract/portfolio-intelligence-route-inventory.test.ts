import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { portfolioIntelligenceRouteClassifications } from '../../fixtures/portfolio-intelligence-route-classification';

const portfolioIntelligenceSource = fs.readFileSync(
  path.join(process.cwd(), 'server', 'routes', 'portfolio-intelligence.ts'),
  'utf8'
);

const routePattern =
  /router\[['"`](get|post|put|delete)['"`]\]\(\s*['"`]([^'"`]+)['"`]/g;

const routeKey = (route: { method: string; path: string }) =>
  `${route.method.toUpperCase()} ${route.path}`;

const actualRouteKeys = [...portfolioIntelligenceSource.matchAll(routePattern)]
  .map((match) => {
    const [, method, routePath] = match;

    if (!method || !routePath) {
      throw new Error('Unable to parse portfolio intelligence route declaration');
    }

    return routeKey({ method, path: routePath });
  })
  .sort();

const classifiedRouteKeys = portfolioIntelligenceRouteClassifications.map(routeKey).sort();

const prototypeRouteKeys = portfolioIntelligenceRouteClassifications
  .filter((route) => route.classification === 'prototype_501')
  .map(routeKey)
  .sort();

const staticTemplateRouteKeys = portfolioIntelligenceRouteClassifications
  .filter((route) => route.classification === 'static_template')
  .map(routeKey)
  .sort();

const durableCrudRouteKeys = portfolioIntelligenceRouteClassifications
  .filter((route) => route.classification === 'durable_crud')
  .map(routeKey)
  .sort();

describe('Portfolio Intelligence route classification inventory', () => {
  it('classifies every route declared in server/routes/portfolio-intelligence.ts', () => {
    expect(actualRouteKeys.length).toBeGreaterThan(0);
    expect(classifiedRouteKeys).toEqual(actualRouteKeys);
    expect(new Set(classifiedRouteKeys).size).toBe(classifiedRouteKeys.length);
  });

  it('keeps the prototype 501 route set explicit', () => {
    expect(prototypeRouteKeys).toEqual([
      'GET /api/portfolio/metrics/:scenarioId',
      'POST /api/portfolio/forecasts',
      'POST /api/portfolio/forecasts/validate',
      'POST /api/portfolio/quick-scenario',
      'POST /api/portfolio/reserves/backtest',
      'POST /api/portfolio/reserves/optimize',
      'POST /api/portfolio/scenarios/:id/simulate',
      'POST /api/portfolio/scenarios/compare',
    ]);
  });

  it('keeps static template classification scoped to the template endpoint', () => {
    expect(staticTemplateRouteKeys).toEqual(['GET /api/portfolio/templates']);
  });

  it('keeps at least one durable CRUD route classified', () => {
    expect(durableCrudRouteKeys.length).toBeGreaterThan(0);
  });
});
