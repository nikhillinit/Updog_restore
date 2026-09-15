import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLiquidityAnalytics } from '@/hooks/useLiquidityAnalytics';
import type { CashPosition, CashTransaction } from '@shared/types';

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

function createPosition(): CashPosition {
  return {
    fundId: '1',
    asOfDate: transactionDate,
    bankAccounts: [],
    totalCash: 500_000,
    totalCommitted: 90_000_000,
    totalDeployed: 9_500_000,
    availableLiquidity: 500_000,
    pendingInflows: 0,
    pendingOutflows: 0,
    netPending: 0,
    dryPowder: 80_000_000,
    reserveRequirement: 0,
    availableInvestment: 80_000_000,
    createdAt: transactionDate,
    updatedAt: transactionDate,
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

  it('projects only upcoming transactions in the forecast', async () => {
    const transactions: CashTransaction[] = [
      createTransaction(),
      {
        ...createTransaction(),
        id: '22222222-2222-4222-8222-222222222222',
        amount: 2_000_000,
        status: 'planned',
        plannedDate: new Date('2027-01-31T00:00:00.000Z'),
      },
    ];
    const { result } = renderHook(() =>
      useLiquidityAnalytics({ ...baseOptions, transactions, currentPosition: createPosition() })
    );

    await act(async () => {
      await result.current.generateLiquidityForecast();
    });
    await waitFor(() =>
      expect(result.current.liquidityForecast?.plannedCapitalCalls).toBeCloseTo(2_000_000, 0)
    );
  });
});
