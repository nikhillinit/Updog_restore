const QUERY_OR_HASH_PREFIX = /[?#]/;
const FUND_RESULTS_ROUTE_RE = /^\/fund-model-results\/(\d+)(?:\/scenarios)?(?:\/)?$/;
const FUND_RESULTS_ROUTE_PREFIX = '/fund-model-results';
const ROUTE_SCOPED_FUND_CONTEXT_PATHS = new Set([
  '/financial-modeling',
  '/forecasting',
  '/model-results',
  '/portfolio',
]);

const FUND_CONTEXT_RECOVERY_PATHS = new Set([
  '/financial-modeling',
  '/forecasting',
  '/model-results',
  '/performance',
]);

export function getLocationPathname(location: string): string {
  const [pathname = '/'] = location.split(QUERY_OR_HASH_PREFIX, 1);
  return pathname || '/';
}

export function isFundResultsRoute(location: string): boolean {
  const pathname = getLocationPathname(location);
  return (
    pathname === FUND_RESULTS_ROUTE_PREFIX || pathname.startsWith(`${FUND_RESULTS_ROUTE_PREFIX}/`)
  );
}

export function extractFundResultsRouteId(location: string): number | null {
  const pathname = getLocationPathname(location);
  const match = pathname.match(FUND_RESULTS_ROUTE_RE);

  if (!match?.[1]) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getLocationSearch(location: string, explicitSearch = ''): string {
  if (explicitSearch) {
    return explicitSearch.startsWith('?') ? explicitSearch.slice(1) : explicitSearch;
  }

  const queryStart = location.indexOf('?');
  if (queryStart < 0) {
    return '';
  }

  const hashStart = location.indexOf('#', queryStart);
  return location.slice(queryStart + 1, hashStart < 0 ? undefined : hashStart);
}

export function extractRouteScopedFundId(location: string, search = ''): number | null {
  const resultsFundId = extractFundResultsRouteId(location);
  if (resultsFundId != null) {
    return resultsFundId;
  }

  const pathname = getLocationPathname(location);
  if (!ROUTE_SCOPED_FUND_CONTEXT_PATHS.has(pathname)) {
    return null;
  }

  const fundIdParam = new URLSearchParams(getLocationSearch(location, search)).get('fundId');
  if (!fundIdParam) {
    return null;
  }

  const parsed = Number(fundIdParam);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function requiresFundContextRecovery(location: string): boolean {
  return FUND_CONTEXT_RECOVERY_PATHS.has(getLocationPathname(location));
}
