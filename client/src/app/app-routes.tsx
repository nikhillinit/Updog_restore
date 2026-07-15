import React from 'react';
import {
  APP_ROUTE_DEFINITIONS,
  LP_ROUTE_DEFINITIONS,
  type AppRouteDefinition,
  type LPRouteDefinition,
} from '@shared/routes/app-route-definitions';

export {
  ADMIN_GATED_ROUTES,
  ARCHIVED_PLACEHOLDER_ROUTES,
  LEGACY_REDIRECT_ROUTES,
  LP_INDEX_REDIRECT_PATH,
  LP_INDEX_REDIRECT_TARGET,
  PUBLIC_ENTRY_ROUTES,
} from '@shared/routes/app-route-definitions';
export type { ArchivedPlaceholderRouteEntry } from '@shared/routes/app-route-definitions';

// Page components - Heavy routes lazy loaded for bundle optimization
const Dashboard = React.lazy(() => import('@/pages/dashboard'));
const Portfolio = React.lazy(() => import('@/pages/portfolio'));
const PortfolioCompanySummary = React.lazy(() => import('@/pages/portfolio-company-summary'));
const PerformancePage = React.lazy(() => import('@/pages/performance'));
// Lazy load non-critical routes for bundle optimization
const FundSetup = React.lazy(() => import('@/pages/fund-setup'));
const Reports = React.lazy(() => import('@/pages/reports'));
const VarianceTrackingPage = React.lazy(() => import('@/pages/variance-tracking'));
export const NotFound = React.lazy(() => import('@/pages/not-found'));
// Fund Model Results (post-wizard output)
const FundModelResults = React.lazy(() => import('@/pages/fund-model-results'));
const FundScenarioWorkspace = React.lazy(() => import('@/pages/fund-scenario-workspace'));
const FundModelResultsMoicAnalysis = React.lazy(
  () => import('@/pages/fund-model-results-moic-analysis')
);
const FundModelResultsReports = React.lazy(() => import('@/pages/fund-model-results-reports'));
const FinancialModelingPage = React.lazy(() => import('@/pages/financial-modeling'));
const ForecastingPage = React.lazy(() => import('@/pages/forecasting'));
const ModelResultsPage = React.lazy(() => import('@/pages/model-results'));
const SensitivityAnalysisPage = React.lazy(() => import('@/pages/sensitivity-analysis'));
// LP Sharing
export const SharedDashboard = React.lazy(() => import('@/pages/shared-dashboard'));
// New IA pages (Codex-validated restructure)
const PipelinePage = React.lazy(() => import('@/pages/pipeline'));
const SettingsPage = React.lazy(() => import('@/pages/settings'));
const HelpPage = React.lazy(() => import('@/pages/help'));
// LP Reporting
const LpReportingLedgerPage = React.lazy(() =>
  import('@/pages/lp-reporting').then((mod) => ({ default: mod.LpReportingLedgerPage }))
);
const LpReportingValuationsPage = React.lazy(() =>
  import('@/pages/lp-reporting').then((mod) => ({ default: mod.LpReportingValuationsPage }))
);
const LpReportingMetricsPage = React.lazy(() =>
  import('@/pages/lp-reporting').then((mod) => ({ default: mod.LpReportingMetricsPage }))
);
const LpReportingImportsPage = React.lazy(() =>
  import('@/pages/lp-reporting').then((mod) => ({ default: mod.LpReportingImportsPage }))
);
// LP Reporting Dashboard
const LPDashboard = React.lazy(() => import('@/pages/lp/dashboard'));
const LPFundDetail = React.lazy(() => import('@/pages/lp/fund-detail'));
const LPCapitalAccount = React.lazy(() => import('@/pages/lp/capital-account'));
const LPPerformance = React.lazy(() => import('@/pages/lp/performance'));
const LPReports = React.lazy(() => import('@/pages/lp/reports'));
const LPSettings = React.lazy(() => import('@/pages/lp/settings'));
// Admin pages
export const UICatalog = React.lazy(() => import('@/pages/admin/ui-catalog'));
// Portal pages (LP Portal scaffolding)
export const PortalAccessDenied = React.lazy(() => import('@/pages/portal/access-denied'));

export interface AppRouteEntry extends AppRouteDefinition {
  component: React.ComponentType<Record<string, unknown>>;
}

const APP_ROUTE_COMPONENTS: Record<
  (typeof APP_ROUTE_DEFINITIONS)[number]['path'],
  React.ComponentType<Record<string, unknown>>
> = {
  '/fund-setup': FundSetup,
  '/dashboard': Dashboard,
  '/portfolio/company/:id': PortfolioCompanySummary,
  '/portfolio': Portfolio,
  '/performance': PerformancePage,
  '/forecasting': ForecastingPage,
  '/financial-modeling': FinancialModelingPage,
  '/model-results': ModelResultsPage,
  '/fund-model-results/:fundId/scenarios': FundScenarioWorkspace,
  '/fund-model-results/:fundId/moic-analysis': FundModelResultsMoicAnalysis,
  '/fund-model-results/:fundId/reports': FundModelResultsReports,
  '/fund-model-results/:fundId': FundModelResults,
  '/sensitivity-analysis': SensitivityAnalysisPage,
  '/reports': Reports,
  '/variance-tracking': VarianceTrackingPage,
  '/pipeline': PipelinePage,
  '/lp-reporting/ledger': LpReportingLedgerPage,
  '/lp-reporting/valuations': LpReportingValuationsPage,
  '/lp-reporting/metrics': LpReportingMetricsPage,
  '/lp-reporting/imports': LpReportingImportsPage,
  '/settings': SettingsPage,
  '/help': HelpPage,
};

export const APP_ROUTES: AppRouteEntry[] = APP_ROUTE_DEFINITIONS.map((route) => ({
  ...route,
  component: APP_ROUTE_COMPONENTS[route.path],
}));

export interface LPRouteEntry extends LPRouteDefinition {
  component: React.ComponentType;
}

const LP_ROUTE_COMPONENTS: Record<
  (typeof LP_ROUTE_DEFINITIONS)[number]['path'],
  React.ComponentType
> = {
  '/lp/dashboard': LPDashboard,
  '/lp/fund-detail/:fundId': LPFundDetail,
  '/lp/capital-account': LPCapitalAccount,
  '/lp/performance': LPPerformance,
  '/lp/reports': LPReports,
  '/lp/settings': LPSettings,
};

export const LP_ROUTES: LPRouteEntry[] = LP_ROUTE_DEFINITIONS.map((route) => ({
  ...route,
  component: LP_ROUTE_COMPONENTS[route.path],
}));

export function PageLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pov-charcoal mx-auto mb-4"></div>
        <p className="text-charcoal-600">Loading page...</p>
      </div>
    </div>
  );
}
