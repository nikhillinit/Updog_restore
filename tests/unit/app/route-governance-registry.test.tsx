import { describe, expect, it } from 'vitest';
import {
  ADMIN_GATED_ROUTES,
  APP_ROUTES,
  LEGACY_REDIRECT_ROUTES,
  LP_ROUTES,
  PUBLIC_ENTRY_ROUTES,
} from '@/App';
import {
  CORE_LIVE_GOVERNED_PATHS,
  QUARANTINED_GOVERNED_PATHS,
  ROUTE_GOVERNANCE_REGISTRY,
  getRouteGovernanceEntry,
} from '@/app/route-governance-registry';

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

describe('route governance registry', () => {
  it('covers every mounted entrypoint exactly once', () => {
    const expectedPaths = [
      '/',
      ...APP_ROUTES.map((route) => route.path),
      ...LP_ROUTES.map((route) => route.path),
      ...Object.values(LEGACY_REDIRECT_ROUTES),
      ...Object.values(PUBLIC_ENTRY_ROUTES),
      ...Object.values(ADMIN_GATED_ROUTES),
    ];
    const actualPaths = ROUTE_GOVERNANCE_REGISTRY.map((entry) => entry.path);

    expect(new Set(actualPaths).size).toBe(actualPaths.length);
    expect(sorted(actualPaths)).toEqual(sorted(expectedPaths));
  });

  it('marks the intended core workflow as the only core-live surface', () => {
    expect(sorted(CORE_LIVE_GOVERNED_PATHS)).toEqual(
      sorted([
        '/',
        '/fund-setup',
        '/dashboard',
        '/portfolio',
        '/pipeline',
        '/fund-model-results/:fundId',
        '/reports',
        '/settings',
        '/help',
      ])
    );
  });

  it('tracks quarantined routes with their redirect targets and controlling flags', () => {
    expect(sorted(QUARANTINED_GOVERNED_PATHS)).toEqual(
      sorted(['/planning', '/kpi-manager', '/kpi-submission'])
    );

    expect(getRouteGovernanceEntry('/planning')).toMatchObject({
      exposure: 'quarantined',
      flag: 'HIDE_PLANNING_SURFACE',
      navId: 'planning',
      redirectTarget: '/portfolio?tab=reserve-planning',
    });
    expect(getRouteGovernanceEntry('/kpi-manager')).toMatchObject({
      exposure: 'quarantined',
      flag: 'HIDE_KPI_SURFACES',
      redirectTarget: '/dashboard',
    });
    expect(getRouteGovernanceEntry('/kpi-submission')).toMatchObject({
      exposure: 'quarantined',
      flag: 'HIDE_KPI_SURFACES',
      redirectTarget: '/dashboard',
    });
  });

  it('classifies LP, public, legacy, and admin entrypoints separately', () => {
    for (const route of LP_ROUTES) {
      expect(getRouteGovernanceEntry(route.path)).toMatchObject({
        exposure: 'lp-surface',
        surface: 'lp-route',
        flag: 'ENABLE_LP_REPORTING',
      });
    }

    expect(getRouteGovernanceEntry(PUBLIC_ENTRY_ROUTES.sharedDashboard)).toMatchObject({
      exposure: 'public-contract',
      surface: 'public-contract',
    });
    expect(getRouteGovernanceEntry(PUBLIC_ENTRY_ROUTES.portalCatchAll)).toMatchObject({
      exposure: 'public-contract',
      surface: 'public-contract',
    });
    expect(getRouteGovernanceEntry(LEGACY_REDIRECT_ROUTES.analyticsLegacy)).toMatchObject({
      exposure: 'legacy-redirect',
      surface: 'legacy-redirect',
    });
    expect(getRouteGovernanceEntry(LEGACY_REDIRECT_ROUTES.planningLegacy)).toMatchObject({
      exposure: 'legacy-redirect',
      surface: 'legacy-redirect',
    });
    expect(getRouteGovernanceEntry(ADMIN_GATED_ROUTES.uiCatalog)).toMatchObject({
      exposure: 'admin-gated',
      surface: 'admin-gated',
      flag: 'UI_CATALOG',
    });
  });

  it('does not govern routes that were removed from the default runtime perimeter', () => {
    expect(getRouteGovernanceEntry('/analytics')).toBeUndefined();
    expect(getRouteGovernanceEntry('/monte-carlo')).toBeUndefined();
    expect(getRouteGovernanceEntry('/secondary-market')).toBeUndefined();
    expect(getRouteGovernanceEntry('/notion-integration')).toBeUndefined();
    expect(getRouteGovernanceEntry('/dev-dashboard')).toBeUndefined();
  });
});
