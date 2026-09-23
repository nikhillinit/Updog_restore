const QUERY_OR_HASH_PREFIX = /[?#]/;
const FUND_RESULTS_ROUTE_RE =
  /^\/fund-model-results\/(\d+)(?:\/(?:scenarios|reports|analysis|internal-analysis|moic-analysis|operations))?\/?$/;
const FUND_RESULTS_ROUTE_PREFIX = '/fund-model-results';
const ROUTE_SCOPED_FUND_CONTEXT_PATHS = new Set([
  '/dashboard',
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

export function getLocationSearch(location: string, explicitSearch = ''): string {
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

export type FundIdParam = { kind: 'absent' } | { kind: 'valid'; id: number } | { kind: 'invalid' };

/** Distinguish absent, valid and invalid `fundId` query values; duplicates are invalid. */
export function parseFundIdParam(search: string): FundIdParam {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const values = params.getAll('fundId');
  if (values.length === 0) return { kind: 'absent' };
  if (values.length > 1) return { kind: 'invalid' };
  const raw = values[0] ?? '';
  const parsed = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0
    ? { kind: 'valid', id: parsed }
    : { kind: 'invalid' };
}

export const DASHBOARD_PATH = '/dashboard';
export const DASHBOARD_TABS = ['overview', 'performance', 'cashflow'] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export type DashboardView =
  | { view: 'workspace'; tab: null; fundId: FundIdParam; normalized: boolean }
  | { view: 'analytics'; tab: DashboardTab; fundId: FundIdParam; normalized: boolean };

function isDashboardTab(value: string | null): value is DashboardTab {
  return value != null && (DASHBOARD_TABS as readonly string[]).includes(value);
}

/**
 * /dashboard with a recognized single `tab` is the analytics view; anything else
 * is the account-wide Workspace. `normalized` is false when the URL carried an
 * unknown or duplicate tab and should be rewritten (replace) to the Workspace.
 */
export function resolveDashboardView(location: string, search = ''): DashboardView | null {
  if (getLocationPathname(location) !== DASHBOARD_PATH) return null;
  const params = new URLSearchParams(getLocationSearch(location, search));
  const tabs = params.getAll('tab');
  const fundId = parseFundIdParam(params.toString());
  if (tabs.length === 0) return { view: 'workspace', tab: null, fundId, normalized: true };
  const [tab] = tabs;
  if (tabs.length === 1 && isDashboardTab(tab ?? null)) {
    return { view: 'analytics', tab: tab as DashboardTab, fundId, normalized: true };
  }
  return { view: 'workspace', tab: null, fundId, normalized: false };
}

/** Only tab, fundId and supported mode activation change on /dashboard. */
export function buildDashboardHref(
  tab: DashboardTab | null,
  fundId: number | null,
  currentSearch = ''
): string {
  const params = new URLSearchParams();
  if (tab) params.set('tab', tab);
  if (fundId != null) params.set('fundId', String(fundId));
  const currentParams = new URLSearchParams(
    currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch
  );
  if (currentParams.has('demo')) params.set('demo', currentParams.get('demo') ?? '');
  const query = params.toString();
  return query ? `${DASHBOARD_PATH}?${query}` : DASHBOARD_PATH;
}
