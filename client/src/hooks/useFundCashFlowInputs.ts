import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { shallow } from 'zustand/shallow';
import type { Investment } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { useFundContext } from '@/contexts/FundContext';
import { useFundSelector } from '@/stores/useFundSelector';
import {
  buildFundCashFlowInputs,
  type FundCashFlowInputs,
} from '@/lib/cashflow/fund-cashflow-inputs';

/**
 * Cashflow engine inputs for the current persisted fund. Undefined until the
 * fund and its investments are loaded. Investment period, fund life and
 * expenses come from the fund store when the wizard populated it, else defaults.
 */
export function useFundCashFlowInputs(
  fundId: string,
  horizonMonths: number
): FundCashFlowInputs | undefined {
  const { currentFund } = useFundContext();
  const fund = currentFund && String(currentFund.id) === fundId ? currentFund : null;

  const { data: investments } = useQuery<Investment[]>({
    queryKey: ['fund-cashflow-investments', fund?.id ?? null],
    enabled: fund != null,
    staleTime: 60_000,
    queryFn: () => apiRequest<Investment[]>('GET', `/api/investments?fundId=${fund?.id}`),
  });

  const [investmentPeriod, fundLife, fundExpenses] = useFundSelector(
    (s) => [s.investmentPeriod, s.fundLife, s.fundExpenses] as const,
    shallow
  );

  return useMemo(() => {
    if (!fund || !investments) return undefined;
    return buildFundCashFlowInputs({
      fund,
      investments,
      horizonMonths,
      config: {
        ...(investmentPeriod != null ? { investmentPeriodYears: investmentPeriod } : {}),
        ...(fundLife != null ? { fundLifeYears: fundLife } : {}),
        expenses: fundExpenses,
      },
    });
  }, [fund, investments, investmentPeriod, fundLife, fundExpenses, horizonMonths]);
}
