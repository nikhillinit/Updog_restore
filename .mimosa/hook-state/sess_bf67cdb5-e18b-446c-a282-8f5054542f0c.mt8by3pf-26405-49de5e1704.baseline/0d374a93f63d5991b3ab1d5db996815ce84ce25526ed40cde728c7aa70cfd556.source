import React from 'react';
import { POVBrandHeader } from '@/components/ui/POVLogo';
import { PortfolioTabs } from '@/components/portfolio/PortfolioTabs';
import { useFundContext } from '@/contexts/FundContext';
import { WorkspaceBasisIndicator, WorkspaceNav } from '@/pages/fund-model-results/workspace-nav';

/**
 * ModernPortfolio - Main Portfolio Page with Tab Navigation
 *
 * Features two tabs:
 * - Companies: Portfolio companies table and metrics
 * - Reserve Planning: Fund allocation and reallocation tools (merged)
 *
 * Phase 1c implementation with URL state management
 */
export default function ModernPortfolio() {
  const { fundId, currentFund } = useFundContext();

  return (
    <div className="min-h-screen bg-pov-gray">
      <POVBrandHeader
        title="Portfolio"
        subtitle="Monitor and manage your portfolio companies and allocations"
        variant="light"
      />

      {/* Workspace row (D-F.2). Portfolio actuals are recorded facts: static
          "Basis: Current" indicator (D-E). */}
      <WorkspaceNav
        fundId={fundId !== null ? String(fundId) : null}
        fundLabel={currentFund?.name ?? 'No fund selected'}
        active="portfolio-actuals"
        indicator={<WorkspaceBasisIndicator mode="current" />}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <PortfolioTabs defaultTab="companies" syncWithUrl={true} />
      </div>
    </div>
  );
}
