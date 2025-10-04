/**
 * Legacy Route Mapping
 *
 * Maps old navigation routes to new 5-route IA.
 * Used by LegacyRouteRedirector when enable_new_ia flag is ON.
 *
 * Pattern: Old route → New consolidated route
 */

export const LEGACY_ROUTE_MAP = new Map<string, string>([
  // Dashboard → Overview
  ['/dashboard', '/overview'],

  // Portfolio-related → Portfolio
  ['/portfolio', '/portfolio'], // Already correct
  ['/investments', '/portfolio'],
  ['/investments-table', '/portfolio'],
  ['/cap-tables', '/portfolio'], // Now a tab in company detail
  ['/companies', '/portfolio'],
  ['/portfolio-analytics', '/portfolio'],
  ['/portfolio-constructor', '/portfolio'],

  // Modeling/Planning → Model
  ['/planning', '/model'],
  ['/forecasting', '/model'],
  ['/scenario-builder', '/model'],
  ['/financial-modeling', '/model'],
  ['/allocation-manager', '/model'],
  ['/moic-analysis', '/model'],
  ['/return-the-fund', '/model'],
  ['/partial-sales', '/model'],
  ['/sensitivity-analysis', '/model'],

  // Operations/Management → Operate
  ['/kpi-manager', '/operate'],
  ['/cash-management', '/operate'],
  ['/variance-tracking', '/operate'],
  ['/notion-integration', '/operate'],
  ['/dev-dashboard', '/operate'],

  // Analytics/Reporting → Report
  ['/performance', '/report'],
  ['/analytics', '/report'],
  ['/reports', '/report'],
  ['/secondary-market', '/report'],
  ['/time-travel', '/report'],
]);

/**
 * Check if a path should be redirected
 */
export function shouldRedirect(pathname: string): boolean {
  return LEGACY_ROUTE_MAP.has(pathname);
}

/**
 * Get redirect target for a legacy path
 */
export function getRedirectTarget(pathname: string): string | undefined {
  return LEGACY_ROUTE_MAP.get(pathname);
}
