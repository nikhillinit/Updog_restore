import React, { Suspense } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { AdminRoute } from '@/components/AdminRoute';
import { LPProvider } from '@/contexts/LPContext';
import { useFundContext } from '@/contexts/FundContext';
import { resolveRouteControlFlag } from '@/app/route-control-flags';
import { requiresFundContextRecovery } from '@/lib/fund-routes';
import { queryClient } from '@/lib/queryClient';
import { AppLayout } from '@/app/app-layout';
import {
  ADMIN_GATED_ROUTES,
  APP_ROUTES,
  ARCHIVED_PLACEHOLDER_ROUTES,
  CashV2,
  CompanyV2,
  ExitsV2,
  InsightsV2,
  LEGACY_REDIRECT_ROUTES,
  LP_INDEX_REDIRECT_PATH,
  LP_INDEX_REDIRECT_TARGET,
  LP_ROUTES,
  NotFound,
  PageLoadingFallback,
  PartnersV2,
  PortalAccessDenied,
  PortfolioV2,
  PUBLIC_ENTRY_ROUTES,
  ScenariosV2,
  SharedDashboard,
  TodayV2,
  UICatalog,
  type AppRouteEntry,
  type ArchivedPlaceholderRouteEntry,
  type LPRouteEntry,
} from '@/app/app-routes';

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
        {lpRoutes.length > 0 && (
          <Route path={LP_INDEX_REDIRECT_PATH}>
            {() => <Redirect to={LP_INDEX_REDIRECT_TARGET} />}
          </Route>
        )}
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

/**
 * Press On v2 reference screens render full-screen and supply their own chrome
 * (sidebar, command palette, topbar). They must bypass AppLayout so the existing
 * dashboard chrome doesn't double up on them.
 */
export function AppRouter() {
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
