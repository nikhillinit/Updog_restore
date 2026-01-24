/**
 * Navigation Configuration
 *
 * Defines navigation items for legacy (25+ items) and new IA (5 routes).
 * Used by Sidebar component to switch based on enable_new_ia flag.
 */

import {
  Briefcase,
  Calculator,
  BarChart3,
  FileText,
  Activity,
  TrendingUp,
  Building2,
  Target,
  Percent,
  DollarSign,
  Clock,
  AlertTriangle,
  Settings,
  Monitor,
  LayoutDashboard,
  LineChart,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: any; // lucide-react icon component
  path?: string; // Optional for items that are just categories
}

/**
 * LEGACY NAVIGATION (25+ items)
 * Current production navigation - extracted from sidebar.tsx
 */
export const LEGACY_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'portfolio', label: 'Portfolio', icon: Building2 },
  { id: 'investments', label: 'Investments', icon: TrendingUp },
  { id: 'investments-table', label: 'Investments Table', icon: TrendingUp },
  { id: 'cap-tables', label: 'Cap Tables', icon: Calculator },
  { id: 'kpi-manager', label: 'KPI Manager', icon: Activity },
  { id: 'allocation-manager', label: 'Allocation Manager', icon: Calculator },
  { id: 'planning', label: 'Planning', icon: Briefcase },
  { id: 'forecasting', label: 'Forecasting', icon: TrendingUp },
  { id: 'scenario-builder', label: 'Scenario Builder', icon: Target },
  { id: 'moic-analysis', label: 'MOIC Analysis', icon: Calculator },
  { id: 'return-the-fund', label: 'Return the Fund', icon: TrendingUp },
  { id: 'partial-sales', label: 'Partial Sales', icon: Percent },
  { id: 'financial-modeling', label: 'Financial Modeling', icon: Calculator },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'portfolio-analytics', label: 'Portfolio Analytics', icon: Activity },
  { id: 'cash-management', label: 'Cash Management', icon: DollarSign },
  { id: 'secondary-market', label: 'Secondary Market', icon: Activity },
  { id: 'notion-integration', label: 'Notion Integration', icon: Settings },
  { id: 'sensitivity-analysis', label: 'Sensitivity Analysis', icon: Target },
  { id: 'time-travel', label: 'Time-Travel Analytics', icon: Clock },
  { id: 'variance-tracking', label: 'Variance Tracking', icon: AlertTriangle },
  { id: 'portfolio-constructor', label: 'Portfolio Constructor', icon: Settings },
  { id: 'dev-dashboard', label: 'Dev Dashboard', icon: Monitor },
  { id: 'reports', label: 'Reports', icon: FileText },
];

/**
 * NEW IA NAVIGATION (4 primary routes)
 * Consolidated information architecture per Codex-validated restructure
 *
 * Changes from previous 5-item structure:
 * - Dashboard (was Overview) - includes Performance tab (merged Analytics)
 * - Portfolio - Companies + Reserve Planning (merged Reallocation)
 * - Pipeline - New placeholder for deal tracking
 * - Reports - LP reports, cashflow exports
 *
 * Model/Operate functionality distributed to:
 * - Dashboard tabs (Performance, Cashflow)
 * - Company detail (Scenarios)
 * - Settings (Advanced features like Secondary Market)
 */
export const NEW_IA_NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: Briefcase,
    path: '/portfolio',
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    icon: LineChart,
    path: '/pipeline',
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: FileText,
    path: '/reports',
  },
];

/**
 * FOOTER NAVIGATION (2 items)
 * Settings and Help displayed below main nav in sidebar footer
 */
export const FOOTER_NAV_ITEMS: NavItem[] = [
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/settings',
  },
  {
    id: 'help',
    label: 'Help',
    icon: Activity,
    path: '/help',
  },
];
