import React, { Suspense } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { AdminRoute } from '@/components/AdminRoute';
import { LPProvider } from '@/contexts/LPContext';
import { FundProvider, useFundContext } from '@/contexts/FundContext';
import { resolveRouteControlFlag } from '@/app/route-control-flags';
import { requiresFundContextRecovery } from '@/lib/fund-routes';
import { useAuthSession, type AuthSession } from '@/lib/auth-session';
import { queryClient } from '@/lib/queryClient';
import { AppLayout } from '@/app/app-layout';
import LoginPage from '@/pages/login';
import {
  ADMIN_GATED_ROUTES,
  APP_ROUTES,
  ARCHIVED_PLACEHOLDER_ROUTES,
  LEGACY_REDIRECT_ROUTES,
  LP_INDEX_REDIRECT_PATH,
  LP_INDEX_REDIRECT_TARGET,
  LP_ROUTES,
  NotFound,
  PageLoadingFallback,
  PortalAccessDenied,
  PUBLIC_ENTRY_ROUTES,
  SharedDashboard,
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pov-charcoal"></div>
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pov-charcoal"></div>
      </div>
    );
  }

  if (fundLoadError && requiresFundContextRecovery(location)) {
    return (
      <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-2xl rounded-lg border border-error/50 bg-error/10 p-6 text-error-dark">
          <h1 className="text-2xl font-semibold">Unable to load fund context</h1>
          <p className="mt-2 text-sm text-error-dark">
            The fund list could not be loaded, so this workspace cannot determine whether setup is
            required. Retry once the API is reachable.
          </p>
          {fundLoadErrorMessage && (
            <p className="mt-3 rounded-md bg-pov-white/70 px-3 py-2 font-mono text-xs text-error-dark">
              {fundLoadErrorMessage}
            </p>
          )}
          <button
            type="button"
            className="mt-4 rounded-md bg-pov-charcoal px-4 py-2 text-sm font-medium text-pov-white hover:bg-charcoal-700"
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
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function isPublicEntryLocation(location: string): boolean {
  return (
    location === '/login' ||
    location.startsWith('/shared/') ||
    location === '/portal' ||
    location.startsWith('/portal/')
  );
}

function PublicEntryRouter() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path={PUBLIC_ENTRY_ROUTES.sharedDashboard} component={SharedDashboard} />
        <Route path={PUBLIC_ENTRY_ROUTES.portalCatchAll} component={PortalAccessDenied} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

interface AppRouterProps {
  enforceAuth?: boolean;
}

export function AppRouter({ enforceAuth = import.meta.env.PROD }: AppRouterProps = {}) {
  const [location] = useLocation();
  const isPublicEntry = isPublicEntryLocation(location);
  const session = useAuthSession(enforceAuth && !isPublicEntry);

  if (isPublicEntry) {
    return <PublicEntryRouter />;
  }

  if (enforceAuth && session.isPending) {
    return <PageLoadingFallback />;
  }

  if (enforceAuth && session.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-pov-gray p-6">
        <div className="max-w-md rounded-lg border border-error/50 bg-pov-white p-6 text-center">
          <h1 className="text-xl font-semibold text-charcoal">Unable to verify your session</h1>
          <p className="mt-2 text-sm text-charcoal/70">Check your connection and try again.</p>
          <button
            type="button"
            className="mt-4 rounded-md bg-pov-charcoal px-4 py-2 text-sm font-medium text-pov-white"
            onClick={() => void session.refetch()}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (enforceAuth && !session.data) {
    return <Redirect to="/login" />;
  }

  const activeSession: AuthSession = session.data ?? {
    user: { id: 'dev-user', email: 'dev@example.com', role: 'admin', fundIds: [] },
  };

  return (
    <FundProvider>
      <AppLayout session={activeSession}>
        <Router />
      </AppLayout>
    </FundProvider>
  );
}
