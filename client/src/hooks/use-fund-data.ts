import { useQuery } from '@tanstack/react-query';
import type { PortfolioCompany } from '@shared/schema';
import {
  PortfolioOverviewResponseV1Schema,
  type PortfolioOverviewResponseV1,
} from '@shared/contracts/portfolio-overview-v1.contract';
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

export function usePortfolioCompanies(fundId?: number, options: { asOf?: string } = {}) {
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
    meta: data?.meta || {
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

const DEFAULT_OVERVIEW_META: PortfolioOverviewResponseV1['meta'] = {
  mode: 'live',
  requestedAsOf: null,
  resolvedAsOf: null,
  source: 'live',
  historicalAvailable: false,
};

/**
 * Server-computed portfolio overview (KPIs + per-company MOIC) for a fund.
 *
 * Trusted-only: the response is validated against the strict
 * `PortfolioOverviewResponseV1Schema`. On request error or invalid/missing
 * provenance the hook reports `isUnavailable` rather than returning zeroed
 * metrics, so the UI can fail closed instead of rendering an unprovenanced
 * (and possibly empty-looking) financial summary.
 */
export function usePortfolioOverview(fundId?: number, options: { asOf?: string } = {}) {
  const { asOf } = options;
  const { data, isLoading, isError } = useQuery<PortfolioOverviewResponseV1>({
    queryKey: ['portfolio-overview', fundId ?? null, asOf ?? null],
    enabled: !!fundId,
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('fundId', String(fundId));
      if (asOf) {
        searchParams.set('asOf', asOf);
      }

      const raw = await apiRequest<unknown>(
        'GET',
        `/api/portfolio-overview?${searchParams.toString()}`
      );
      return PortfolioOverviewResponseV1Schema.parse(raw);
    },
    staleTime: 60_000,
  });

  const overview = data ?? null;
  const meta: PortfolioOverviewResponseV1['meta'] = overview?.meta ?? DEFAULT_OVERVIEW_META;
  const isUnavailable =
    !isLoading && (isError || overview === null || !overview.provenance.isFinanciallyActionable);
  const isHistoricalEmpty = meta.mode === 'historical' && !meta.historicalAvailable;

  return { data: overview, meta, isLoading, isUnavailable, isHistoricalEmpty };
}
