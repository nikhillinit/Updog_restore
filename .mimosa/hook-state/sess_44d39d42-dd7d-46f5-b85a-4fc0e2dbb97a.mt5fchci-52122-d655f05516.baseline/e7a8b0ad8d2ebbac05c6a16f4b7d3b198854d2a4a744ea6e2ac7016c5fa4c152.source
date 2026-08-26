import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CurrentPlanVersionV1Schema,
  PLAN_TRANSFORMATION_VERSION,
} from '@shared/contracts/current-plan-version-v1.contract';
import { CurrentPlanAcceptancePanel } from '@/components/fund-results/CurrentPlanAcceptancePanel';
import { ApiError, apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', async (orig) => {
  const actual = await orig<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockApi = vi.mocked(apiRequest);

const headFixture = CurrentPlanVersionV1Schema.parse({
  contractVersion: 'current-plan-version-v1',
  id: 'plan-version-2',
  fundId: 7,
  version: 2,
  sourceConfigId: 11,
  sourceConfigVersion: 3,
  sourceFactsSnapshotId: 'facts-snapshot-23',
  deployableCapitalUsd: '9000000.000000',
  planTransformationVersion: PLAN_TRANSFORMATION_VERSION,
  allocations: [
    {
      allocationId: 'seed-allocation',
      name: 'Seed',
      stageFocus: 'Seed',
      initialCapitalUsd: '6000000.000000',
      followOnCapitalUsd: '3000000.000000',
      avgInitialCheckUsd: '1000000.000000',
      pacingQuarters: 8,
      followOnStrategy: 'maintain_ownership',
      followOnParticipationPct: '0.500000000000',
    },
  ],
  pacingAssumptions: {
    contractVersion: 'current-plan-pacing-v1',
    deploymentQuarters: 2,
    quarterlyDeploymentPcts: ['0.500000000000', '0.500000000000'],
    followOnReservePct: '0.333333333333',
    annualFeeDragPct: '0.020000000000',
  },
  cohortAssumptions: {
    contractVersion: 'current-plan-cohort-v1',
    averageInitialCheckUsd: '1000000.000000',
    stageDistribution: [
      { stage: 'Seed', pct: '0.600000000000' },
      { stage: 'Series A', pct: '0.400000000000' },
    ],
    graduationMatrix: [
      {
        fromStage: 'Seed',
        toStage: 'Series A',
        rate: '0.750000000000',
        quartersToGraduate: 4,
      },
    ],
    exitAssumptions: [
      {
        stage: 'Seed',
        exitMultiple: '3.000000000000',
        quartersToExit: 20,
        failureRate: '0.250000000000',
      },
    ],
  },
  reservePolicyVersion: 'reserve-policy/1.0.0',
  assumptionsHash: 'a'.repeat(64),
  supersedesVersionId: 'plan-version-1',
  supersededByVersionId: null,
  createdAt: '2026-07-22T05:07:50.303Z',
});

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('CurrentPlanAcceptancePanel', () => {
  beforeEach(() => mockApi.mockReset());

  it('renders nothing without a fund ID', () => {
    const { container } = render(<CurrentPlanAcceptancePanel fundId={null} />, {
      wrapper: wrapper(),
    });

    expect(container).toBeEmptyDOMElement();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('shows the head plan fee, deployable capital, and source provenance', async () => {
    mockApi.mockResolvedValue([headFixture] as never);

    render(<CurrentPlanAcceptancePanel fundId={7} />, { wrapper: wrapper() });

    expect(screen.getByText('Current Plan Review')).toBeInTheDocument();
    expect(await screen.findByText('2.00%')).toBeInTheDocument();
    expect(screen.getByText('$9,000,000')).toBeInTheDocument();
    expect(screen.getByText('Config #11 v3')).toBeInTheDocument();
    expect(screen.getByText('Facts snapshot: facts-snapshot-23')).toBeInTheDocument();
  });

  it('offers to derive the initial plan when no current plan exists', async () => {
    mockApi.mockResolvedValueOnce([] as never).mockResolvedValueOnce(headFixture as never);

    render(<CurrentPlanAcceptancePanel fundId={7} />, { wrapper: wrapper() });

    const deriveButton = await screen.findByRole('button', { name: /derive initial plan/i });
    fireEvent.click(deriveButton);

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        'POST',
        '/api/funds/7/current-plan-versions',
        {},
        {
          headers: expect.objectContaining({
            'Idempotency-Key': expect.any(String),
          }),
        }
      )
    );
  });

  it('accepts the reviewed plan by minting a new version', async () => {
    mockApi
      .mockResolvedValueOnce([headFixture] as never)
      .mockResolvedValueOnce(headFixture as never);

    render(<CurrentPlanAcceptancePanel fundId={7} />, { wrapper: wrapper() });

    const acceptButton = await screen.findByRole('button', {
      name: /accept & mint new plan version/i,
    });
    fireEvent.click(acceptButton);

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        'POST',
        '/api/funds/7/current-plan-versions',
        {},
        {
          headers: expect.objectContaining({
            'Idempotency-Key': expect.any(String),
          }),
        }
      )
    );
  });

  it('shows the typed route message when minting fails', async () => {
    mockApi
      .mockResolvedValueOnce([headFixture] as never)
      .mockRejectedValueOnce(
        new ApiError(
          422,
          'FEE_PROFILE_ABSENT: fund has no fee tiers configured',
          'FEE_PROFILE_ABSENT'
        )
      );

    render(<CurrentPlanAcceptancePanel fundId={7} />, { wrapper: wrapper() });

    const acceptButton = await screen.findByRole('button', {
      name: /accept & mint new plan version/i,
    });
    fireEvent.click(acceptButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'FEE_PROFILE_ABSENT: fund has no fee tiers configured'
    );
  });
});
