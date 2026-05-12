import React, { Suspense, useEffect, useState } from 'react';
import { Link, Switch, Route, Redirect, useLocation } from 'wouter';
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
import { resolveRouteControlFlag, useRouteControlFlag } from '@/app/route-control-flags';
import { requiresFundContextRecovery } from '@/lib/fund-routes';
import './styles/demo-animations.css';

// Layout components
import Sidebar from '@/components/layout/sidebar';
import {
  getActiveNavigationId,
  getFooterNavigationItems,
  getNavigationItems,
  isNavigationItemEnabled,
  resolveNavigationHref,
  type NavigationContext,
} from '@/components/layout/navigation-config';
// import Header from "@/components/layout/header"; // Unused - removed
import DynamicFundHeader from '@/components/layout/dynamic-fund-header';
import { Menu, X } from 'lucide-react';

// Page components - Heavy routes lazy loaded for bundle optimization
const Dashboard = React.lazy(() => import('@/pages/dashboard'));
const Portfolio = React.lazy(() => import('@/pages/portfolio'));
const PortfolioCompanySummary = React.lazy(() => import('@/pages/portfolio-company-summary'));
const PerformancePage = React.lazy(() => import('@/pages/performance'));
// Lazy load non-critical routes for bundle optimization
const FundSetup = React.lazy(() => import('@/pages/fund-setup'));
const Reports = React.lazy(() => import('@/pages/reports'));
const VarianceTrackingPage = React.lazy(() => import('@/pages/variance-tracking'));
const NotFound = React.lazy(() => import('@/pages/not-found'));
// Fund Model Results (post-wizard output)
const FundModelResults = React.lazy(() => import('@/pages/fund-model-results'));
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
const SharedDashboard = React.lazy(() => import('@/pages/shared-dashboard'));
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

// Press On Ventures v2 design philosophy reference screens (full-screen, bypasses AppLayout)
const TodayV2 = React.lazy(() => import('@/pages/v2/today'));
const PortfolioV2 = React.lazy(() => import('@/pages/v2/portfolio'));
const CompanyV2 = React.lazy(() => import('@/pages/v2/company'));
const ScenariosV2 = React.lazy(() => import('@/pages/v2/scenarios'));
const CashV2 = React.lazy(() => import('@/pages/v2/cash'));
const ExitsV2 = React.lazy(() => import('@/pages/v2/exits'));
const InsightsV2 = React.lazy(() => import('@/pages/v2/insights'));
const PartnersV2 = React.lazy(() => import('@/pages/v2/partners'));

const ONBOARDING_TOUR_STORAGE_KEY = 'onboarding_seen_gp_v1';

function MobileNavigation({
  activeModule,
  onNavigate,
}: {
  activeModule: string;
  onNavigate: () => void;
}) {
  const [location] = useLocation();
  const { currentFund, needsSetup } = useFundContext();
  const navigationContext: NavigationContext = {
    location,
    currentFundId: currentFund?.id ?? null,
    needsSetup,
  };
  const items = [...getNavigationItems(), ...getFooterNavigationItems()];

  return (
    <nav className="md:hidden border-b border-slate-200 bg-white px-3 py-2" aria-label="Mobile">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => {
          const href = resolveNavigationHref(item, navigationContext);
          const isActive = activeModule === item.id;
          const isDisabled = !isNavigationItemEnabled(item, navigationContext);
          const Icon = item.icon;

          if (!href || isDisabled) {
            return (
              <button
                key={item.id}
                type="button"
                disabled
                className="flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-charcoal/40"
                aria-disabled="true"
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.id}
              href={href}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-charcoal/70 hover:bg-slate-100 hover:text-charcoal'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileNavigationToggle({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const Icon = isOpen ? X : Menu;

  return (
    <div className="md:hidden border-b border-slate-200 bg-white px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls="mobile-app-navigation"
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-charcoal shadow-sm"
      >
        <Icon className="h-4 w-4" />
        Navigation
      </button>
    </div>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const activeModule = getActiveNavigationId(location);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-poppins text-charcoal">
      <DynamicFundHeader />
      <MobileNavigationToggle
        isOpen={isMobileNavigationOpen}
        onToggle={() => setIsMobileNavigationOpen((isOpen) => !isOpen)}
      />
      {isMobileNavigationOpen && (
        <div id="mobile-app-navigation">
          <MobileNavigation
            activeModule={activeModule}
            onNavigate={() => setIsMobileNavigationOpen(false)}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1">
        <Sidebar activeModule={activeModule} className="hidden md:flex" />
        <main className="min-w-0 flex-1 overflow-auto bg-slate-50">{children}</main>
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
  const onboardingTourEnabled = useRouteControlFlag('onboarding_tour');

  useEffect(() => {
    if (!onboardingTourEnabled) {
      return;
    }

    try {
      if (localStorage.getItem(ONBOARDING_TOUR_STORAGE_KEY) == null) {
        setShouldLoad(true);
      }
    } catch {
      setShouldLoad(true);
    }
  }, [onboardingTourEnabled]);

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
  const [location] = useLocation();
  const { needsSetup, isLoading, fundLoadError, fundLoadErrorMessage } = useFundContext();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (fundLoadError && requiresFundContextRecovery(location)) {
    return (
      <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-950">
          <h1 className="text-2xl font-semibold">Unable to load fund context</h1>
          <p className="mt-2 text-sm text-red-900">
            The fund list could not be loaded, so this workspace cannot determine whether setup is
            required. Retry once the API is reachable.
          </p>
          {fundLoadErrorMessage && (
            <p className="mt-3 rounded-md bg-white/70 px-3 py-2 font-mono text-xs text-red-900">
              {fundLoadErrorMessage}
            </p>
          )}
          <button
            type="button"
            className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/funds'] })}
          >
            Retry loading funds
          </button>
        </div>
      </main>
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
  { path: '/portfolio/company/:id', component: PortfolioCompanySummary, isProtected: true },
  { path: '/portfolio', component: Portfolio, isProtected: true },
  { path: '/performance', component: PerformancePage, isProtected: true },
  { path: '/forecasting', component: ForecastingPage, isProtected: true },
  { path: '/financial-modeling', component: FinancialModelingPage, isProtected: true },
  { path: '/model-results', component: ModelResultsPage, isProtected: true },
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

function renderArchivedPlaceholderRoute({ path, redirectTarget }: ArchivedPlaceholderRouteEntry) {
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
  const lpRoutes = resolveRouteControlFlag('enable_lp_reporting') ? LP_ROUTES : [];

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
            <AdminRoute flag="ui_catalog" devOnly>
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
                <AppRouter />
              </TooltipProvider>
            </FundProvider>
          </BrandChartThemeProvider>
        </FeatureFlagProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

/**
 * Press On v2 reference screens render full-screen and supply their own chrome
 * (sidebar, command palette, topbar). They must bypass AppLayout so the existing
 * dashboard chrome doesn't double up on them.
 */
function AppRouter() {
  const [location] = useLocation();
  const isV2 = location.startsWith('/v2');

  if (isV2) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <Switch>
          <Route path="/v2" component={() => <Redirect to="/v2/today" />} />
          <Route path="/v2/today" component={TodayV2} />
          <Route path="/v2/portfolio" component={PortfolioV2} />
          <Route path="/v2/companies/:id" component={CompanyV2} />
          <Route path="/v2/scenarios" component={ScenariosV2} />
          <Route path="/v2/cash" component={CashV2} />
          <Route path="/v2/exits" component={ExitsV2} />
          <Route path="/v2/insights" component={InsightsV2} />
          <Route path="/v2/partners" component={PartnersV2} />
          <Route path="/v2/:rest*" component={() => <Redirect to="/v2/today" />} />
        </Switch>
      </Suspense>
    );
  }

  return (
    <AppLayout>
      <Router />
    </AppLayout>
  );
}

export default App;
