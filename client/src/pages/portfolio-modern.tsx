/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { POVBrandHeader } from "@/components/ui/POVLogo";
import { PortfolioTabs } from "@/components/portfolio/PortfolioTabs";

/**
 * ModernPortfolio - Main Portfolio Page with Tab Navigation
 *
 * Features three tabs:
 * - Overview: Portfolio companies table and metrics
 * - Allocations: Fund allocation breakdown and visualization
 * - Reallocation: Portfolio reallocation modeling tools
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
        <PortfolioTabs defaultTab="overview" syncWithUrl={true} />
      </div>
    </div>
  );
}

