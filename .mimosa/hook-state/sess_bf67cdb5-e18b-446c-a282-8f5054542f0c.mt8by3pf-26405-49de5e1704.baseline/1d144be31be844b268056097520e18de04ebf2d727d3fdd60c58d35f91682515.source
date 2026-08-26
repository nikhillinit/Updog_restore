import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AnalysisDraftV1,
  AnalysisReferenceV1,
} from '@shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import {
  defaultInternalEconomicsSelection,
  groupInternalEconomicsPins,
  projectInternalEconomicsPins,
  selectInternalEconomicsRun,
  useInternalEconomics,
  type InternalEconomicsPin,
} from '@/hooks/useInternalEconomics';
import { apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockApiRequest = vi.mocked(apiRequest);

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function pin(overrides: Partial<InternalEconomicsPin> = {}): InternalEconomicsPin {
  return {
    sourceKind: 'draft',
    sourceId: 1,
    runId: 1,
    period: { periodKind: 'quarterly', periodStart: '2026-04-01', periodEnd: '2026-06-30' },
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    createdAt: '2026-07-01T00:00:00.000Z',
    knowledgeCutoff: '2026-06-30T23:59:59.000Z',
    analysisFactsSnapshotId: 5,
    mixedBasisAtSave: false,
    ...overrides,
  };
}

function draft(overrides: Partial<AnalysisDraftV1> = {}): AnalysisDraftV1 {
  return {
    contractVersion: 'analysis-reference-snapshot-v1',
    draftId: 1,
    fundId: 7,
    period: { periodKind: 'quarterly', periodStart: '2026-04-01', periodEnd: '2026-06-30' },
    basis: {
      financialFactsSnapshotId: 5,
      knowledgeCutoff: '2026-06-30T23:59:59.000Z',
      forecastFundSnapshotId: 6,
      reserveReferenceId: null,
      economicsReferenceId: 11,
    },
    sourceReferenceId: null,
    savedAt: null,
    version: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function reference(overrides: Partial<AnalysisReferenceV1> = {}): AnalysisReferenceV1 {
  return {
    contractVersion: 'analysis-reference-snapshot-v1',
    referenceId: 2,
    fundId: 7,
    period: { periodKind: 'quarterly', periodStart: '2026-04-01', periodEnd: '2026-06-30' },
    basis: {
      financialFactsSnapshotId: 5,
      knowledgeCutoff: '2026-06-30T23:59:59.000Z',
      forecastFundSnapshotId: 6,
      reserveReferenceId: null,
      economicsReferenceId: 11,
    },
    mixedBasisAtSave: true,
    supersedesReferenceId: null,
    sourceDraftId: 1,
    createdBy: 3,
    createdAt: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

function receipt(runId: number, fundId = 7) {
  const hash = 'a'.repeat(64);
  return {
    receiptVersion: 'internal-lp-economics-run-receipt/1.0.0',
    runId,
    fundId,
    createdAt: '2026-06-30T23:59:59.000Z',
    basis: {
      policyVersionId: 3,
      capitalEnvelopeVersionId: 4,
      factsSnapshotId: 5,
      knowledgeCutoff: '2026-06-30T00:00:00.000Z',
      planVersionId: 6,
      forecastSnapshotId: 7,
      evaluationClock: '2026-06-30T23:59:59.000Z',
      terminalMode: 'hold_unrealized',
      terminalPeriodEnd: '2026-09-30',
      terminalResolutionMethodologyVersion: 'terminal-resolution/1.0.0',
    },
    versions: {
      calculationContractVersion: 'lp-economics/1.1.0',
      engineVersion: 'cash-assembly-period-loop-v1/1.1.0',
      methodologyVersion: 'cash-assembly-period-loop-methodology/1.1.0',
      resultCalculationVersion: 'lp-economics/1.1.0',
    },
    hashes: {
      capitalEnvelopeHash: hash,
      policyAssumptionsHash: hash,
      factsSnapshotInputHash: hash,
      planAssumptionsHash: hash,
      forecastInputHash: hash,
      inputHash: hash,
      resultHash: hash,
    },
    outcome: {
      runState: 'completed',
      result: {
        waterfallTemplate: 'deal_by_deal',
        resultStatus: 'unavailable',
        clock: '2026-06-30T23:59:59.000Z',
        currency: 'USD',
        perspective: 'lp_net',
        precisionMode: 'decimal_native_with_float64_xirr',
        reasons: [{ code: 'MAIN_FUND_VEHICLE_ABSENT' }],
      },
    },
  } as const;
}

describe('internal economics pin projection and selection', () => {
  it('keeps open drafts and references, groups duplicate run lineage, and applies total ordering', () => {
    const pins = projectInternalEconomicsPins(
      [
        draft(),
        draft({ draftId: 3, savedAt: '2026-07-03T00:00:00.000Z' }),
        draft({
          draftId: 4,
          basis: { ...draft().basis, economicsReferenceId: null },
        }),
      ],
      [reference()]
    );
    const groups = groupInternalEconomicsPins([
      ...pins,
      pin({ runId: 12, sourceId: 8, period: { periodKind: 'quarterly', periodStart: '2026-07-01', periodEnd: '2026-09-30' } }),
      pin({ runId: 13, sourceId: 9, period: { periodKind: 'quarterly', periodStart: '2026-07-01', periodEnd: '2026-09-30' } }),
    ]);

    expect(pins).toHaveLength(2);
    expect(groups.map((group) => group.runId)).toEqual([13, 12, 11]);
    expect(groups[2]?.pins.map((candidate) => candidate.sourceKind)).toEqual(['draft', 'reference']);
    expect(groups[2]?.pins[1]).toMatchObject({ sourceId: 2, mixedBasisAtSave: true });
  });

  it('chooses latest current plus an earlier-period baseline, with zero/one-group fallbacks', () => {
    const newest = groupInternalEconomicsPins([
      pin({ runId: 30, sourceId: 4, period: { periodKind: 'quarterly', periodStart: '2026-07-01', periodEnd: '2026-09-30' } }),
      pin({ runId: 29, sourceId: 2, period: { periodKind: 'quarterly', periodStart: '2026-07-01', periodEnd: '2026-09-30' } }),
      pin({ runId: 20, sourceId: 3 }),
    ]);

    expect(defaultInternalEconomicsSelection([])).toEqual({ baselineRunId: null, currentRunId: null });
    expect(defaultInternalEconomicsSelection(newest.slice(0, 1))).toEqual({
      baselineRunId: null,
      currentRunId: 30,
    });
    expect(defaultInternalEconomicsSelection(newest)).toEqual({
      baselineRunId: 20,
      currentRunId: 30,
    });
  });

  it('swaps slots when the opposite selected run is chosen and otherwise updates one slot', () => {
    const selection = { baselineRunId: 10, currentRunId: 20 };
    expect(selectInternalEconomicsRun(selection, 'baseline', 20)).toEqual({
      baselineRunId: 20,
      currentRunId: 10,
    });
    expect(selectInternalEconomicsRun(selection, 'current', 10)).toEqual({
      baselineRunId: 20,
      currentRunId: 10,
    });
    expect(selectInternalEconomicsRun(selection, 'baseline', null)).toEqual({
      baselineRunId: null,
      currentRunId: 20,
    });
  });
});

describe('useInternalEconomics', () => {
  beforeEach(() => mockApiRequest.mockReset());

  it('deduplicates equal selections to one receipt read and shares the parsed result', async () => {
    mockApiRequest.mockResolvedValue(receipt(9));
    const { result } = renderHook(() => useInternalEconomics(7, [9, 9]), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.baseline.state).toBe('ready'));
    expect(result.current.current.state).toBe('ready');
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).toHaveBeenCalledWith('GET', '/api/funds/7/internal-economics/runs/9');
  });

  it('performs no read for empty selections or an invalid fund id', () => {
    const empty = renderHook(() => useInternalEconomics(7, [null, null]), { wrapper: wrapper() });
    const invalid = renderHook(() => useInternalEconomics(undefined, [9, 10]), {
      wrapper: wrapper(),
    });

    expect(empty.result.current.baseline.state).toBe('empty');
    expect(empty.result.current.current.state).toBe('empty');
    expect(invalid.result.current.baseline.state).toBe('pending');
    expect(invalid.result.current.current.state).toBe('pending');
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('preserves one successful slot when its peer request fails', async () => {
    mockApiRequest.mockResolvedValueOnce(receipt(9)).mockRejectedValueOnce(new Error('peer failed'));
    const { result } = renderHook(() => useInternalEconomics(7, [9, 10]), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.current.state).toBe('error'));
    expect(result.current.baseline.state).toBe('ready');
    expect(mockApiRequest).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['schema rejection', { unexpected: true }],
    ['fund identity mismatch', receipt(9, 8)],
    ['run identity mismatch', receipt(10)],
  ])('returns an error slot for %s', async (_case, response) => {
    mockApiRequest.mockResolvedValue(response);
    const { result } = renderHook(() => useInternalEconomics(7, [9, null]), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.baseline.state).toBe('error'));
    expect(result.current.current.state).toBe('empty');
  });
});
