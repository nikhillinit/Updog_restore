import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Menu, X } from 'lucide-react';
import Sidebar from '@/components/layout/sidebar';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { AUTH_SESSION_QUERY_KEY, type AuthSession } from '@/lib/auth-session';
import {
  getActiveNavigationId,
  getFooterNavigationItems,
  getNavigationItems,
  isNavigationItemEnabled,
  type NavigationItem,
  resolveNavigationHref,
  type NavigationContext,
} from '@/components/layout/navigation-config';
import DynamicFundHeader from '@/components/layout/dynamic-fund-header';
import { FundConstructionKpiHeader } from '@/components/wizard/FundConstructionKpiHeader';
import { useFundContext } from '@/contexts/FundContext';

const MOBILE_NAVIGATION_DISABLED_REASON = 'Complete fund setup to access this route.';

function DisabledMobileNavigationItem({
  item,
  disabledReasonId,
}: {
  item: NavigationItem;
  disabledReasonId: string | undefined;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      disabled
      className="flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-charcoal/40"
      aria-disabled="true"
      aria-describedby={disabledReasonId}
    >
      {disabledReasonId && (
        <span id={disabledReasonId} className="sr-only">
          {MOBILE_NAVIGATION_DISABLED_REASON}
        </span>
      )}
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function EnabledMobileNavigationItem({
  item,
  href,
  isActive,
  onNavigate,
}: {
  item: NavigationItem;
  href: string;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
      className={`flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beige focus-visible:ring-offset-2 ${
        isActive
          ? 'bg-pov-charcoal text-pov-white'
          : 'text-charcoal/70 hover:bg-pov-gray hover:text-charcoal'
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function MobileNavigationItem({
  item,
  activeModule,
  navigationContext,
  onNavigate,
}: {
  item: NavigationItem;
  activeModule: string;
  navigationContext: NavigationContext;
  onNavigate: () => void;
}) {
  const href = resolveNavigationHref(item, navigationContext);
  const isActive = activeModule === item.id;
  const isDisabled = !isNavigationItemEnabled(item, navigationContext);
  const disabledReasonId = isDisabled ? `mobile-navigation-disabled-reason-${item.id}` : undefined;

  if (!href || isDisabled) {
    return <DisabledMobileNavigationItem item={item} disabledReasonId={disabledReasonId} />;
  }

  return (
    <EnabledMobileNavigationItem
      item={item}
      href={href}
      isActive={isActive}
      onNavigate={onNavigate}
    />
  );
}

export function MobileNavigation({
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
    <nav className="md:hidden border-b border-beige-200 bg-pov-white px-3 py-2" aria-label="Mobile">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <MobileNavigationItem
            key={item.id}
            item={item}
            activeModule={activeModule}
            navigationContext={navigationContext}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  );
}

function MobileNavigationToggle({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const Icon = isOpen ? X : Menu;

  return (
    <div className="md:hidden border-b border-beige-200 bg-pov-white px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls="mobile-app-navigation"
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-beige-200 px-3 py-2 text-sm font-medium text-charcoal shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beige focus-visible:ring-offset-2"
      >
        <Icon className="h-4 w-4" />
        Navigation
      </button>
    </div>
  );
}

export function AppLayout({
  children,
  session,
}: {
  children: React.ReactNode;
  session: AuthSession;
}) {
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const activeModule = getActiveNavigationId(location);
  const isFundSetupRoute = location.startsWith('/fund-setup');
  const finishLocalLogout = () => {
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null);
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== AUTH_SESSION_QUERY_KEY[0],
    });
    navigate('/login');
  };
  const handleLogout = async () => {
    if (isLoggingOut) return;
    setLogoutError(null);
    setIsLoggingOut(true);
    try {
      await apiRequest<void>('POST', '/api/auth/logout');
      finishLocalLogout();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 503 &&
        error.errorCode === 'logout_incomplete'
      ) {
        finishLocalLogout();
        return;
      }
      setLogoutError(
        'Logout failed. Your session is still active; retry when the API is reachable.'
      );
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-pov-gray font-poppins text-charcoal">
      {isFundSetupRoute ? <FundConstructionKpiHeader /> : <DynamicFundHeader />}
      <div className="flex justify-end border-b border-beige-200 bg-pov-white px-4 py-1">
        {logoutError && (
          <p id="logout-error" role="alert" className="mr-4 text-sm text-error-dark">
            {logoutError}
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut || !session.user}
          aria-describedby={logoutError ? 'logout-error' : undefined}
          className="text-sm text-charcoal/70 transition-colors hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beige focus-visible:ring-offset-2"
        >
          {isLoggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>
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
        <main className="min-w-0 flex-1 overflow-auto bg-pov-gray">{children}</main>
      </div>
    </div>
  );
}
