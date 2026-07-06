import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FundCompanyActualsFactsResponseSchema,
  type FundCompanyActualsFactsResponse,
} from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import {
  fundActualsFactsQueryKey,
  useFundActualsFacts,
} from '@/hooks/useFundActualsFacts';
import { apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', async (orig) => {
  const actual = await orig<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});
const mockApi = vi.mocked(apiRequest);

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const GENERATED_AT = '2026-07-01T00:00:00.000Z';

const responseFixture = FundCompanyActualsFactsResponseSchema.parse({
  fundId: 7,
  asOfDate: '2026-07-01',
  facts: [
    {
      fundId: 7,
      companyId: 101,
      companyName: 'Acme Robotics',
      investmentIds: [201],
      activeRoundIds: [301],
      approvedPlanningFmvMarkId: 401,
      planningFmvStatus: 'active',
      initialInvestmentAmount: '500000.000000',
      followOnInvestmentAmount: '250000.000000',
      amountOnlyNonEquityAmount: '0.000000',
      latestRoundDate: '2026-06-15',
      latestRoundValuation: '12000000.000000',
      latestPlanningFmvDate: '2026-07-01',
      latestPlanningFmvValue: '14000000.000000',
      currency: 'USD',
      currencyStatus: 'base_currency',
      supersedeLineage: [
        {
          roundId: 301,
          supersedesRoundId: null,
        },
      ],
      warnings: [
        {
          code: 'ROUND_MODEL_OVERRIDE_APPLIED',
          severity: 'info',
          message: 'Round role override was applied before fact generation.',
          source: 'round:301',
        },
      ],
      provenance: {
        trustState: 'LIVE',
        core: {
          sourceKind: 'computed',
          actionability: 'actionable',
          sourceEngine: 'fund-company-actuals-facts',
          engineVersion: 'fund-company-actuals-facts-v1',
          inputHash: HASH_A,
          assumptionsHash: HASH_B,
          generatedAt: GENERATED_AT,
          isFinanciallyActionable: true,
          warnings: [],
        },
        structuredWarnings: [
          {
            code: 'ROUND_MODEL_OVERRIDE_APPLIED',
            severity: 'info',
            message: 'Round role override was applied before fact generation.',
            source: 'round:301',
          },
        ],
        sourceAsOf: GENERATED_AT,
        staleAfterSeconds: 3600,
      },
      inputHash: HASH_C,
    },
  ],
  inputHash: HASH_A,
  generatedAt: GENERATED_AT,
}) satisfies FundCompanyActualsFactsResponse;

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useFundActualsFacts', () => {
  beforeEach(() => mockApi.mockReset());

  it('fetches actuals facts for a fund and as-of date', async () => {
    mockApi.mockResolvedValue(responseFixture as never);

    const { result } = renderHook(() => useFundActualsFacts(7, '2026-07-01'), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApi).toHaveBeenCalledWith(
      'GET',
      '/api/funds/7/actuals/facts?asOfDate=2026-07-01'
    );
    expect(result.current.facts).toEqual(responseFixture.facts);
    expect(result.current.response).toEqual(responseFixture);
  });

  it('fetches actuals facts without a query string when no as-of date is provided', async () => {
    mockApi.mockResolvedValue(responseFixture as never);

    const { result } = renderHook(() => useFundActualsFacts(7), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApi).toHaveBeenCalledWith('GET', '/api/funds/7/actuals/facts');
    expect(result.current.facts).toEqual(responseFixture.facts);
  });

  it('builds stable query keys with nullable missing values', () => {
    expect(fundActualsFactsQueryKey(7, '2026-07-01')).toEqual([
      'fund-actuals-facts',
      7,
      '2026-07-01',
    ]);
    expect(fundActualsFactsQueryKey(undefined)).toEqual([
      'fund-actuals-facts',
      null,
      null,
    ]);
  });

  it('is disabled without a fundId', () => {
    const { result } = renderHook(() => useFundActualsFacts(undefined), {
      wrapper: wrapper(),
    });

    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.facts).toEqual([]);
  });
});
