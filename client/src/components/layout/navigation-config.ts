import { FLAGS } from '@/core/flags/featureFlags';
import { extractFundResultsRouteId, getLocationPathname } from '@/lib/fund-routes';
import { isSecondarySurfaceNavVisible } from '@/lib/secondary-surface-policy';
import {
  BarChart3,
  Building2,
  TrendingUp,
  FileText,
  Settings,
  Calculator,
  Activity,
  Briefcase,
  Target,
  Percent,
  DollarSign,
  Clock,
  AlertTriangle,
  Monitor,
  LayoutDashboard,
  LineChart,
  HelpCircle,
  FlaskConical,
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

/**
 * Simplified IA (NEW_IA enabled)
 * Uses the same route-aware results destination as the full navigation.
 */
const SIMPLE_NAV: readonly NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    target: staticTarget('/dashboard'),
  },
  { id: 'portfolio', label: 'Portfolio', icon: Briefcase, target: staticTarget('/portfolio') },
  { id: 'pipeline', label: 'Pipeline', icon: LineChart, target: staticTarget('/pipeline') },
  MODEL_RESULTS_ITEM,
  {
    id: 'monte-carlo',
    label: 'Monte Carlo',
    icon: FlaskConical,
    target: staticTarget('/monte-carlo'),
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

// Full navigation (streamlined)
const FULL_NAV: readonly NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, target: staticTarget('/dashboard') },
  { id: 'portfolio', label: 'Portfolio', icon: Building2, target: staticTarget('/portfolio') },
  {
    id: 'allocation-manager',
    label: 'Allocation Manager',
    icon: Calculator,
    target: staticTarget('/allocation-manager'),
  },
  { id: 'planning', label: 'Planning', icon: Briefcase, target: staticTarget('/planning') },
  {
    id: 'forecasting',
    label: 'Forecasting',
    icon: TrendingUp,
    target: staticTarget('/forecasting'),
  },
  {
    id: 'scenario-builder',
    label: 'Scenario Builder',
    icon: Target,
    target: staticTarget('/scenario-builder'),
  },
  {
    id: 'moic-analysis',
    label: 'MOIC Analysis',
    icon: Calculator,
    target: staticTarget('/moic-analysis'),
  },
  {
    id: 'return-the-fund',
    label: 'Return the Fund',
    icon: TrendingUp,
    target: staticTarget('/return-the-fund'),
  },
  {
    id: 'partial-sales',
    label: 'Partial Sales',
    icon: Percent,
    target: staticTarget('/partial-sales'),
  },
  {
    id: 'financial-modeling',
    label: 'Financial Modeling',
    icon: Calculator,
    target: staticTarget('/financial-modeling'),
  },
  MODEL_RESULTS_ITEM,
  {
    id: 'performance',
    label: 'Performance',
    icon: TrendingUp,
    target: staticTarget('/performance'),
  },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, target: staticTarget('/analytics') },
  {
    id: 'portfolio-analytics',
    label: 'Portfolio Analytics',
    icon: Activity,
    target: staticTarget('/portfolio-analytics'),
  },
  {
    id: 'cash-management',
    label: 'Cash Management',
    icon: DollarSign,
    target: staticTarget('/cash-management'),
  },
  {
    id: 'secondary-market',
    label: 'Secondary Market',
    icon: Activity,
    target: staticTarget('/secondary-market'),
  },
  {
    id: 'notion-integration',
    label: 'Notion Integration',
    icon: Settings,
    target: staticTarget('/notion-integration'),
  },
  {
    id: 'sensitivity-analysis',
    label: 'Sensitivity Analysis',
    icon: Target,
    target: staticTarget('/sensitivity-analysis'),
  },
  {
    id: 'time-travel',
    label: 'Time-Travel Analytics',
    icon: Clock,
    target: staticTarget('/time-travel'),
  },
  {
    id: 'variance-tracking',
    label: 'Variance Tracking',
    icon: AlertTriangle,
    target: staticTarget('/variance-tracking'),
  },
  {
    id: 'portfolio-constructor',
    label: 'Portfolio Constructor',
    icon: Settings,
    target: staticTarget('/portfolio-constructor'),
  },
  {
    id: 'monte-carlo',
    label: 'Monte Carlo',
    icon: FlaskConical,
    target: staticTarget('/monte-carlo'),
  },
  {
    id: 'dev-dashboard',
    label: 'Dev Dashboard',
    icon: Monitor,
    target: staticTarget('/dev-dashboard'),
  },
  { id: 'reports', label: 'Reports', icon: FileText, target: staticTarget('/reports') },
  { id: 'settings', label: 'Settings', icon: Settings, target: staticTarget('/settings') },
];

// Note: Removed redundant items:
// - 'investments' and 'investments-table' (redundant with Portfolio)
// - 'cap-tables' (not relevant for fund dashboard)
// - 'kpi-manager' (moved to Settings page)

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
  const items = FLAGS.NEW_IA ? SIMPLE_NAV : FULL_NAV;
  return items.filter((item) => isSecondarySurfaceNavVisible(item.id));
}

export function getFooterNavigationItems(): readonly NavigationItem[] {
  return FLAGS.NEW_IA ? FOOTER_NAV : [];
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
