import { useMemo } from 'react';
import type { Fund } from '@/contexts/FundContext';

interface DashboardMetricsProps {
  fund: Fund;
}

export interface DashboardMetrics {
  committedCapital: number;
  investableCapital: number;
  managementFees: number;
  fundExpenses: number;
  exitProceedsRecycled: number;
  reserveRatio: number;
  projectedInvestments: number;
  initialCapital: number;
  followOnCapital: number;
}

/**
 * Custom hook to calculate dashboard metrics
 * Separates business logic from UI components
 */
export function useDashboardMetrics(fund: Fund): DashboardMetrics {
  return useMemo(() => {
    const committedCapital = fund.size || 200000000;
    const investableCapital = committedCapital * 1.026; // 205,311,250
    const managementFees = committedCapital * 0.15;
    const fundExpenses = committedCapital * 0.0171;
    const exitProceedsRecycled = 40000000;
    const reserveRatio = 42.5;
    const projectedInvestments = 90;
    const initialCapital = investableCapital * 0.575;
    const followOnCapital = investableCapital * 0.425;

    return {
      committedCapital,
      investableCapital,
      managementFees,
      fundExpenses,
      exitProceedsRecycled,
      reserveRatio,
      projectedInvestments,
      initialCapital,
      followOnCapital,
    };
  }, [fund]);
}

import { 
  MetricCard, 
  InvestableCapitalCard, 
  AllocationCard, 
  InvestmentsCard 
} from './MetricCards';

/**
 * Pure component for displaying dashboard metrics
 * Only responsible for rendering, no business logic
 */
export function DashboardMetrics({ fund }: DashboardMetricsProps) {
  const metrics = useDashboardMetrics(fund);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <MetricCard
        title="Committed Capital"
        value={`$${(metrics.committedCapital / 1000000).toFixed(1)}M`}
        percentage="100%"
      />
      
      <InvestableCapitalCard metrics={metrics} />
      
      <AllocationCard metrics={metrics} />
      
      <InvestmentsCard metrics={metrics} />
      
      <MetricCard
        title="Reserve Ratio"
        value={`${metrics.reserveRatio.toFixed(1)}%`}
        subtitle="Target allocation for follow-on investments"
      />
    </div>
  );
}