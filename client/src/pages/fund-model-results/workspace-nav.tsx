/**
 * Workspace navigation row (Plan 9 Wave 9B1, D-F.2/D-F.5).
 *
 * The ONE persistent hub-and-spokes row mounted on all six GP workspace
 * destinations: fund context + six underlined text links (ink active state,
 * no tabs/pills/status hues) + the static basis/overlay indicator (D-E: no
 * surface supports live basis switching at launch) + at most one primary
 * action. Fund-scoped destinations without a resolved fund render
 * DISABLED WITH REASON (D-C) — never hidden, never dead links.
 *
 * @module client/pages/fund-model-results/workspace-nav
 */

import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ForecastBasisControl } from '@/components/fund-results';

export type WorkspaceNavKey =
  'summary' | 'forecast' | 'portfolio-actuals' | 'reserves' | 'scenarios' | 'reports';

export interface WorkspaceNavItem {
  key: WorkspaceNavKey;
  label: string;
  /** null = gated: rendered disabled with its reason (D-C). */
  href: string | null;
  disabledReason?: string;
}

const FUND_REQUIRED_REASON = 'Select a fund to open this view';

/**
 * D-F.2 contract table. Order pins Portfolio Actuals BEFORE Reserves
 * (drift-before-reserve ordering). Forecast and Portfolio Actuals accept an
 * optional fundId query param (both routes read it via
 * extractRouteScopedFundId / PortfolioTabs URL sync); the fund-scoped
 * destinations require one.
 */
export function workspaceNavItems(fundId: string | null): WorkspaceNavItem[] {
  const fundScoped = (path: string): { href: string | null; disabledReason?: string } =>
    fundId === null ? { href: null, disabledReason: FUND_REQUIRED_REASON } : { href: path };

  return [
    { key: 'summary', label: 'Summary', ...fundScoped(`/fund-model-results/${fundId}`) },
    {
      key: 'forecast',
      label: 'Forecast',
      href: fundId === null ? '/financial-modeling' : `/financial-modeling?fundId=${fundId}`,
    },
    {
      key: 'portfolio-actuals',
      label: 'Portfolio Actuals',
      href:
        fundId === null
          ? '/portfolio?tab=reserve-planning'
          : `/portfolio?tab=reserve-planning&fundId=${fundId}`,
    },
    {
      key: 'reserves',
      label: 'Reserves',
      ...fundScoped(`/fund-model-results/${fundId}/moic-analysis`),
    },
    {
      key: 'scenarios',
      label: 'Scenarios',
      ...fundScoped(`/fund-model-results/${fundId}/scenarios`),
    },
    { key: 'reports', label: 'Reports', ...fundScoped(`/fund-model-results/${fundId}/reports`) },
  ];
}

export type WorkspaceBasisIndicatorMode = 'construction' | 'current' | 'side-by-side';

/**
 * D-E static basis indicator per surface. Comparison surfaces (financial
 * modeling) show Construction and Current side by side by nature; single-basis
 * surfaces show "Basis: <x>". No interactive control renders anywhere until a
 * dual-capable contract exists.
 */
export function WorkspaceBasisIndicator({ mode }: { mode: WorkspaceBasisIndicatorMode }) {
  if (mode === 'side-by-side') {
    return (
      <p className="text-xs font-medium text-pov-charcoal">
        Basis: Construction and Current — side by side
      </p>
    );
  }
  return <ForecastBasisControl variant="indicator" value={mode} />;
}

export interface WorkspaceNavProps {
  /** Canonical positive-integer fund id string, or null when unresolved. */
  fundId: string | null;
  /** Fund context shown at the head of the row. */
  fundLabel: string;
  active: WorkspaceNavKey;
  /** Static basis/overlay indicator node (WorkspaceBasisIndicator or composite). */
  indicator: ReactNode;
  /** At most one primary action (D-F.5 chrome budget). */
  primaryAction?: ReactNode;
}

export function WorkspaceNav({
  fundId,
  fundLabel,
  active,
  indicator,
  primaryAction,
}: WorkspaceNavProps) {
  const items = workspaceNavItems(fundId);

  return (
    <nav
      aria-label="Fund workspace"
      data-testid="workspace-nav"
      className="sticky top-0 z-20 border-y border-beige-200 bg-white px-4 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="text-sm font-semibold text-pov-charcoal" data-testid="workspace-nav-fund">
          {fundLabel}
        </span>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {items.map((item) => (
            <li key={item.key}>
              {item.href === null ? (
                <span
                  aria-disabled="true"
                  data-testid={`workspace-nav-${item.key}-disabled`}
                  className="text-sm text-presson-textMuted"
                >
                  {item.label}
                  <span className="ml-1 text-xs">({item.disabledReason})</span>
                </span>
              ) : (
                <Link
                  href={item.href}
                  data-testid={`workspace-nav-${item.key}`}
                  {...(item.key === active ? { 'aria-current': 'page' as const } : {})}
                  className={
                    item.key === active
                      ? 'text-sm font-medium text-pov-charcoal underline decoration-2 underline-offset-4'
                      : 'text-sm text-presson-textMuted underline decoration-1 underline-offset-4 hover:text-pov-charcoal'
                  }
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          {indicator}
          {primaryAction ?? null}
        </div>
      </div>
    </nav>
  );
}
