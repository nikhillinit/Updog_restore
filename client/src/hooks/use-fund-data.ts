/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useQuery } from '@tanstack/react-query';
import type { PortfolioCompany } from '@shared/schema';

export function useFundData() {
  const { data: funds, isLoading } = useQuery({
    queryKey: ['/api/funds'],
  });

  const hasFundData = funds && Array.isArray(funds) && funds.length > 0;
  const needsSetup = !hasFundData;

  return {
    funds,
    isLoading,
    hasFundData,
    needsSetup,
    primaryFund: hasFundData && Array.isArray(funds) ? funds[0] : null,
  };
}

export function usePortfolioCompanies(fundId?: number) {
  const { data: portfolioCompanies, isLoading } = useQuery<PortfolioCompany[]>({
    queryKey: ['/api/portfolio-companies', fundId],
    enabled: !!fundId,
  });

  return {
    portfolioCompanies: portfolioCompanies || [],
    isLoading,
  };
}
