export type PortfolioIntelligenceRouteClassification =
  | 'durable_crud'
  | 'prototype_501'
  | 'static_template';

export const portfolioIntelligenceRouteClassifications = [
  {
    method: 'POST',
    path: '/api/portfolio/strategies',
    classification: 'durable_crud',
  },
  {
    method: 'GET',
    path: '/api/portfolio/strategies/:fundId',
    classification: 'durable_crud',
  },
  {
    method: 'PUT',
    path: '/api/portfolio/strategies/:id',
    classification: 'durable_crud',
  },
  {
    method: 'DELETE',
    path: '/api/portfolio/strategies/:id',
    classification: 'durable_crud',
  },
  {
    method: 'POST',
    path: '/api/portfolio/scenarios',
    classification: 'durable_crud',
  },
  {
    method: 'GET',
    path: '/api/portfolio/scenarios/:fundId',
    classification: 'durable_crud',
  },
  {
    method: 'POST',
    path: '/api/portfolio/scenarios/compare',
    classification: 'prototype_501',
  },
  {
    method: 'POST',
    path: '/api/portfolio/scenarios/:id/simulate',
    classification: 'prototype_501',
  },
  {
    method: 'POST',
    path: '/api/portfolio/reserves/optimize',
    classification: 'prototype_501',
  },
  {
    method: 'GET',
    path: '/api/portfolio/reserves/strategies/:fundId',
    classification: 'durable_crud',
  },
  {
    method: 'POST',
    path: '/api/portfolio/reserves/backtest',
    classification: 'prototype_501',
  },
  {
    method: 'POST',
    path: '/api/portfolio/forecasts',
    classification: 'prototype_501',
  },
  {
    method: 'GET',
    path: '/api/portfolio/forecasts/:scenarioId',
    classification: 'durable_crud',
  },
  {
    method: 'POST',
    path: '/api/portfolio/forecasts/validate',
    classification: 'prototype_501',
  },
  {
    method: 'GET',
    path: '/api/portfolio/templates',
    classification: 'static_template',
  },
  {
    method: 'POST',
    path: '/api/portfolio/quick-scenario',
    classification: 'prototype_501',
  },
  {
    method: 'GET',
    path: '/api/portfolio/metrics/:scenarioId',
    classification: 'prototype_501',
  },
] as const satisfies ReadonlyArray<{
  method: string;
  path: string;
  classification: PortfolioIntelligenceRouteClassification;
}>;
