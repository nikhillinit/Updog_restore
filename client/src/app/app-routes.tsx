import React from 'react';

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
const FinancialModelingPage = React.lazy(() => import('@/pages/financial-modeling'));
const ForecastingPage = React.lazy(() => import('@/pages/forecasting'));
const ModelResultsPage = React.lazy(() => import('@/pages/model-results'));
const SensitivityAnalysisPage = React.lazy(() => import('@/pages/sensitivity-analysis'));
const ReservesDemo = React.lazy(() => import('@/pages/reserves-demo'));
const AllocationManager = React.lazy(() => import('@/pages/allocation-manager'));
const CashManagement = React.lazy(() => import('@/pages/cash-management'));
const PortfolioAnalytics = React.lazy(() => import('@/pages/portfolio-analytics'));
const CapTables = React.lazy(() => import('@/pages/CapTables'));
// LP Sharing
export const SharedDashboard = React.lazy(() => import('@/pages/shared-dashboard'));
// New IA pages (Codex-validated restructure)
const PipelinePage = React.lazy(() => import('@/pages/pipeline'));
const SettingsPage = React.lazy(() => import('@/pages/settings'));
const HelpPage = React.lazy(() => import('@/pages/help'));
// LP Reporting (Phase 1b) -- placeholder pages
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

// Press On Ventures v2 design philosophy reference screens (full-screen, bypasses AppLayout)
export const TodayV2 = React.lazy(() => import('@/pages/v2/today'));
export const PortfolioV2 = React.lazy(() => import('@/pages/v2/portfolio'));
export const CompanyV2 = React.lazy(() => import('@/pages/v2/company'));
export const ScenariosV2 = React.lazy(() => import('@/pages/v2/scenarios'));
export const CashV2 = React.lazy(() => import('@/pages/v2/cash'));
export const ExitsV2 = React.lazy(() => import('@/pages/v2/exits'));
export const InsightsV2 = React.lazy(() => import('@/pages/v2/insights'));
export const PartnersV2 = React.lazy(() => import('@/pages/v2/partners'));

export interface AppRouteEntry {
  path: string;
  component: React.ComponentType<Record<string, unknown>>;
  isProtected?: boolean;
}

export const APP_ROUTES: AppRouteEntry[] = [
  { path: '/fund-setup', component: FundSetup },
  { path: '/dashboard', component: Dashboard, isProtected: true },
  { path: '/portfolio/company/:id', component: PortfolioCompanySummary, isProtected: true },
  { path: '/portfolio', component: Portfolio, isProtected: true },
  { path: '/performance', component: PerformancePage, isProtected: true },
  { path: '/forecasting', component: ForecastingPage, isProtected: true },
  { path: '/financial-modeling', component: FinancialModelingPage, isProtected: true },
  { path: '/model-results', component: ModelResultsPage, isProtected: true },
  { path: '/fund-model-results/:fundId/scenarios', component: FundScenarioWorkspace, isProtected: true },
  { path: '/fund-model-results/:fundId', component: FundModelResults, isProtected: true },
  { path: '/sensitivity-analysis', component: SensitivityAnalysisPage, isProtected: true },
  { path: '/allocation-manager', component: AllocationManager, isProtected: true },
  { path: '/cash-management', component: CashManagement, isProtected: true },
  { path: '/portfolio-analytics', component: PortfolioAnalytics, isProtected: true },
  { path: '/cap-tables', component: CapTables, isProtected: true },
  { path: '/reports', component: Reports, isProtected: true },
  { path: '/variance-tracking', component: VarianceTrackingPage, isProtected: true },
  { path: '/pipeline', component: PipelinePage, isProtected: true },
  { path: '/lp-reporting/ledger', component: LpReportingLedgerPage, isProtected: true },
  { path: '/lp-reporting/valuations', component: LpReportingValuationsPage, isProtected: true },
  { path: '/lp-reporting/metrics', component: LpReportingMetricsPage, isProtected: true },
  { path: '/lp-reporting/imports', component: LpReportingImportsPage, isProtected: true },
  { path: '/settings', component: SettingsPage, isProtected: true },
  { path: '/help', component: HelpPage },
  { path: '/reserves-demo', component: ReservesDemo },
];

export interface ArchivedPlaceholderRouteEntry {
  path: string;
  redirectTarget: string;
  notes: string;
}

export const ARCHIVED_PLACEHOLDER_ROUTES: ArchivedPlaceholderRouteEntry[] = [
  {
    path: '/planning',
    redirectTarget: '/portfolio?tab=reserve-planning',
    notes:
      'Standalone planning is archived; reserve planning remains inside the portfolio workspace.',
  },
  {
    path: '/kpi-manager',
    redirectTarget: '/dashboard',
    notes: 'Legacy KPI manager is archived until there is an owned, persistent KPI workflow.',
  },
  {
    path: '/kpi-submission',
    redirectTarget: '/dashboard',
    notes: 'Legacy KPI submission is archived until there is an owned, persistent KPI workflow.',
  },
  {
    path: '/investments',
    redirectTarget: '/portfolio',
    notes:
      'Investments are managed inside the portfolio workspace; this compatibility route preserves direct links.',
  },
];

export interface LPRouteEntry {
  path: string;
  component: React.ComponentType;
}

export const LP_ROUTES: LPRouteEntry[] = [
  { path: '/lp/dashboard', component: LPDashboard },
  { path: '/lp/fund-detail/:fundId', component: LPFundDetail },
  { path: '/lp/capital-account', component: LPCapitalAccount },
  { path: '/lp/performance', component: LPPerformance },
  { path: '/lp/reports', component: LPReports },
  { path: '/lp/settings', component: LPSettings },
];

export const LP_INDEX_REDIRECT_PATH = '/lp';
export const LP_INDEX_REDIRECT_TARGET = '/lp/dashboard';

export const LEGACY_REDIRECT_ROUTES = {
  analyticsLegacy: '/analytics-legacy',
  planningLegacy: '/planning-legacy',
} as const;

export const PUBLIC_ENTRY_ROUTES = {
  sharedDashboard: '/shared/:shareId',
  portalCatchAll: '/portal/:rest*',
} as const;

export const ADMIN_GATED_ROUTES = {
  uiCatalog: '/admin/ui-catalog',
} as const;

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
