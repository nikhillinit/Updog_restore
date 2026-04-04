import { extractFundResultsRouteId, getLocationPathname } from '@/lib/fund-routes';
import {
  FileText,
  Settings,
  Calculator,
  Briefcase,
  LayoutDashboard,
  LineChart,
  HelpCircle,
  Target,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type StaticNavigationTarget = {
  kind: 'static';
  path: string;
  matchPrefixes: readonly string[];
};

type FundResultsNavigationTarget = {
  kind: 'fund-results';
  basePath: '/fund-model-results';
  matchPrefixes: readonly ['/fund-model-results'];
};

type NavigationTarget = StaticNavigationTarget | FundResultsNavigationTarget;

export interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
  target: NavigationTarget;
}

export interface NavigationContext {
  location: string;
  currentFundId: number | null;
  needsSetup: boolean;
}

function staticTarget(
  path: string,
  matchPrefixes: readonly string[] = [path]
): StaticNavigationTarget {
  return { kind: 'static', path, matchPrefixes };
}

const FUND_RESULTS_TARGET: FundResultsNavigationTarget = {
  kind: 'fund-results',
  basePath: '/fund-model-results',
  matchPrefixes: ['/fund-model-results'],
};

const MODEL_RESULTS_ITEM: NavigationItem = {
  id: 'model-results',
  label: 'Model Results',
  icon: Calculator,
  target: FUND_RESULTS_TARGET,
};

const CORE_NAV: readonly NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    target: staticTarget('/dashboard'),
  },
  { id: 'portfolio', label: 'Portfolio', icon: Briefcase, target: staticTarget('/portfolio') },
  { id: 'pipeline', label: 'Pipeline', icon: LineChart, target: staticTarget('/pipeline') },
  {
    id: 'financial-modeling',
    label: 'Forecasting',
    icon: Calculator,
    target: staticTarget('/financial-modeling'),
  },
  MODEL_RESULTS_ITEM,
  {
    id: 'sensitivity-analysis',
    label: 'Backtesting',
    icon: Target,
    target: staticTarget('/sensitivity-analysis'),
  },
  { id: 'reports', label: 'Reports', icon: FileText, target: staticTarget('/reports') },
];

/**
 * Footer navigation items (Settings + Help)
 * Displayed below main nav in sidebar footer
 */
const FOOTER_NAV: readonly NavigationItem[] = [
  { id: 'settings', label: 'Settings', icon: Settings, target: staticTarget('/settings') },
  { id: 'help', label: 'Help', icon: HelpCircle, target: staticTarget('/help') },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesNavigationItem(item: NavigationItem, location: string): boolean {
  const pathname = getLocationPathname(location);
  return item.target.matchPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

function resolveFundResultsHref(context: NavigationContext): string | null {
  const preferredFundId = extractFundResultsRouteId(context.location) ?? context.currentFundId;
  return preferredFundId != null ? `/fund-model-results/${preferredFundId}` : null;
}

export function resolveNavigationHref(
  item: NavigationItem,
  context: NavigationContext
): string | null {
  if (item.target.kind === 'fund-results') {
    return resolveFundResultsHref(context);
  }

  return item.target.path;
}

export function isNavigationItemEnabled(item: NavigationItem, context: NavigationContext): boolean {
  if (context.needsSetup) {
    return false;
  }

  if (item.target.kind === 'fund-results') {
    return resolveFundResultsHref(context) != null;
  }

  return true;
}

export function getNavigationItems(): readonly NavigationItem[] {
  return CORE_NAV;
}

export function getFooterNavigationItems(): readonly NavigationItem[] {
  return FOOTER_NAV;
}

export function getActiveNavigationId(location: string): string {
  const navItems = [...getNavigationItems(), ...getFooterNavigationItems()];
  const matchedItem = navItems.find((item) => matchesNavigationItem(item, location));

  if (matchedItem) {
    return matchedItem.id;
  }

  const pathname = getLocationPathname(location);
  const [rootSegment = 'fund-setup'] = pathname.replace(/^\/+/, '').split('/');
  return rootSegment || 'fund-setup';
}
