import React, { Suspense, useEffect, useState } from 'react';
import { Switch, Route, Redirect, useLocation } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FundProvider, useFundContext } from '@/contexts/FundContext';
import { LPProvider } from '@/contexts/LPContext';
import { FeatureFlagProvider } from '@/providers/FeatureFlagProvider';
import { StagingRibbon } from '@/components/StagingRibbon';
import { ErrorBoundary } from './components/ui/error-boundary';
import { BrandChartThemeProvider } from '@/lib/chart-theme/chart-theme-provider';
import { AdminRoute } from '@/components/AdminRoute';
import { FLAGS } from '@/core/flags/featureFlags';
import './styles/demo-animations.css';

// Layout components
import Sidebar from '@/components/layout/sidebar';
import { getActiveNavigationId } from '@/components/layout/navigation-config';
// import Header from "@/components/layout/header"; // Unused - removed
import DynamicFundHeader from '@/components/layout/dynamic-fund-header';

// Page components - Heavy routes lazy loaded for bundle optimization
const Dashboard = React.lazy(() => import('@/pages/dashboard'));
const Portfolio = React.lazy(() => import('@/pages/portfolio'));
// Lazy load non-critical routes for bundle optimization
const FundSetup = React.lazy(() => import('@/pages/fund-setup'));
const Reports = React.lazy(() => import('@/pages/reports'));
const NotFound = React.lazy(() => import('@/pages/not-found'));
// Fund Model Results (post-wizard output)
const FundModelResults = React.lazy(() => import('@/pages/fund-model-results'));
// LP Sharing
const SharedDashboard = React.lazy(() => import('@/pages/shared-dashboard'));
// New IA pages (Codex-validated restructure)
const PipelinePage = React.lazy(() => import('@/pages/pipeline'));
const SettingsPage = React.lazy(() => import('@/pages/settings'));
const HelpPage = React.lazy(() => import('@/pages/help'));
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
const DeferredToasterView = React.lazy(() =>
  import('@/components/ui/toaster').then((mod) => ({ default: mod.Toaster }))
);
const DeferredGuidedTourView = React.lazy(() =>
  import('@/components/onboarding/GuidedTour').then((mod) => ({ default: mod.GuidedTour }))
);
const DeferredDemoBannerView = React.lazy(() => import('@/components/demo/DemoBanner'));

const ONBOARDING_TOUR_STORAGE_KEY = 'onboarding_seen_gp_v1';

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
  const activeModule = getActiveNavigationId(location);

  // const currentModule = moduleConfig[activeModule as keyof typeof moduleConfig] || moduleConfig['fund-setup'];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-poppins text-charcoal">
      <DynamicFundHeader />
      <div className="flex flex-1">
        <Sidebar activeModule={activeModule} />
        <main className="flex-1 overflow-auto bg-slate-50">{children}</main>
      </div>
    </div>
  );
}

function DeferredToaster() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShouldRender(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!shouldRender) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DeferredToasterView />
    </Suspense>
  );
}

function DeferredGuidedTour() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (!FLAGS.ONBOARDING_TOUR) {
      return;
    }

    try {
      if (localStorage.getItem(ONBOARDING_TOUR_STORAGE_KEY) == null) {
        setShouldLoad(true);
      }
    } catch {
      setShouldLoad(true);
    }
  }, []);

  if (!shouldLoad) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DeferredGuidedTourView />
    </Suspense>
  );
}

function DeferredDemoBanner() {
  const [shouldLoad, setShouldLoad] = useState(import.meta.env.DEMO_MODE === 'true');

  useEffect(() => {
    if (import.meta.env.DEMO_MODE === 'true') {
      return;
    }

    if (typeof window !== 'undefined' && window.location.search.includes('DEMO_MODE')) {
      setShouldLoad(true);
    }
  }, []);

  if (!shouldLoad) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DeferredDemoBannerView />
    </Suspense>
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

export interface AppRouteEntry {
  path: string;
  component: React.ComponentType<Record<string, unknown>>;
  isProtected?: boolean;
}

export const APP_ROUTES: AppRouteEntry[] = [
  { path: '/fund-setup', component: FundSetup },
  { path: '/dashboard', component: Dashboard, isProtected: true },
  { path: '/portfolio', component: Portfolio, isProtected: true },
  { path: '/fund-model-results/:fundId', component: FundModelResults, isProtected: true },
  { path: '/reports', component: Reports, isProtected: true },
  { path: '/pipeline', component: PipelinePage, isProtected: true },
  { path: '/settings', component: SettingsPage, isProtected: true },
  { path: '/help', component: HelpPage },
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
    notes: 'Standalone planning is archived; reserve planning remains inside the portfolio workspace.',
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

function renderArchivedPlaceholderRoute({
  path,
  redirectTarget,
}: ArchivedPlaceholderRouteEntry) {
  return (
    <Route key={path} path={path}>
      {() => <Redirect to={redirectTarget} />}
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
  const lpRoutes = FLAGS.ENABLE_LP_REPORTING ? LP_ROUTES : [];

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Switch>
        <Route path="/" component={HomeRoute} />
        {APP_ROUTES.map(renderAppRoute)}
        {ARCHIVED_PLACEHOLDER_ROUTES.map(renderArchivedPlaceholderRoute)}
        <Route path={LEGACY_REDIRECT_ROUTES.analyticsLegacy}>
          {() => <Redirect to="/dashboard?tab=performance" />}
        </Route>
        <Route path={LEGACY_REDIRECT_ROUTES.planningLegacy}>
          {() => <Redirect to="/portfolio?tab=reserve-planning" />}
        </Route>
        <Route path={PUBLIC_ENTRY_ROUTES.sharedDashboard} component={SharedDashboard} />
        {lpRoutes.map(renderLPRoute)}
        <Route path={ADMIN_GATED_ROUTES.uiCatalog}>
          {() => (
            <AdminRoute flag="UI_CATALOG">
              <UICatalog />
            </AdminRoute>
          )}
        </Route>
        <Route path={PUBLIC_ENTRY_ROUTES.portalCatchAll} component={PortalAccessDenied} />
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
                <DeferredDemoBanner />
                <DeferredToaster />
                <DeferredGuidedTour />
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
