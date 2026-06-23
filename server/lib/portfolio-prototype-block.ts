import type { FinancialProvenance } from '@shared/contracts/financial-provenance.contract';

export type PortfolioPrototypeRouteId =
  | 'portfolio.scenarios.compare'
  | 'portfolio.scenario.simulate'
  | 'portfolio.reserves.optimize'
  | 'portfolio.reserves.backtest'
  | 'portfolio.forecasts.create'
  | 'portfolio.forecasts.validate'
  | 'portfolio.quickScenario.create'
  | 'portfolio.metrics.read';

type BuildPrototypeBlockedInput = {
  routeId: PortfolioPrototypeRouteId;
  sourceRoute: string;
  replacement?: string;
};

export function makePrototypeBlockedProvenance(sourceRoute: string): FinancialProvenance {
  return {
    sourceKind: 'prototype_blocked',
    actionability: 'non_actionable',
    generatedAt: new Date().toISOString(),
    sourceRoute,
    isFinanciallyActionable: false,
    quarantineReason: 'prototype_financial_output_blocked',
    warnings: ['Prototype financial output route is disabled.'],
  };
}

export function buildPrototypeFinancialBlockedError(input: BuildPrototypeBlockedInput) {
  return {
    error: 'not_implemented',
    code: 'PROTOTYPE_FINANCIAL_OUTPUT_BLOCKED',
    routeId: input.routeId,
    message:
      'This route is disabled because it previously returned non-computed financial outputs.',
    ...(input.replacement ? { replacement: input.replacement } : {}),
    provenance: makePrototypeBlockedProvenance(input.sourceRoute),
  };
}

export function makeStaticTemplateProvenance(sourceRoute: string): FinancialProvenance {
  return {
    sourceKind: 'static_template',
    actionability: 'non_actionable',
    generatedAt: new Date().toISOString(),
    sourceRoute,
    isFinanciallyActionable: false,
    warnings: ['Static template values are not computed from fund data.'],
  };
}
