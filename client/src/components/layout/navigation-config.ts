import { FLAGS } from '@/core/flags/featureFlags';
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
  Monitor
} from 'lucide-react';

// 5-item simplified IA (NEW_IA enabled)
const SIMPLE_NAV = [
  { id: 'dashboard', label: 'Overview', icon: BarChart3 },
  { id: 'portfolio', label: 'Portfolio', icon: Building2 },
  { id: 'financial-modeling', label: 'Model', icon: TrendingUp },
  { id: 'cash-management', label: 'Operate', icon: Settings },
  { id: 'reports', label: 'Report', icon: FileText }
];

// Full navigation (streamlined)
const FULL_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'portfolio', label: 'Portfolio', icon: Building2 },
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
  { id: 'settings', label: 'Settings', icon: Settings }, // KPI Manager, preferences, etc.
];

// Note: Removed redundant items:
// - 'investments' and 'investments-table' (redundant with Portfolio)
// - 'cap-tables' (not relevant for fund dashboard)
// - 'kpi-manager' (moved to Settings page)

export function getNavigationItems() {
  return FLAGS.NEW_IA ? SIMPLE_NAV : FULL_NAV;
}
