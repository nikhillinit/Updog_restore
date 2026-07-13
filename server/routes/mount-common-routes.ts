import type { Express, Router } from 'express';

import {
  COMMON_API_ROUTE_MANIFEST,
  type CommonApiRouteId,
  type CommonRouteMountStage,
  getCommonRouteMountStage,
  type RuntimeSurface,
} from '../../shared/routes/api-route-manifest.js';
import allocationScenariosRouter from './allocation-scenarios.js';
import allocationsRouter from './allocations.js';
import authRouter from './auth.js';
import backtestingRouter from './backtesting.js';
import cashFlowEventsRouter from './cash-flow-events.js';
import capitalAllocationRouter from './capital-allocation.js';
import cohortAnalysisRouter from './cohort-analysis.js';
import dashboardSummaryRouter from './dashboard-summary.js';
import { dealPipelineRouter } from './deal-pipeline.js';
import dualForecastRouter from './dual-forecast.js';
import flagsRouter from './flags.js';
import fundActualsRouter from './fund-actuals.js';
import { registerFundConfigRoutes } from './fund-config.js';
import fundMetricsRouter from './fund-metrics.js';
import fundMoicRouter from './fund-moic.js';
import fundScenarioSetsRouter from './fund-scenario-sets.js';
import fundsRouter from './funds.js';
import graduationRouter from './graduation.js';
import investmentsRouter from './investments.js';
import liquidityRouter from './liquidity.js';
import lpApiRouter from './lp-api.js';
import lpCapitalCallsRouter from './lp-capital-calls.js';
import lpDistributionsRouter from './lp-distributions.js';
import lpDocumentsRouter from './lp-documents.js';
import lpNotificationsRouter from './lp-notifications.js';
import lpReportingImportsRouter from './lp-reporting/imports.js';
import lpReportingMetricRunsRouter from './lp-reporting/metric-runs.js';
import operatingObjectTasksRouter from './operating-object-tasks.js';
import performanceApiRouter from './performance-api.js';
import planningFmvOverridesRouter from './planning-fmv-overrides.js';
import portfolioLotsRouter from './portfolio/lots.js';
import portfolioCompaniesRouter from './portfolio-companies.js';
import portfolioOverviewRouter from './portfolio-overview.js';
import reallocationRouter from './reallocation.js';
import sensitivityRouter from './sensitivity.js';
import { publicSharesRouter, sharesRouter } from './shares.js';
import timelineRouter from './timeline.js';
import varianceRouter from './variance.js';

export type RouteMountImplementation = (app: Express) => void;

function mountRouter(app: Express, mountPath: string | null, router: Router): void {
  if (mountPath === null) {
    app.use(router);
    return;
  }

  app.use(mountPath, router);
}

function at(mountPath: string | null, router: Router): RouteMountImplementation {
  return (app) => mountRouter(app, mountPath, router);
}

export const COMMON_ROUTE_IMPLEMENTATIONS: Record<CommonApiRouteId, RouteMountImplementation> = {
  auth: at(null, authRouter),
  flags: at('/api/flags', flagsRouter),
  'dual-forecast': at('/api', dualForecastRouter),
  'dashboard-summary': at('/api', dashboardSummaryRouter),
  'fund-actuals': at('/api', fundActualsRouter),
  funds: at('/api', fundsRouter),
  'fund-metrics': at(null, fundMetricsRouter),
  investments: at('/api', investmentsRouter),
  'portfolio-companies': at('/api', portfolioCompaniesRouter),
  'portfolio-overview': at('/api', portfolioOverviewRouter),
  'portfolio-lots': at('/api', portfolioLotsRouter),
  'performance-api': at(null, performanceApiRouter),
  variance: at('/', varianceRouter),
  'fund-config': (app) => registerFundConfigRoutes(app),
  allocations: at('/api', allocationsRouter),
  'allocation-scenarios': at('/api', allocationScenariosRouter),
  'planning-fmv-overrides': at('/api', planningFmvOverridesRouter),
  'fund-scenario-sets': at('/api', fundScenarioSetsRouter),
  'fund-moic': at('/api', fundMoicRouter),
  timeline: at('/api/timeline', timelineRouter),
  shares: at('/api/shares', sharesRouter),
  'public-shares': at('/api/public/shares', publicSharesRouter),
  'capital-allocation': at('/api/capital-allocation', capitalAllocationRouter),
  liquidity: at('/api/liquidity', liquidityRouter),
  graduation: at('/api/graduation', graduationRouter),
  reallocation: at(null, reallocationRouter),
  'cash-flow-events': at(null, cashFlowEventsRouter),
  'operating-object-tasks': at(null, operatingObjectTasksRouter),
  'deal-pipeline': at('/api/deals', dealPipelineRouter),
  'cohort-analysis': at('/api/cohorts', cohortAnalysisRouter),
  sensitivity: at('/api', sensitivityRouter),
  'lp-api': at(null, lpApiRouter),
  'lp-capital-calls': at(null, lpCapitalCallsRouter),
  'lp-distributions': at(null, lpDistributionsRouter),
  'lp-documents': at('/api/lp', lpDocumentsRouter),
  'lp-notifications': at('/api/lp', lpNotificationsRouter),
  'lp-reporting-imports': at(null, lpReportingImportsRouter),
  'lp-reporting-metric-runs': at(null, lpReportingMetricRunsRouter),
  backtesting: at('/api/backtesting', backtestingRouter),
} satisfies Record<CommonApiRouteId, RouteMountImplementation>;

export const MIGRATED_COMMON_ROUTE_IDS = [
  'auth',
  'flags',
  'dual-forecast',
  'dashboard-summary',
  'fund-actuals',
  'funds',
  'fund-metrics',
  'fund-config',
  'investments',
  'portfolio-companies',
  'portfolio-overview',
  'portfolio-lots',
  'allocations',
  'allocation-scenarios',
  'planning-fmv-overrides',
  'reallocation',
  'cash-flow-events',
  'operating-object-tasks',
  'deal-pipeline',
  'performance-api',
  'shares',
  'public-shares',
  'lp-api',
  'lp-capital-calls',
  'lp-distributions',
  'lp-documents',
  'lp-notifications',
  'lp-reporting-imports',
  'lp-reporting-metric-runs',
  'variance',
  'fund-scenario-sets',
  'fund-moic',
  'timeline',
  'capital-allocation',
  'liquidity',
  'graduation',
  'cohort-analysis',
  'sensitivity',
  'backtesting',
] as const satisfies readonly CommonApiRouteId[];

const REGISTER_ROUTES_COMMON_ORDER = [
  'funds',
  'deal-pipeline',
  'cohort-analysis',
  'flags',
  'auth',
  'dashboard-summary',
  'investments',
  'portfolio-companies',
  'portfolio-overview',
  'portfolio-lots',
  'allocation-scenarios',
  'planning-fmv-overrides',
  'fund-scenario-sets',
  'fund-actuals',
  'allocations',
  'backtesting',
  'sensitivity',
  'fund-moic',
  'graduation',
  'capital-allocation',
  'liquidity',
  'reallocation',
  'cash-flow-events',
  'operating-object-tasks',
  'fund-metrics',
  'dual-forecast',
  'performance-api',
  'lp-api',
  'lp-capital-calls',
  'lp-distributions',
  'lp-documents',
  'lp-notifications',
  'lp-reporting-imports',
  'lp-reporting-metric-runs',
  'shares',
  'public-shares',
  'fund-config',
  'variance',
  'timeline',
] as const satisfies readonly CommonApiRouteId[];

interface MountCommonRoutesOptions {
  surface: RuntimeSurface;
  stage?: CommonRouteMountStage;
}

export function mountCommonRoutes(app: Express, options: MountCommonRoutesOptions): void {
  const migratedRouteIds = new Set<CommonApiRouteId>(MIGRATED_COMMON_ROUTE_IDS);
  const routeOrder =
    options.surface === 'make_app'
      ? COMMON_API_ROUTE_MANIFEST.map(({ id }) => id)
      : REGISTER_ROUTES_COMMON_ORDER;

  for (const routeId of routeOrder) {
    if (!migratedRouteIds.has(routeId)) continue;

    const entry = COMMON_API_ROUTE_MANIFEST.find(({ id }) => id === routeId);
    if (!entry) {
      throw new Error(`Missing common API route manifest entry: ${routeId}`);
    }
    if (options.stage && getCommonRouteMountStage(entry) !== options.stage) continue;

    COMMON_ROUTE_IMPLEMENTATIONS[routeId](app);
  }
}
