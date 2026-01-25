 
 
 
 
 
import React from 'react';
import { POVBrandHeader } from "@/components/ui/POVLogo";
import { PortfolioTabs } from "@/components/portfolio/PortfolioTabs";

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

  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Portfolio"
        subtitle="Monitor and manage your portfolio companies and allocations"
        variant="light"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <PortfolioTabs defaultTab="companies" syncWithUrl={true} />
      </div>
    </div>
  );
}

