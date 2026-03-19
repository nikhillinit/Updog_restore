/**
 * Liquidity Engine Hooks
 *
 * React hooks for liquidity analysis and forecasting via API.
 */

import { useMutation } from '@tanstack/react-query';
import type {
  CashTransaction,
  CashPosition,
  RecurringExpense,
  LiquidityForecast,
} from '@shared/types';
import type {
  CashFlowAnalysis,
  StressTestFactors,
  StressTestResult,
  PlannedInvestment,
  CapitalCallConstraints,
  OptimizedCapitalCallSchedule,
} from '@shared/core/liquidity';

interface AnalyzeInput {
  fundId: string;
  fundSize: number;
  transactions: CashTransaction[];
}

interface ForecastInput {
  fundId: string;
  fundSize: number;
  currentPosition: CashPosition;
  transactions?: CashTransaction[];
  recurringExpenses?: RecurringExpense[];
  months?: number;
}

interface StressTestInput {
  fundId: string;
  fundSize: number;
  currentPosition: CashPosition;
  stressFactors?: StressTestFactors;
}

interface OptimizeCallsInput {
  fundId: string;
  fundSize: number;
  currentPosition: CashPosition;
  plannedInvestments: PlannedInvestment[];
  constraints?: CapitalCallConstraints;
}

type ErrorResponse = {
  message?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json();
  return payload as T;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === 'object'
    && payload !== null
    && 'message' in payload
    && typeof (payload as ErrorResponse).message === 'string'
  ) {
    return (payload as ErrorResponse).message ?? fallback;
  }

  return fallback;
}

/**
 * Hook for analyzing cash flows
 */
export function useCashFlowAnalysis() {
  return useMutation<CashFlowAnalysis, Error, AnalyzeInput>({
    mutationFn: async (input: AnalyzeInput) => {
      const res = await fetch('/api/liquidity/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error: unknown = await res.json().catch(() => ({} as unknown));
        throw new Error(getErrorMessage(error, 'Cash flow analysis failed'));
      }

      return readJson<CashFlowAnalysis>(res);
    },
  });
}

/**
 * Hook for generating liquidity forecasts
 */
export function useLiquidityForecast() {
  return useMutation<LiquidityForecast, Error, ForecastInput>({
    mutationFn: async (input: ForecastInput) => {
      const res = await fetch('/api/liquidity/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error: unknown = await res.json().catch(() => ({} as unknown));
        throw new Error(getErrorMessage(error, 'Liquidity forecast failed'));
      }

      return readJson<LiquidityForecast>(res);
    },
  });
}

/**
 * Hook for running stress tests
 */
export function useStressTest() {
  return useMutation<StressTestResult, Error, StressTestInput>({
    mutationFn: async (input: StressTestInput) => {
      const res = await fetch('/api/liquidity/stress-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error: unknown = await res.json().catch(() => ({} as unknown));
        throw new Error(getErrorMessage(error, 'Stress test failed'));
      }

      return readJson<StressTestResult>(res);
    },
  });
}

/**
 * Hook for optimizing capital call schedules
 */
export function useOptimizeCapitalCalls() {
  return useMutation<OptimizedCapitalCallSchedule, Error, OptimizeCallsInput>({
    mutationFn: async (input: OptimizeCallsInput) => {
      const res = await fetch('/api/liquidity/optimize-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error: unknown = await res.json().catch(() => ({} as unknown));
        throw new Error(
          getErrorMessage(error, 'Capital call optimization failed')
        );
      }

      return readJson<OptimizedCapitalCallSchedule>(res);
    },
  });
}
