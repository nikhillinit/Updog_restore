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
  ['/companies', '/portfolio'],
  ['/portfolio-constructor', '/portfolio'],

  // Operations/Management → Operate
  ['/kpi-manager', '/operate'],
  ['/variance-tracking', '/operate'],
  ['/notion-integration', '/operate'],
  ['/dev-dashboard', '/operate'],

  // Analytics/Reporting → Report
  ['/performance', '/report'],
  ['/analytics', '/report'],
  ['/reports', '/report'],
  ['/secondary-market', '/report'],
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
