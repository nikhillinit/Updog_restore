import React, { Suspense, useState, useEffect } from 'react';
import { Switch, Route, Redirect, useLocation } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FundProvider, useFundContext } from '@/contexts/FundContext';
import { LPProvider } from '@/contexts/LPContext';
import { FeatureFlagProvider } from '@/providers/FeatureFlagProvider';
import { StagingRibbon } from '@/components/StagingRibbon';
import { ErrorBoundary } from './components/ui/error-boundary';
import { BrandChartThemeProvider } from '@/lib/chart-theme/chart-theme-provider';
import { GuidedTour } from '@/components/onboarding/GuidedTour';
import { AdminRoute } from '@/components/AdminRoute';
import './styles/demo-animations.css';

// Layout components
import Sidebar from '@/components/layout/sidebar';
// import Header from "@/components/layout/header"; // Unused - removed
import DynamicFundHeader from '@/components/layout/dynamic-fund-header';
import DemoBanner from '@/components/demo/DemoBanner';

// Page components - Heavy routes lazy loaded for bundle optimization
const Dashboard = React.lazy(() => import('@/pages/dashboard'));
const Portfolio = React.lazy(() => import('@/pages/portfolio'));
const Investments = React.lazy(() => import('@/pages/investments'));
const Planning = React.lazy(() => import('@/pages/planning'));
// Lazy load non-critical routes for bundle optimization
const FundSetup = React.lazy(() => import('@/pages/fund-setup'));
const InvestmentDetail = React.lazy(() => import('@/pages/investment-detail'));
const KPIManager = React.lazy(() => import('@/pages/kpi-manager'));
const KPISubmission = React.lazy(() => import('@/pages/kpi-submission'));
const ForecastingPage = React.lazy(() => import('@/pages/forecasting'));
const ScenarioBuilderPage = React.lazy(() => import('@/pages/scenario-builder'));
const ReservesDemo = React.lazy(() => import('@/pages/reserves-demo'));
const MOICAnalysisPage = React.lazy(() => import('@/pages/moic-analysis'));
const ReturnTheFundPage = React.lazy(() => import('@/pages/return-the-fund'));
const PartialSalesPage = React.lazy(() => import('@/pages/partial-sales'));
const FinancialModeling = React.lazy(() => import('@/pages/financial-modeling'));
const Performance = React.lazy(() => import('@/pages/performance'));
const Analytics = React.lazy(() => import('@/pages/analytics'));
const Reports = React.lazy(() => import('@/pages/reports'));
const AllocationManagerPage = React.lazy(() => import('@/pages/allocation-manager'));
const NotFound = React.lazy(() => import('@/pages/not-found'));
const EnhancedPortfolioAnalytics = React.lazy(
  () => import('@/components/portfolio/enhanced-portfolio-analytics')
);
const CustomFields = React.lazy(() => import('@/pages/CustomFields'));
const InvestmentsTable = React.lazy(() => import('@/pages/investments-table'));
const CapTables = React.lazy(() => import('@/pages/CapTables'));
const CashManagement = React.lazy(() => import('@/pages/cash-management'));
const SensitivityAnalysisPage = React.lazy(() => import('@/pages/sensitivity-analysis'));
// New analytics features
const TimeTravelPage = React.lazy(() => import('@/pages/time-travel'));
const VarianceTrackingPage = React.lazy(() => import('@/pages/variance-tracking'));
const PortfolioConstructor = React.lazy(() => import('@/pages/portfolio-constructor'));
const MonteCarloPage = React.lazy(() => import('@/pages/monte-carlo'));
// Development dashboard for solo developer productivity
const DevDashboardPage = React.lazy(() => import('@/pages/DevDashboardPage'));
// Agent 2: Mobile Executive Dashboard
const MobileExecutiveDashboardPage = React.lazy(() => import('@/pages/mobile-executive-dashboard'));
// LP Sharing
const SharedDashboard = React.lazy(() => import('@/pages/shared-dashboard'));
// Secondary Market Analysis
const SecondaryMarketPage = React.lazy(() => import('@/pages/secondary-market'));
// Notion Integration
const NotionIntegrationPage = React.lazy(() => import('@/pages/notion-integration'));
// New IA pages (Codex-validated restructure)
const PipelinePage = React.lazy(() => import('@/pages/pipeline'));
const SettingsPage = React.lazy(() => import('@/pages/settings'));
const HelpPage = React.lazy(() => import('@/pages/help'));
// Modern Dashboard (replaces legacy dashboard)
const ModernDashboard = React.lazy(() => import('@/pages/dashboard-modern'));
// LP Reporting Dashboard
const LPDashboard = React.lazy(() => import('@/pages/lp/dashboard'));
const LPFundDetail = React.lazy(() => import('@/pages/lp/fund-detail'));
const LPCapitalAccount = React.lazy(() => import('@/pages/lp/capital-account'));
const LPPerformance = React.lazy(() => import('@/pages/lp/performance'));
const LPReports = React.lazy(() => import('@/pages/lp/reports'));
const LPSettings = React.lazy(() => import('@/pages/lp/settings'));
// Admin pages
const UICatalog = React.lazy(() => import('@/pages/admin/ui-catalog'));
// Portal pages (LP Portal scaffolding)
const PortalAccessDenied = React.lazy(() => import('@/pages/portal/access-denied'));

const _moduleConfig = {
  dashboard: {
    title: 'Fund Dashboard',
    description: 'Comprehensive overview of fund performance and metrics',
  },
  'fund-setup': {
    title: 'Fund Setup',
    description: 'Configure fund parameters and investment strategy',
  },
  portfolio: {
    title: 'Portfolio Management',
    description: 'Manage portfolio companies and track performance',
  },
  investments: {
    title: 'Investment Tracking',
    description: 'Add and manage individual investments with performance modeling',
  },
  'kpi-manager': {
    title: 'KPI Manager',
    description: 'Monitor and track portfolio company performance metrics',
  },
  'allocation-manager': {
    title: 'Allocation Manager',
    description: 'Configure fund allocations with automatic reserve calculation',
  },
  'financial-modeling': {
    title: 'Financial Modeling',
    description: 'Cohort analysis and financial projections',
  },
  performance: {
    title: 'Performance Analysis',
    description: 'IRR analysis and realized returns tracking',
  },
  analytics: {
    title: 'Analytics & Insights',
    description: 'Advanced analytics and performance insights',
  },
  'portfolio-analytics': {
    title: 'Portfolio Analytics',
    description: 'Drag-and-drop data visualization with saved views',
  },
  reports: {
    title: 'Reports & Documentation',
    description: 'Generate comprehensive fund reports',
  },
  'tear-sheets': {
    title: 'Tear Sheets',
    description: 'Mobile-optimized portfolio company tear sheets with versioned commentary',
  },
  'time-travel': {
    title: 'Time-Travel Analytics',
    description: 'Historical fund state analysis, snapshots, and restoration capabilities',
  },
  'variance-tracking': {
    title: 'Variance Tracking',
    description: 'Performance variance monitoring, baseline management, and automated alerts',
  },
  'portfolio-constructor': {
    title: 'Portfolio Constructor',
    description:
      'Build and optimize fund portfolio strategies with scenario modeling and real-time calculations',
  },
  'monte-carlo': {
    title: 'Monte Carlo Backtesting',
    description:
      'Run calibrated simulations with historical validation and async progress tracking',
  },
  'dev-dashboard': {
    title: 'Development Dashboard',
    description: 'Real-time visibility into system health for solo developer productivity',
  },
  'mobile-executive-dashboard': {
    title: 'Mobile Executive Dashboard',
    description: 'Mobile-first executive dashboard with AI insights and touch-optimized navigation',
  },
  'secondary-market': {
    title: 'Secondary Market Analysis',
    description: 'Liquidity analysis, secondary valuations, and market opportunity assessment',
  },
  'notion-integration': {
    title: 'Notion Integration',
    description: 'Connect Notion workspaces to sync fund data and portfolio company updates',
  },
};

function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [activeModule, setActiveModule] = useState('fund-setup');

  // Update active module based on current route
  useEffect(() => {
    const path = location.replace('/', '') || 'fund-setup';
    setActiveModule(path);
  }, [location, setActiveModule]);

  // const currentModule = moduleConfig[activeModule as keyof typeof moduleConfig] || moduleConfig['fund-setup'];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-poppins text-charcoal">
      <DynamicFundHeader />
      <div className="flex flex-1">
        <Sidebar activeModule={activeModule} onModuleChange={setActiveModule} />
        <main className="flex-1 overflow-auto bg-slate-50">{children}</main>
      </div>
    </div>
  );
}

function HomeRoute() {
  const { needsSetup, isLoading } = useFundContext();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return needsSetup ? <Redirect to="/fund-setup" /> : <Redirect to="/dashboard" />;
}

interface ProtectedRouteProps {
  component: React.ComponentType<Record<string, unknown>>;
  [key: string]: unknown;
}

function ProtectedRoute({ component: Component, ...props }: ProtectedRouteProps) {
  const { needsSetup, isLoading } = useFundContext();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (needsSetup) {
    return <Redirect to="/fund-setup" />;
  }

  return <Component {...(props as Record<string, unknown>)} />;
}

// ---------------------------------------------------------------------------
// Route config arrays (order-preserving, first-match routing)
// ---------------------------------------------------------------------------

interface AppRouteEntry {
  path: string;
  component: React.ComponentType<Record<string, unknown>>;
  isProtected?: boolean;
}

const APP_ROUTES: AppRouteEntry[] = [
  { path: '/fund-setup', component: FundSetup },
  { path: '/dashboard', component: Dashboard, isProtected: true },
  { path: '/portfolio', component: Portfolio, isProtected: true },
  { path: '/investments', component: Investments, isProtected: true },
  { path: '/investments/:id', component: InvestmentDetail, isProtected: true },
  { path: '/custom-fields', component: CustomFields, isProtected: true },
  { path: '/investments-table', component: InvestmentsTable, isProtected: true },
  { path: '/investments/company/:id', component: Investments, isProtected: true },
  { path: '/cap-tables', component: CapTables, isProtected: true },
  { path: '/kpi-manager', component: KPIManager, isProtected: true },
  { path: '/kpi-submission', component: KPISubmission },
  {
    path: '/allocation-manager',
    component: AllocationManagerPage as React.ComponentType<Record<string, unknown>>,
  },
  { path: '/planning', component: Planning, isProtected: true },
  { path: '/forecasting', component: ForecastingPage, isProtected: true },
  { path: '/scenario-builder', component: ScenarioBuilderPage, isProtected: true },
  { path: '/reserves-demo', component: ReservesDemo, isProtected: true },
  { path: '/moic-analysis', component: MOICAnalysisPage, isProtected: true },
  { path: '/return-the-fund', component: ReturnTheFundPage, isProtected: true },
  { path: '/partial-sales', component: PartialSalesPage, isProtected: true },
  { path: '/financial-modeling', component: FinancialModeling, isProtected: true },
  { path: '/performance', component: Performance, isProtected: true },
  { path: '/analytics', component: Analytics, isProtected: true },
  { path: '/portfolio-analytics', component: EnhancedPortfolioAnalytics, isProtected: true },
  { path: '/cash-management', component: CashManagement, isProtected: true },
  { path: '/sensitivity-analysis', component: SensitivityAnalysisPage, isProtected: true },
  { path: '/time-travel', component: TimeTravelPage, isProtected: true },
  { path: '/variance-tracking', component: VarianceTrackingPage, isProtected: true },
  { path: '/portfolio-constructor', component: PortfolioConstructor, isProtected: true },
  { path: '/monte-carlo', component: MonteCarloPage, isProtected: true },
  { path: '/secondary-market', component: SecondaryMarketPage, isProtected: true },
  { path: '/notion-integration', component: NotionIntegrationPage, isProtected: true },
  { path: '/dev-dashboard', component: DevDashboardPage },
  {
    path: '/mobile-executive-dashboard',
    component: MobileExecutiveDashboardPage,
    isProtected: true,
  },
  { path: '/reports', component: Reports, isProtected: true },
  { path: '/pipeline', component: PipelinePage, isProtected: true },
  { path: '/settings', component: SettingsPage, isProtected: true },
  { path: '/help', component: HelpPage },
  { path: '/dashboard-modern', component: ModernDashboard, isProtected: true },
];

interface LPRouteEntry {
  path: string;
  component: React.ComponentType;
}

const LP_ROUTES: LPRouteEntry[] = [
  { path: '/lp/dashboard', component: LPDashboard },
  { path: '/lp/fund-detail/:fundId', component: LPFundDetail },
  { path: '/lp/capital-account', component: LPCapitalAccount },
  { path: '/lp/performance', component: LPPerformance },
  { path: '/lp/reports', component: LPReports },
  { path: '/lp/settings', component: LPSettings },
];

function renderAppRoute({ path, component: C, isProtected }: AppRouteEntry) {
  if (isProtected) {
    return (
      <Route key={path} path={path}>
        {() => <ProtectedRoute component={C} />}
      </Route>
    );
  }
  return (
    <Route key={path} path={path}>
      {() => <C />}
    </Route>
  );
}

function renderLPRoute({ path, component: C }: LPRouteEntry) {
  return (
    <Route key={path} path={path}>
      {() => (
        <LPProvider>
          <C />
        </LPProvider>
      )}
    </Route>
  );
}

function PageLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading page...</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Switch>
        <Route path="/" component={HomeRoute} />
        {APP_ROUTES.map(renderAppRoute)}
        <Route path="/analytics-legacy">{() => <Redirect to="/dashboard?tab=performance" />}</Route>
        <Route path="/planning-legacy">
          {() => <Redirect to="/portfolio?tab=reserve-planning" />}
        </Route>
        <Route path="/shared/:shareId" component={SharedDashboard} />
        {LP_ROUTES.map(renderLPRoute)}
        <Route path="/admin/ui-catalog">
          {() => (
            <AdminRoute flag="UI_CATALOG">
              <UICatalog />
            </AdminRoute>
          )}
        </Route>
        <Route path="/portal/:rest*" component={PortalAccessDenied} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <FeatureFlagProvider>
          <BrandChartThemeProvider>
            <StagingRibbon />
            <FundProvider>
              <TooltipProvider>
                <DemoBanner />
                <Toaster />
                <GuidedTour />
                <AppLayout>
                  <Router />
                </AppLayout>
              </TooltipProvider>
            </FundProvider>
          </BrandChartThemeProvider>
        </FeatureFlagProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
