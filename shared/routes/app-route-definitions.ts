export interface AppRouteDefinition {
  path: string;
  isProtected?: boolean;
}

export type RouteControlFlag = 'enable_lp_reporting' | 'onboarding_tour' | 'ui_catalog';

export const APP_ROUTE_DEFINITIONS = [
  { path: '/fund-setup' },
  { path: '/dashboard', isProtected: true },
  { path: '/portfolio/company/:id', isProtected: true },
  { path: '/portfolio', isProtected: true },
  { path: '/performance', isProtected: true },
  { path: '/forecasting', isProtected: true },
  { path: '/financial-modeling', isProtected: true },
  { path: '/model-results', isProtected: true },
  { path: '/fund-model-results/:fundId/scenarios', isProtected: true },
  { path: '/fund-model-results/:fundId/moic-analysis', isProtected: true },
  { path: '/fund-model-results/:fundId', isProtected: true },
  { path: '/sensitivity-analysis', isProtected: true },
  { path: '/reports', isProtected: true },
  { path: '/variance-tracking', isProtected: true },
  { path: '/pipeline', isProtected: true },
  { path: '/lp-reporting/ledger', isProtected: true },
  { path: '/lp-reporting/valuations', isProtected: true },
  { path: '/lp-reporting/metrics', isProtected: true },
  { path: '/lp-reporting/imports', isProtected: true },
  { path: '/settings', isProtected: true },
  { path: '/help' },
] as const satisfies readonly AppRouteDefinition[];

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
    path: '/moic-analysis',
    redirectTarget: '/overview',
    notes:
      'V1 MOIC analysis retired (#997): it served candidate-or-legacy rankings with no mode/stale/kill-switch disclosure. The disclosed surface is /fund-model-results/:fundId/moic-analysis.',
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

export interface LPRouteDefinition {
  path: string;
}

export const LP_ROUTE_DEFINITIONS = [
  { path: '/lp/dashboard' },
  { path: '/lp/fund-detail/:fundId' },
  { path: '/lp/capital-account' },
  { path: '/lp/performance' },
  { path: '/lp/reports' },
  { path: '/lp/settings' },
] as const satisfies readonly LPRouteDefinition[];

export const LP_INDEX_REDIRECT_PATH = '/lp';
export const LP_INDEX_REDIRECT_TARGET = '/lp/dashboard';

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
