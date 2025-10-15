// Export all dashboard components
export { DashboardMetrics, useDashboardMetrics, type DashboardMetrics as DashboardMetricsType } from './components/DashboardMetrics';
export { MetricCard, InvestableCapitalCard, AllocationCard, InvestmentsCard } from './components/MetricCards';
export { DashboardTabs } from './components/DashboardTabs';
export { DashboardLoading } from './components/DashboardLoading';
export { default as DashboardRefactored } from './DashboardRefactored';

// Keep the original for backward compatibility
export { default as Dashboard } from './dashboard';