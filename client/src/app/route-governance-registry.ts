import {
  ADMIN_GATED_ROUTES,
  APP_ROUTES,
  LEGACY_REDIRECT_ROUTES,
  LP_ROUTES,
  PUBLIC_ENTRY_ROUTES,
} from '@/App';
import type { Flags } from '@/core/flags/featureFlags';

export type RouteSurface =
  | 'root-entry'
  | 'app-route'
  | 'lp-route'
  | 'public-contract'
  | 'legacy-redirect'
  | 'admin-gated';

export type RouteExposure =
  | 'core-live'
  | 'internal-live'
  | 'quarantined'
  | 'lp-surface'
  | 'public-contract'
  | 'legacy-redirect'
  | 'admin-gated';

export interface RouteGovernanceEntry {
  path: string;
  surface: RouteSurface;
  exposure: RouteExposure;
  isProtected: boolean;
  flag?: keyof Flags;
  navId?: string;
  redirectTarget?: string;
  notes?: string;
}

const CORE_LIVE_ROUTE_PATHS = [
  '/',
  '/fund-setup',
  '/dashboard',
  '/portfolio',
  '/pipeline',
  '/fund-model-results/:fundId',
  '/reports',
  '/settings',
  '/help',
] as const;

const QUARANTINED_ROUTE_METADATA: Readonly<
  Record<
    string,
    {
      flag: keyof Flags;
      navId?: string;
      redirectTarget: string;
      notes: string;
    }
  >
> = {
  '/planning': {
    flag: 'HIDE_PLANNING_SURFACE',
    navId: 'planning',
    redirectTarget: '/portfolio?tab=reserve-planning',
    notes: 'Standalone planning remains quarantined while reserve planning is folded into portfolio.',
  },
  '/kpi-manager': {
    flag: 'HIDE_KPI_SURFACES',
    redirectTarget: '/dashboard',
    notes: 'Legacy KPI manager is quarantined until the product perimeter is reduced.',
  },
  '/kpi-submission': {
    flag: 'HIDE_KPI_SURFACES',
    redirectTarget: '/dashboard',
    notes: 'Legacy KPI submission is quarantined until the product perimeter is reduced.',
  },
} as const;

function ensureUniquePaths(entries: RouteGovernanceEntry[]): readonly RouteGovernanceEntry[] {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.path)) {
      throw new Error(`Duplicate governed route path detected: ${entry.path}`);
    }
    seen.add(entry.path);
  }

  return entries;
}

function toAppRouteGovernanceEntry(route: (typeof APP_ROUTES)[number]): RouteGovernanceEntry {
  const quarantineMetadata =
    QUARANTINED_ROUTE_METADATA[route.path as keyof typeof QUARANTINED_ROUTE_METADATA];

  if (quarantineMetadata != null) {
    return {
      path: route.path,
      surface: 'app-route',
      exposure: 'quarantined',
      isProtected: Boolean(route.isProtected),
      flag: quarantineMetadata.flag,
      ...(quarantineMetadata.navId != null ? { navId: quarantineMetadata.navId } : {}),
      redirectTarget: quarantineMetadata.redirectTarget,
      notes: quarantineMetadata.notes,
    };
  }

  return {
    path: route.path,
    surface: 'app-route',
    exposure: CORE_LIVE_ROUTE_PATHS.includes(route.path as (typeof CORE_LIVE_ROUTE_PATHS)[number])
      ? 'core-live'
      : 'internal-live',
    isProtected: Boolean(route.isProtected),
  };
}

function toLPRouteGovernanceEntry(route: (typeof LP_ROUTES)[number]): RouteGovernanceEntry {
  return {
    path: route.path,
    surface: 'lp-route',
    exposure: 'lp-surface',
    isProtected: false,
    flag: 'ENABLE_LP_REPORTING',
    notes: 'LP routes only mount when ENABLE_LP_REPORTING is enabled.',
  };
}

const SPECIAL_ROUTE_GOVERNANCE: RouteGovernanceEntry[] = [
  {
    path: '/',
    surface: 'root-entry',
    exposure: 'core-live',
    isProtected: false,
    redirectTarget: 'dynamic:/fund-setup|/dashboard',
    notes: 'Home route delegates to the primary internal workflow.',
  },
  {
    path: LEGACY_REDIRECT_ROUTES.analyticsLegacy,
    surface: 'legacy-redirect',
    exposure: 'legacy-redirect',
    isProtected: false,
    redirectTarget: '/dashboard?tab=performance',
  },
  {
    path: LEGACY_REDIRECT_ROUTES.planningLegacy,
    surface: 'legacy-redirect',
    exposure: 'legacy-redirect',
    isProtected: false,
    redirectTarget: '/portfolio?tab=reserve-planning',
  },
  {
    path: PUBLIC_ENTRY_ROUTES.sharedDashboard,
    surface: 'public-contract',
    exposure: 'public-contract',
    isProtected: false,
    notes: 'Shared LP/dashboard links are externally addressable and must be treated as a public contract.',
  },
  {
    path: PUBLIC_ENTRY_ROUTES.portalCatchAll,
    surface: 'public-contract',
    exposure: 'public-contract',
    isProtected: false,
    notes: 'Portal catch-all remains a public entrypoint even though it currently resolves to access denied.',
  },
  {
    path: ADMIN_GATED_ROUTES.uiCatalog,
    surface: 'admin-gated',
    exposure: 'admin-gated',
    isProtected: false,
    flag: 'UI_CATALOG',
    notes: 'Admin-only catalog route must stay explicitly gated.',
  },
];

export const ROUTE_GOVERNANCE_REGISTRY = ensureUniquePaths([
  ...SPECIAL_ROUTE_GOVERNANCE,
  ...APP_ROUTES.map(toAppRouteGovernanceEntry),
  ...LP_ROUTES.map(toLPRouteGovernanceEntry),
]);

export const CORE_LIVE_GOVERNED_PATHS = ROUTE_GOVERNANCE_REGISTRY.filter(
  (entry) => entry.exposure === 'core-live'
).map((entry) => entry.path);

export const QUARANTINED_GOVERNED_PATHS = ROUTE_GOVERNANCE_REGISTRY.filter(
  (entry) => entry.exposure === 'quarantined'
).map((entry) => entry.path);

export function getRouteGovernanceEntry(path: string): RouteGovernanceEntry | undefined {
  return ROUTE_GOVERNANCE_REGISTRY.find((entry) => entry.path === path);
}
