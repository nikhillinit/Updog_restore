import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWouterWrapper } from '../../utils/withWouter';
import FundScenarioWorkspacePage from '../../../client/src/pages/fund-scenario-workspace';
import type { FundScenarioComparisonV1 } from '../../../shared/contracts/fund-scenario-comparison-v1.contract';
import type {
  FundScenarioCalculationStatusV1,
  FundScenarioSetDetailV1,
  FundScenarioSetSummaryV1,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';

describe('FundScenarioWorkspacePage', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderWorkspace(path = '/fund-model-results/123/scenarios') {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const { Wrapper } = createWouterWrapper(path);

    return render(
      <QueryClientProvider client={queryClient}>
        <Wrapper>
          <FundScenarioWorkspacePage />
        </Wrapper>
      </QueryClientProvider>
    );
  }

  function mockWorkspaceFetches() {
    fetchSpy.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (method === 'GET' && url === '/api/funds/123/scenario-sets') {
        return Promise.resolve(jsonResponse({ scenarioSets: scenarioSetSummaries() }));
      }

      if (
        method === 'GET' &&
        url === '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000111'
      ) {
        return Promise.resolve(jsonResponse(feeScenarioSetDetail()));
      }

      if (
        method === 'GET' &&
        url === '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000211'
      ) {
        return Promise.resolve(jsonResponse(reserveScenarioSetDetail()));
      }

      if (
        method === 'GET' &&
        url === '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000311'
      ) {
        return Promise.resolve(jsonResponse(allocationScenarioSetDetail()));
      }

      if (
        method === 'GET' &&
        url === '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000411'
      ) {
        return Promise.resolve(jsonResponse(sectorProfileScenarioSetDetail()));
      }

      if (method === 'GET' && url === '/api/funds/123/results') {
        return Promise.resolve(jsonResponse(fundResultsResponse()));
      }

      if (
        method === 'GET' &&
        url === '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000111/comparison'
      ) {
        return Promise.resolve(jsonResponse(scenarioComparisonResponse()));
      }

      if (
        method === 'GET' &&
        url.endsWith('/scenario-sets/00000000-0000-0000-0000-000000000211/calculation-status')
      ) {
        return Promise.resolve(
          jsonResponse(
            statusResponse(
              'succeeded',
              42,
              '00000000-0000-0000-0000-000000000211',
              'async_reserve_allocation'
            )
          )
        );
      }

      if (
        method === 'POST' &&
        url === '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000111/calculate'
      ) {
        return Promise.resolve(
          jsonResponse({
            snapshotId: 42,
            correlationId: '00000000-0000-0000-0000-000000000999',
            source: 'fund_snapshots',
            payload: feeCalculationPayload(),
          })
        );
      }

      if (
        method === 'POST' &&
        url ===
          '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000211/calculate-reserve'
      ) {
        return Promise.resolve(
          jsonResponse({
            fundId: 123,
            scenarioSetId: '00000000-0000-0000-0000-000000000211',
            calculationMode: 'async_reserve_allocation',
            status: 'queued',
            jobId: 'fund-scenario-123-reserve',
            correlationId: '00000000-0000-0000-0000-000000000998',
          })
        );
      }

      if (
        method === 'POST' &&
        url === '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000311/calculate'
      ) {
        return Promise.resolve(
          jsonResponse({
            snapshotId: 43,
            correlationId: '00000000-0000-0000-0000-000000000997',
            source: 'fund_snapshots',
            payload: syncCalculationPayload({
              calculationMode: 'sync_allocation',
              scenarioSetId: '00000000-0000-0000-0000-000000000311',
              variantId: '00000000-0000-0000-0000-000000000312',
              overrideType: 'allocation',
              sourceConfigId: 14,
              name: 'Seed heavy',
            }),
          })
        );
      }

      if (
        method === 'POST' &&
        url === '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000411/calculate'
      ) {
        return Promise.resolve(
          jsonResponse({
            snapshotId: 44,
            correlationId: '00000000-0000-0000-0000-000000000996',
            source: 'fund_snapshots',
            payload: syncCalculationPayload({
              calculationMode: 'sync_sector_profile',
              scenarioSetId: '00000000-0000-0000-0000-000000000411',
              variantId: '00000000-0000-0000-0000-000000000412',
              overrideType: 'sector_profile',
              sourceConfigId: 15,
              name: 'AI infrastructure',
            }),
          })
        );
      }

      if (method === 'POST' && url === '/api/funds/123/scenario-sets/reserve-optimization') {
        return Promise.resolve(jsonResponse(reserveScenarioSetDetail()));
      }

      return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`));
    });
  }

  it('loads scenario sets without polling reserve status for sync sets', async () => {
    mockWorkspaceFetches();
    renderWorkspace();

    expect(await screen.findByText('Scenario Workspace')).toBeInTheDocument();
    expect(screen.getByText(/Test Fund \| Vintage 2024/)).toBeInTheDocument();
    expect(screen.getAllByText('Fee sensitivity').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Reserve plan').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Allocation mix').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sector mix').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('scenario-sets-summary')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-comparison-table')).toBeInTheDocument();
    expect(screen.getByText('Authoritative baseline')).toBeInTheDocument();

    const feeCard = screen.getByTestId(
      'scenario-workspace-set-00000000-0000-0000-0000-000000000111'
    );
    expect(within(feeCard).getByText('Succeeded')).toBeInTheDocument();
    expect(
      within(feeCard).getByRole('button', { name: /calculate fee sensitivity/i })
    ).toBeInTheDocument();

    const reserveCard = screen.getByTestId(
      'scenario-workspace-set-00000000-0000-0000-0000-000000000211'
    );
    await waitFor(() => {
      expect(within(reserveCard).getByText('Succeeded')).toBeInTheDocument();
    });
    expect(
      within(reserveCard).getByRole('button', { name: /queue reserve plan/i })
    ).toBeInTheDocument();

    const allocationCard = screen.getByTestId(
      'scenario-workspace-set-00000000-0000-0000-0000-000000000311'
    );
    expect(within(allocationCard).getByText('Succeeded')).toBeInTheDocument();
    expect(within(allocationCard).getByText('Allocation')).toBeInTheDocument();
    expect(
      within(allocationCard).getByRole('button', { name: /calculate allocation mix/i })
    ).toBeInTheDocument();

    const sectorCard = screen.getByTestId(
      'scenario-workspace-set-00000000-0000-0000-0000-000000000411'
    );
    expect(within(sectorCard).getByText('Succeeded')).toBeInTheDocument();
    expect(within(sectorCard).getByText('Sector profile')).toBeInTheDocument();
    expect(
      within(sectorCard).getByRole('button', { name: /calculate sector mix/i })
    ).toBeInTheDocument();

    const statusUrls = fetchSpy.mock.calls
      .map(([input]) => (typeof input === 'string' ? input : input.toString()))
      .filter((url) => url.endsWith('/calculation-status'));
    expect(statusUrls).toEqual([
      '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000211/calculation-status',
    ]);
  });

  it('shows "Not requested" for a sync scenario set without a calculated result', async () => {
    const pendingSetId = '00000000-0000-0000-0000-000000000511';

    const baseResults = fundResultsResponse();
    const resultsWithoutScenarioSets = {
      ...baseResults,
      sections: {
        ...baseResults.sections,
        scenarios: {
          ...baseResults.sections.scenarios,
          payload: { ...baseResults.sections.scenarios.payload, sets: [] },
        },
      },
    };

    const { FundResultsReadV1Schema } = await import('@shared/contracts/fund-results-v1.contract');
    vi.spyOn(FundResultsReadV1Schema, 'parse').mockImplementation(
      (value) => value as ReturnType<typeof FundResultsReadV1Schema.parse>
    );

    fetchSpy.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (method === 'GET' && url === '/api/funds/123/scenario-sets') {
        return Promise.resolve(
          jsonResponse({
            scenarioSets: [scenarioSetSummary(pendingSetId, 'Allocation pending', 16, 4)],
          })
        );
      }

      if (method === 'GET' && url === `/api/funds/123/scenario-sets/${pendingSetId}`) {
        const detail = allocationScenarioSetDetail();
        return Promise.resolve(
          jsonResponse({
            ...detail,
            id: pendingSetId,
            variants: detail.variants.map((variant) => ({
              ...variant,
              scenarioSetId: pendingSetId,
            })),
          })
        );
      }

      if (method === 'GET' && url === '/api/funds/123/results') {
        return Promise.resolve(jsonResponse(resultsWithoutScenarioSets));
      }

      return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`));
    });

    renderWorkspace();

    const card = await screen.findByTestId(`scenario-workspace-set-${pendingSetId}`);
    expect(within(card).getByText('Not requested')).toBeInTheDocument();
    expect(within(card).getByText('Allocation')).toBeInTheDocument();

    const statusUrls = fetchSpy.mock.calls
      .map(([input]) => (typeof input === 'string' ? input : input.toString()))
      .filter((requestUrl) => requestUrl.endsWith('/calculation-status'));
    expect(statusUrls).toEqual([]);
  });

  it('uses the fee-profile calculation endpoint for fee scenario sets', async () => {
    mockWorkspaceFetches();
    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: /calculate fee sensitivity/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000111/calculate',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('uses the reserve queue endpoint for reserve scenario sets', async () => {
    mockWorkspaceFetches();
    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: /queue reserve plan/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000211/calculate-reserve',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('uses the sync calculation endpoint for allocation scenario sets', async () => {
    mockWorkspaceFetches();
    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: /calculate allocation mix/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000311/calculate',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('uses the sync calculation endpoint for sector-profile scenario sets', async () => {
    mockWorkspaceFetches();
    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: /calculate sector mix/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000411/calculate',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('creates an optimized reserve scenario set from the workspace', async () => {
    mockWorkspaceFetches();
    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: /create optimized reserve plan/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/funds/123/scenario-sets/reserve-optimization',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('rejects invalid fund routes before issuing API requests', () => {
    renderWorkspace('/fund-model-results/latest/scenarios');

    expect(screen.getByText('Invalid scenario workspace route')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function scenarioSetSummaries(): FundScenarioSetSummaryV1[] {
  return [
    scenarioSetSummary('00000000-0000-0000-0000-000000000111', 'Fee sensitivity', 12, 4),
    scenarioSetSummary('00000000-0000-0000-0000-000000000211', 'Reserve plan', 13, 4),
    scenarioSetSummary('00000000-0000-0000-0000-000000000311', 'Allocation mix', 14, 4),
    scenarioSetSummary('00000000-0000-0000-0000-000000000411', 'Sector mix', 15, 4),
  ];
}

function scenarioSetSummary(
  id: string,
  name: string,
  sourceConfigId: number,
  sourceConfigVersion: number
): FundScenarioSetSummaryV1 {
  return {
    id,
    fundId: 123,
    name,
    description: null,
    sourceConfigId,
    sourceConfigVersion,
    variantCount: 1,
    archivedAt: null,
    archivedByUserId: null,
    archivedByLabel: null,
    createdByUserId: 17,
    createdByLabel: 'analyst@example.com',
    updatedByUserId: 17,
    updatedByLabel: 'analyst@example.com',
    createdAt: '2026-05-29T12:00:00.000Z',
    updatedAt: '2026-05-29T12:00:00.000Z',
  };
}

function feeScenarioSetDetail(): FundScenarioSetDetailV1 {
  return {
    ...scenarioSetSummary('00000000-0000-0000-0000-000000000111', 'Fee sensitivity', 12, 4),
    variants: [
      {
        id: '00000000-0000-0000-0000-000000000112',
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        name: 'Lower fee',
        description: null,
        sortOrder: 0,
        override: feeProfileOverride(),
        createdAt: '2026-05-29T12:00:00.000Z',
        updatedAt: '2026-05-29T12:00:00.000Z',
      },
    ],
  };
}

function reserveScenarioSetDetail(): FundScenarioSetDetailV1 {
  return {
    ...scenarioSetSummary('00000000-0000-0000-0000-000000000211', 'Reserve plan', 13, 4),
    variants: [
      {
        id: '00000000-0000-0000-0000-000000000212',
        scenarioSetId: '00000000-0000-0000-0000-000000000211',
        name: 'Follow-on cap',
        description: null,
        sortOrder: 0,
        override: {
          overrideType: 'reserve_allocation',
          payload: {
            allocationVersion: 4,
            items: [
              {
                companyId: 101,
                plannedReservesCents: 7_500_000,
                maxAllocationCents: 7_500_000,
                allocationReason: 'Cap the follow-on reserve for concentration control',
              },
            ],
          },
        },
        createdAt: '2026-05-29T12:00:00.000Z',
        updatedAt: '2026-05-29T12:00:00.000Z',
      },
    ],
  };
}

function allocationScenarioSetDetail(): FundScenarioSetDetailV1 {
  return {
    ...scenarioSetSummary('00000000-0000-0000-0000-000000000311', 'Allocation mix', 14, 4),
    variants: [
      {
        id: '00000000-0000-0000-0000-000000000312',
        scenarioSetId: '00000000-0000-0000-0000-000000000311',
        name: 'Seed heavy',
        description: null,
        sortOrder: 0,
        override: {
          overrideType: 'allocation',
          payload: {
            allocations: [{ id: 'seed', category: 'Seed', percentage: 60 }],
          },
        },
        createdAt: '2026-05-29T12:00:00.000Z',
        updatedAt: '2026-05-29T12:00:00.000Z',
      },
    ],
  };
}

function sectorProfileScenarioSetDetail(): FundScenarioSetDetailV1 {
  return {
    ...scenarioSetSummary('00000000-0000-0000-0000-000000000411', 'Sector mix', 15, 4),
    variants: [
      {
        id: '00000000-0000-0000-0000-000000000412',
        scenarioSetId: '00000000-0000-0000-0000-000000000411',
        name: 'AI infrastructure',
        description: null,
        sortOrder: 0,
        override: {
          overrideType: 'sector_profile',
          payload: {
            sectorProfiles: [{ id: 'ai-infra', name: 'AI infrastructure', targetPercentage: 40 }],
          },
        },
        createdAt: '2026-05-29T12:00:00.000Z',
        updatedAt: '2026-05-29T12:00:00.000Z',
      },
    ],
  };
}

function feeProfileOverride() {
  return {
    overrideType: 'fee_profile' as const,
    payload: {
      feeProfiles: [
        {
          id: 'fee-profile-upside',
          name: 'Upside fees',
          feeTiers: [
            {
              id: 'tier-1',
              name: 'Management fee',
              percentage: 2,
              feeBasis: 'committed_capital' as const,
              startMonth: 0,
              endMonth: 120,
              recyclingPercentage: 25,
            },
          ],
        },
      ],
    },
  };
}

function fundResultsResponse() {
  return {
    status: 'ready' as const,
    fundId: 123,
    fund: { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 },
    lifecycle: {
      fundId: 123,
      configState: {
        latestVersion: 4,
        draftVersion: null,
        publishedVersion: 4,
        hasDraft: false,
        hasPublished: true,
        publishedAt: '2026-05-29T12:00:00.000Z',
        draftUpdatedAt: null,
        publishedUpdatedAt: '2026-05-29T12:00:00.000Z',
      },
      calculationState: {
        status: 'ready' as const,
        configVersion: 4,
        runId: 10,
        correlationId: 'test-corr-id',
        dispatchState: 'dispatched',
        availableSnapshotTypes: ['RESERVE', 'PACING'],
        expectedSnapshotTypes: ['RESERVE', 'PACING'],
        lastCalculatedAt: '2026-05-29T12:30:00.000Z',
        lastError: null,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent: false },
    },
    sections: {
      reserve: { status: 'unavailable' as const, reason: 'No calculation results available' },
      pacing: { status: 'unavailable' as const, reason: 'No calculation results available' },
      scorecard: {
        status: 'available' as const,
        payload: {
          fundName: { value: 'Test Fund', source: 'funds' as const },
          fundSize: { value: 100_000_000, source: 'funds' as const },
          vintageYear: { value: 2024, source: 'funds' as const },
        },
      },
      scenarios: {
        status: 'available' as const,
        source: 'fund_snapshots' as const,
        calculatedAt: '2026-05-29T12:30:00.000Z',
        payload: scenariosPayload(),
      },
      waterfall: { status: 'unavailable' as const, reason: 'No authoritative source' },
      economics: {
        status: 'unavailable' as const,
        reason: 'GP economics is disabled',
        reasonCode: 'ECONOMICS_DISABLED' as const,
      },
    },
  };
}

function scenariosPayload() {
  return {
    version: 'fund-scenarios-v1' as const,
    aggregateStaleness: 'CURRENT' as const,
    sets: [
      {
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        name: 'Fee sensitivity',
        calculationMode: 'sync_fee_profile',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
        currentPublishedConfigVersion: 4,
        calculatedAt: '2026-05-29T12:30:00.000Z',
        staleness: 'CURRENT' as const,
        variantCount: 1,
        variants: [
          {
            variantId: '00000000-0000-0000-0000-000000000112',
            name: 'Lower fee',
            overrideType: 'fee_profile' as const,
            economicsSummary: economicsSummary(),
          },
        ],
      },
      {
        scenarioSetId: '00000000-0000-0000-0000-000000000311',
        name: 'Allocation mix',
        calculationMode: 'sync_allocation',
        sourceConfigId: 14,
        sourceConfigVersion: 4,
        currentPublishedConfigVersion: 4,
        calculatedAt: '2026-05-29T12:32:00.000Z',
        staleness: 'CURRENT' as const,
        variantCount: 1,
        variants: [
          {
            variantId: '00000000-0000-0000-0000-000000000312',
            name: 'Seed heavy',
            overrideType: 'allocation' as const,
            economicsSummary: economicsSummary(),
          },
        ],
      },
      {
        scenarioSetId: '00000000-0000-0000-0000-000000000411',
        name: 'Sector mix',
        calculationMode: 'sync_sector_profile',
        sourceConfigId: 15,
        sourceConfigVersion: 4,
        currentPublishedConfigVersion: 4,
        calculatedAt: '2026-05-29T12:34:00.000Z',
        staleness: 'CURRENT' as const,
        variantCount: 1,
        variants: [
          {
            variantId: '00000000-0000-0000-0000-000000000412',
            name: 'AI infrastructure',
            overrideType: 'sector_profile' as const,
            economicsSummary: economicsSummary(),
          },
        ],
      },
    ],
  };
}

function economicsSummary() {
  return {
    grossIrr: 0.2,
    lpNetIrr: 0.15,
    gpNetIrr: null,
    totalLpPaidIn: 9_800_000,
    totalGpCommitmentCalled: 200_000,
    totalManagementFees: 2_000_000,
    totalExpenses: 0,
    totalRecycled: 0,
    totalLpDistributions: 14_000_000,
    totalGpInvestmentDistributions: 300_000,
    totalGpCarryDistributed: 500_000,
    totalGpFeeIncome: 2_000_000,
    finalDpi: 0.6,
    finalRvpi: 0.8,
    finalTvpi: 2.1,
    finalClawbackDue: 0,
    maxEscrowAvailable: 0,
    netGpCarryAfterClawback: 500_000,
  };
}

function scenarioComparisonResponse(): FundScenarioComparisonV1 {
  return {
    fundId: 123,
    comparisonStatus: 'comparable',
    scenarioSet: {
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      name: 'Fee sensitivity',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
    },
    baseline: {
      label: 'Authoritative baseline',
      metrics: {
        lpNetIrr: 0.15,
        gpNetIrr: null,
        totalManagementFees: 2_000_000,
        totalGpCarryDistributed: 500_000,
        totalGpFeeIncome: 2_000_000,
        finalDpi: 0.6,
        finalTvpi: 1.8,
        finalClawbackDue: 0,
      },
    },
    variants: [
      {
        variantId: '00000000-0000-0000-0000-000000000112',
        name: 'Lower fee',
        overrideType: 'fee_profile',
        metrics: {
          lpNetIrr: 0.17,
          gpNetIrr: null,
          totalManagementFees: 1_500_000,
          totalGpCarryDistributed: 500_000,
          totalGpFeeIncome: 1_500_000,
          finalDpi: 0.7,
          finalTvpi: 2.1,
          finalClawbackDue: 0,
        },
        metricDeltas: [
          {
            metric: 'finalTvpi',
            displayName: 'TVPI',
            baselineValue: 1.8,
            scenarioValue: 2.1,
            absoluteDelta: 0.3,
            percentageDelta: 16.6666667,
            driftCapable: true,
            driftReason: 'stable',
          },
        ],
      },
    ],
    staleness: 'CURRENT',
    calculatedAt: '2026-05-29T12:30:00.000Z',
  };
}

function statusResponse(
  status: FundScenarioCalculationStatusV1['status'],
  snapshotId: number | null,
  scenarioSetId: string,
  calculationMode: FundScenarioCalculationStatusV1['calculationMode']
): FundScenarioCalculationStatusV1 {
  return {
    fundId: 123,
    scenarioSetId,
    calculationMode,
    status,
    jobId: null,
    correlationId: null,
    snapshotId,
    lastEventAt: '2026-05-29T12:30:00.000Z',
    lastError: null,
  };
}

function feeCalculationPayload() {
  return syncCalculationPayload({
    calculationMode: 'sync_fee_profile',
    scenarioSetId: '00000000-0000-0000-0000-000000000111',
    variantId: '00000000-0000-0000-0000-000000000112',
    overrideType: 'fee_profile',
    sourceConfigId: 12,
    name: 'Lower fee',
  });
}

function syncCalculationPayload({
  calculationMode,
  scenarioSetId,
  variantId,
  overrideType,
  sourceConfigId,
  name,
}: {
  calculationMode: 'sync_fee_profile' | 'sync_allocation' | 'sync_sector_profile';
  scenarioSetId: string;
  variantId: string;
  overrideType: 'fee_profile' | 'allocation' | 'sector_profile';
  sourceConfigId: number;
  name: string;
}) {
  return {
    version: 'fund-scenarios-v1' as const,
    calculationMode,
    fundId: 123,
    scenarioSetId,
    sourceConfigId,
    sourceConfigVersion: 4,
    staleness: {
      state: 'CURRENT' as const,
      sourceConfigVersion: 4,
      currentPublishedConfigVersion: 4,
    },
    calculatedAt: '2026-05-29T12:30:00.000Z',
    variants: [
      {
        variantId,
        scenarioSetId,
        name,
        overrideType,
        economics: {
          version: 'v1' as const,
          annual: [],
          summary: economicsSummary(),
          checks: { passed: true, tolerance: 0.01, errors: [] },
        },
      },
    ],
  };
}
