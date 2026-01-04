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
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Cash flow analysis failed');
      }

      return res.json();
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
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Liquidity forecast failed');
      }

      return res.json();
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
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Stress test failed');
      }

      return res.json();
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
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Capital call optimization failed');
      }

      return res.json();
    },
  });
}
