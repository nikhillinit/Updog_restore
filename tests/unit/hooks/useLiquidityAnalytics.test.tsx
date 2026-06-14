import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLiquidityAnalytics } from '@/hooks/useLiquidityAnalytics';
import type { CashTransaction } from '@shared/types';

const baseOptions = {
  fundId: '1',
  fundSize: 100_000_000,
  autoRefresh: false,
  enableRealTimeAlerts: false,
} as const;

const transactionDate = new Date('2026-01-31T00:00:00.000Z');

function createTransaction(): CashTransaction {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    fundId: '1',
    type: 'capital_call',
    amount: 1_000_000,
    currency: 'USD',
    plannedDate: transactionDate,
    executedDate: transactionDate,
    status: 'executed',
    description: 'Capital call transaction',
    createdAt: transactionDate,
    updatedAt: transactionDate,
    createdBy: 'system',
    quarterEnd: false,
  };
}

describe('useLiquidityAnalytics', () => {
  it('renders empty states (no fabricated data) when fallback is off', async () => {
    const { result } = renderHook(() => useLiquidityAnalytics({ ...baseOptions }));

    expect(result.current.isDemoData).toBe(false);

    await act(async () => {
      await result.current.runCashFlowAnalysis();
    });
    await waitFor(() => expect(result.current.cashFlowAnalysis).toBeNull());

    await act(async () => {
      await result.current.generateLiquidityForecast();
    });
    await waitFor(() => expect(result.current.liquidityForecast).toBeNull());

    await act(async () => {
      await result.current.runStressTest();
    });
    await waitFor(() => expect(result.current.stressTestResult).toBeNull());
  });

  it('produces demo data and flags isDemoData when fallback is opt-in', async () => {
    const { result } = renderHook(() =>
      useLiquidityAnalytics({ ...baseOptions, allowDemoFallback: true })
    );

    expect(result.current.isDemoData).toBe(true);

    await act(async () => {
      await result.current.runCashFlowAnalysis();
    });
    await waitFor(() => expect(result.current.cashFlowAnalysis).not.toBeNull());

    await act(async () => {
      await result.current.runStressTest();
    });
    await waitFor(() => expect(result.current.stressTestResult).not.toBeNull());
  });

  it('does not flag demo when real transactions are provided', () => {
    const transactions: CashTransaction[] = [createTransaction()];
    const { result } = renderHook(() => useLiquidityAnalytics({ ...baseOptions, transactions }));

    expect(result.current.isDemoData).toBe(false);
  });
});
