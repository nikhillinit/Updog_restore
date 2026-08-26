import type { FinancialProvenance } from '@shared/contracts/financial-provenance.contract';

const PROTOTYPE_BLOCKED_WARNING = 'Prototype financial output route is disabled.';
const STATIC_TEMPLATE_WARNING = 'Static template values are not computed from fund data.';
const PROTOTYPE_FINANCIAL_BLOCKED_MESSAGE =
  'This route is disabled because it previously returned non-computed financial outputs.';

export type PortfolioPrototypeRouteId =
  | 'portfolio.scenarios.compare'
  | 'portfolio.scenario.simulate'
  | 'portfolio.reserves.optimize'
  | 'portfolio.reserves.backtest'
  | 'portfolio.forecasts.create'
  | 'portfolio.forecasts.validate'
  | 'portfolio.quickScenario.create'
  | 'portfolio.metrics.read';

export type PrototypeBlockedProvenance = FinancialProvenance & {
  sourceKind: 'prototype_blocked';
  actionability: 'non_actionable';
  generatedAt: string;
  sourceRoute: string;
  isFinanciallyActionable: false;
  quarantineReason: 'prototype_financial_output_blocked';
  warnings: string[];
};

export type StaticTemplateProvenance = FinancialProvenance & {
  sourceKind: 'static_template';
  actionability: 'non_actionable';
  generatedAt: string;
  sourceRoute: string;
  isFinanciallyActionable: false;
  quarantineReason?: never;
  warnings: string[];
};

export type BuildPrototypeBlockedInput<
  RouteId extends PortfolioPrototypeRouteId = PortfolioPrototypeRouteId,
> = {
  routeId: RouteId;
  sourceRoute: string;
  replacement?: string;
};

export type PrototypeFinancialBlockedError<
  RouteId extends PortfolioPrototypeRouteId = PortfolioPrototypeRouteId,
> = {
  error: 'not_implemented';
  code: 'PROTOTYPE_FINANCIAL_OUTPUT_BLOCKED';
  routeId: RouteId;
  message: 'This route is disabled because it previously returned non-computed financial outputs.';
  replacement?: string;
  provenance: PrototypeBlockedProvenance;
};

export function makePrototypeBlockedProvenance(sourceRoute: string): PrototypeBlockedProvenance {
  return {
    sourceKind: 'prototype_blocked',
    actionability: 'non_actionable',
    generatedAt: new Date().toISOString(),
    sourceRoute,
    isFinanciallyActionable: false,
    quarantineReason: 'prototype_financial_output_blocked',
    warnings: [PROTOTYPE_BLOCKED_WARNING],
  };
}

export function buildPrototypeFinancialBlockedError<
  RouteId extends PortfolioPrototypeRouteId = PortfolioPrototypeRouteId,
>(input: BuildPrototypeBlockedInput<RouteId>): PrototypeFinancialBlockedError<RouteId> {
  return {
    error: 'not_implemented',
    code: 'PROTOTYPE_FINANCIAL_OUTPUT_BLOCKED',
    routeId: input.routeId,
    message: PROTOTYPE_FINANCIAL_BLOCKED_MESSAGE,
    ...(input.replacement ? { replacement: input.replacement } : {}),
    provenance: makePrototypeBlockedProvenance(input.sourceRoute),
  };
}

export function makeStaticTemplateProvenance(sourceRoute: string): StaticTemplateProvenance {
  return {
    sourceKind: 'static_template',
    actionability: 'non_actionable',
    generatedAt: new Date().toISOString(),
    sourceRoute,
    isFinanciallyActionable: false,
    warnings: [STATIC_TEMPLATE_WARNING],
  };
}
