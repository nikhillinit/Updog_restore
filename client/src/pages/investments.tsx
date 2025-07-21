import { useState } from 'react';
import { useLocation } from 'wouter';
import InvestmentsLayout from '@/components/investments/investments-layout';
import PortfolioCompanyDetail from '@/components/investments/portfolio-company-detail';

export default function InvestmentsPage() {
  const [location] = useLocation();
  
  // Check if we're viewing a specific company
  const isCompanyDetail = location.includes('/investments/company/');
  
  return (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      {isCompanyDetail ? (
        <PortfolioCompanyDetail />
      ) : (
        <InvestmentsLayout />
      )}
    </div>
  );
}