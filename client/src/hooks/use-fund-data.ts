import { useQuery } from '@tanstack/react-query';
import type { PortfolioCompany } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

export function useFundData() {
  const { data: funds, isLoading } = useQuery<unknown[]>({
    queryKey: ['/api/funds'],
  });

  const hasFundData = funds && Array.isArray(funds) && funds.length > 0;
  const needsSetup = !hasFundData;

  return {
    funds,
    isLoading,
    hasFundData,
    needsSetup,
    primaryFund: hasFundData && Array.isArray(funds) ? funds[0]! : null,
  };
}

export type PortfolioCompaniesMode = 'live' | 'historical';
export type PortfolioCompaniesSource = 'live' | 'snapshot';
export type PortfolioCompaniesEmptyReason =
  | 'no_snapshot'
  | 'unsupported_snapshot'
  | 'no_companies_at_date';

export interface PortfolioCompaniesMeta {
  mode: PortfolioCompaniesMode;
  requestedAsOf: string | null;
  resolvedAsOf: string | null;
  source: PortfolioCompaniesSource;
  historicalAvailable: boolean;
  emptyReason?: PortfolioCompaniesEmptyReason;
}

export interface PortfolioCompaniesResponse {
  companies: PortfolioCompany[];
  meta: PortfolioCompaniesMeta;
}

export function usePortfolioCompany(fundId?: number, companyId?: number) {
  const { data, isLoading, error } = useQuery<PortfolioCompany>({
    queryKey: ['portfolio-company', fundId ?? null, companyId ?? null],
    enabled: !!fundId && !!companyId,
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('fundId', String(fundId));

      return apiRequest<PortfolioCompany>(
        'GET',
        `/api/portfolio-companies/${companyId}?${searchParams.toString()}`
      );
    },
    staleTime: 60_000,
  });

  return {
    company: data ?? null,
    isLoading,
    error,
  };
}

export function usePortfolioCompanies(
  fundId?: number,
  options: { asOf?: string } = {}
) {
  const { asOf } = options;
  const { data, isLoading, error } = useQuery<PortfolioCompaniesResponse>({
    queryKey: ['portfolio-companies', fundId ?? null, asOf ?? null],
    enabled: !!fundId,
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('fundId', String(fundId));
      if (asOf) {
        searchParams.set('asOf', asOf);
      }

      return apiRequest<PortfolioCompaniesResponse>(
        'GET',
        `/api/portfolio-companies?${searchParams.toString()}`
      );
    },
    staleTime: 60_000,
  });

  return {
    portfolioCompanies: data?.companies || [],
    meta:
      data?.meta || {
        mode: 'live',
        requestedAsOf: null,
        resolvedAsOf: null,
        source: 'live',
        historicalAvailable: false,
      },
    isLoading,
    error,
  };
}
