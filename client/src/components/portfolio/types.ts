/**
 * Portfolio Tab Types
 * Type definitions for the Portfolio tabs feature (Phase 1c)
 */

/**
 * Available tab values for the Portfolio page
 */
export type PortfolioTabValue = 'overview' | 'allocations' | 'reallocation';

/**
 * Props for the main PortfolioTabs component
 */
export interface PortfolioTabsProps {
  /**
   * Default tab to display on initial load
   * @default 'overview'
   */
  defaultTab?: PortfolioTabValue;

  /**
   * Callback fired when the active tab changes
   */
  onTabChange?: (tab: PortfolioTabValue) => void;

  /**
   * If true, sync active tab with URL query parameter (?tab=allocations)
   * @default true
   */
  syncWithUrl?: boolean;
}

/**
 * Portfolio company data structure (shared across tabs)
 */
export interface PortfolioCompany {
  id: string;
  company: string;
  sector: string;
  stage: string;
  investmentDate: string;
  initialInvestment: number;
  currentValue: number;
  ownershipPercent: number;
  moic: number;
  status: 'active' | 'exited' | 'written-off';
  lastFunding: string;
  lastFundingAmount: number;
}

/**
 * Portfolio metrics summary
 */
export interface PortfolioMetrics {
  totalCompanies: number;
  activeCompanies: number;
  exitedCompanies: number;
  totalInvested: number;
  totalValue: number;
  averageMOIC: number;
}

/**
 * Allocation data by sector or stage
 */
export interface AllocationData {
  category: string; // Sector name or stage name
  allocated: number; // Amount allocated in dollars
  percentage: number; // Percentage of total fund
  companies: number; // Number of companies in this category
  avgCheck: number; // Average check size
}

/**
 * Reallocation scenario data
 */
export interface ReallocationScenario {
  id: string;
  name: string;
  status: 'draft' | 'pending' | 'completed';
  created: string; // ISO date string
  description: string;
  impact: string; // Description of projected impact
  projectedMOIC?: number;
  riskReduction?: number;
  capitalRequired?: number;
}

/**
 * Tab-specific props for individual tab components
 */
export interface TabComponentProps {
  /**
   * Optional className for custom styling
   */
  className?: string;
}
