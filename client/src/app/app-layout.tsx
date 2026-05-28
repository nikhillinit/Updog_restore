import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Menu, X } from 'lucide-react';
import Sidebar from '@/components/layout/sidebar';
import {
  getActiveNavigationId,
  getFooterNavigationItems,
  getNavigationItems,
  isNavigationItemEnabled,
  resolveNavigationHref,
  type NavigationContext,
} from '@/components/layout/navigation-config';
import DynamicFundHeader from '@/components/layout/dynamic-fund-header';
import { FundConstructionKpiHeader } from '@/components/wizard/FundConstructionKpiHeader';
import { useFundContext } from '@/contexts/FundContext';

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
    <nav className="md:hidden border-b border-slate-200 bg-white px-3 py-2" aria-label="Mobile">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => {
          const href = resolveNavigationHref(item, navigationContext);
          const isActive = activeModule === item.id;
          const isDisabled = !isNavigationItemEnabled(item, navigationContext);
          const Icon = item.icon;
          const disabledReason = isDisabled
            ? 'Complete fund setup to access this route.'
            : undefined;
          const disabledReasonId = disabledReason
            ? `mobile-navigation-disabled-reason-${item.id}`
            : undefined;

          if (!href || isDisabled) {
            return (
              <button
                key={item.id}
                type="button"
                disabled
                className="flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-charcoal/40"
                aria-disabled="true"
                aria-describedby={disabledReasonId}
              >
                {disabledReason && (
                  <span id={disabledReasonId} className="sr-only">
                    {disabledReason}
                  </span>
                )}
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
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beige focus-visible:ring-offset-2 ${
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
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-charcoal shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beige focus-visible:ring-offset-2"
      >
        <Icon className="h-4 w-4" />
        Navigation
      </button>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const activeModule = getActiveNavigationId(location);
  const isFundSetupRoute = location.startsWith('/fund-setup');

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-poppins text-charcoal">
      {isFundSetupRoute ? <FundConstructionKpiHeader /> : <DynamicFundHeader />}
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
