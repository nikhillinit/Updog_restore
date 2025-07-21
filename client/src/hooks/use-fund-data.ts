import { useQuery } from '@tanstack/react-query';

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
  const { data: portfolioCompanies, isLoading } = useQuery({
    queryKey: ['/api/portfolio-companies', fundId],
    enabled: !!fundId,
  });

  return {
    portfolioCompanies: portfolioCompanies || [],
    isLoading,
  };
}