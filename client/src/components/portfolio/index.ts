/**
 * Portfolio Components - Phase 1c
 * Fund Allocation Management with Tab Navigation
 */

// Main tab container
export { PortfolioTabs } from './PortfolioTabs';
export type { PortfolioTabsProps, PortfolioTabValue } from './PortfolioTabs';

// Individual tab components
export { OverviewTab } from './tabs/OverviewTab';
export { AllocationsTab } from './tabs/AllocationsTab';
export { ReallocationTab } from './tabs/ReallocationTab';

// Type definitions
export type {
  PortfolioCompany,
  PortfolioMetrics,
  AllocationData,
  ReallocationScenario,
  TabComponentProps
} from './types';
