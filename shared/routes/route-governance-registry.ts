import {
  ADMIN_GATED_ROUTES,
  APP_ROUTE_DEFINITIONS,
  ARCHIVED_PLACEHOLDER_ROUTES,
  LEGACY_REDIRECT_ROUTES,
  LP_ROUTE_DEFINITIONS,
  PUBLIC_ENTRY_ROUTES,
  type RouteControlFlag,
} from './app-route-definitions';

export type RouteSurface =
  | 'root-entry'
  | 'app-route'
  | 'archived-placeholder'
  | 'lp-route'
  | 'public-contract'
  | 'legacy-redirect'
  | 'admin-gated';

export type RouteExposure =
  | 'core-live'
  | 'internal-live'
  | 'archived-placeholder'
  | 'lp-surface'
  | 'public-contract'
  | 'legacy-redirect'
  | 'admin-gated';

export interface RouteGovernanceEntry {
  path: string;
  surface: RouteSurface;
  exposure: RouteExposure;
  isProtected: boolean;
  flag?: RouteControlFlag;
  navId?: string;
  redirectTarget?: string;
  notes?: string;
}

const CORE_LIVE_ROUTE_PATHS = [
  '/',
  '/fund-setup',
  '/dashboard',
  '/portfolio',
  '/portfolio/company/:id',
  '/pipeline',
  '/forecasting',
  '/model-results',
  '/fund-model-results/:fundId',
  '/fund-model-results/:fundId/scenarios',
  '/reports',
  '/settings',
  '/help',
] as const;

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

function toAppRouteGovernanceEntry(
  route: (typeof APP_ROUTE_DEFINITIONS)[number]
): RouteGovernanceEntry {
  return {
    path: route.path,
    surface: 'app-route',
    exposure: CORE_LIVE_ROUTE_PATHS.includes(route.path as (typeof CORE_LIVE_ROUTE_PATHS)[number])
      ? 'core-live'
      : 'internal-live',
    isProtected: 'isProtected' in route ? route.isProtected : false,
  };
}

function toArchivedPlaceholderEntry(
  route: (typeof ARCHIVED_PLACEHOLDER_ROUTES)[number]
): RouteGovernanceEntry {
  return {
    path: route.path,
    surface: 'archived-placeholder',
    exposure: 'archived-placeholder',
    isProtected: false,
    redirectTarget: route.redirectTarget,
    notes: route.notes,
  };
}

function toLPRouteGovernanceEntry(
  route: (typeof LP_ROUTE_DEFINITIONS)[number]
): RouteGovernanceEntry {
  return {
    path: route.path,
    surface: 'lp-route',
    exposure: 'lp-surface',
    isProtected: false,
    flag: 'enable_lp_reporting',
    notes: 'LP routes only mount when enable_lp_reporting is enabled.',
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
    notes:
      'Shared LP/dashboard links are externally addressable and must be treated as a public contract.',
  },
  {
    path: PUBLIC_ENTRY_ROUTES.portalCatchAll,
    surface: 'public-contract',
    exposure: 'public-contract',
    isProtected: false,
    notes:
      'Portal catch-all remains a public entrypoint even though it currently resolves to access denied.',
  },
  {
    path: ADMIN_GATED_ROUTES.uiCatalog,
    surface: 'admin-gated',
    exposure: 'admin-gated',
    isProtected: false,
    flag: 'ui_catalog',
    notes: 'Admin-only catalog route must stay explicitly gated.',
  },
];

export const ROUTE_GOVERNANCE_REGISTRY = ensureUniquePaths([
  ...SPECIAL_ROUTE_GOVERNANCE,
  ...APP_ROUTE_DEFINITIONS.map(toAppRouteGovernanceEntry),
  ...ARCHIVED_PLACEHOLDER_ROUTES.map(toArchivedPlaceholderEntry),
  ...LP_ROUTE_DEFINITIONS.map(toLPRouteGovernanceEntry),
]);

export const CORE_LIVE_GOVERNED_PATHS = ROUTE_GOVERNANCE_REGISTRY.filter(
  (entry) => entry.exposure === 'core-live'
).map((entry) => entry.path);

export const ARCHIVED_PLACEHOLDER_GOVERNED_PATHS = ROUTE_GOVERNANCE_REGISTRY.filter(
  (entry) => entry.exposure === 'archived-placeholder'
).map((entry) => entry.path);

export function getRouteGovernanceEntry(path: string): RouteGovernanceEntry | undefined {
  return ROUTE_GOVERNANCE_REGISTRY.find((entry) => entry.path === path);
}
