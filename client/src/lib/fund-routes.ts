const QUERY_OR_HASH_PREFIX = /[?#]/;
const FUND_RESULTS_ROUTE_RE = /^\/fund-model-results\/(\d+)(?:\/)?$/;
const FUND_RESULTS_ROUTE_PREFIX = '/fund-model-results';

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
