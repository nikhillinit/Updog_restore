import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CurrentPlanVersionV1Schema,
  PLAN_TRANSFORMATION_VERSION,
  type CurrentPlanVersionV1,
} from '@shared/contracts/current-plan-version-v1.contract';
import {
  currentPlanVersionsQueryKey,
  useCurrentPlanVersions,
} from '@/hooks/useCurrentPlanVersions';
import { apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', async (orig) => {
  const actual = await orig<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockApi = vi.mocked(apiRequest);

interface VersionFixtureOptions {
  id: string;
  version: number;
  supersedesVersionId: string | null;
  supersededByVersionId: string | null;
}

function versionFixture({
  id,
  version,
  supersedesVersionId,
  supersededByVersionId,
}: VersionFixtureOptions): CurrentPlanVersionV1 {
  return CurrentPlanVersionV1Schema.parse({
    contractVersion: 'current-plan-version-v1',
    id,
    fundId: 7,
    version,
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
    supersedesVersionId,
    supersededByVersionId,
    createdAt: '2026-07-22T05:07:50.303Z',
  });
}

function wrapper(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useCurrentPlanVersions', () => {
  beforeEach(() => mockApi.mockReset());

  it('fetches plan versions and identifies the non-superseded head', async () => {
    const superseded = versionFixture({
      id: 'plan-version-1',
      version: 1,
      supersedesVersionId: null,
      supersededByVersionId: 'plan-version-2',
    });
    const head = versionFixture({
      id: 'plan-version-2',
      version: 2,
      supersedesVersionId: 'plan-version-1',
      supersededByVersionId: null,
    });
    mockApi.mockResolvedValue([superseded, head] as never);

    const { result } = renderHook(() => useCurrentPlanVersions(7), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApi).toHaveBeenCalledWith('GET', '/api/funds/7/current-plan-versions');
    expect(result.current.versions).toEqual([superseded, head]);
    expect(result.current.headVersion).toEqual(head);
  });

  it('returns a null head when the plan-version list is empty', async () => {
    mockApi.mockResolvedValue([] as never);

    const { result } = renderHook(() => useCurrentPlanVersions(7), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.versions).toEqual([]);
    expect(result.current.headVersion).toBeNull();
  });

  it('does not fetch plan versions without a fund ID', () => {
    const { result } = renderHook(() => useCurrentPlanVersions(undefined), {
      wrapper: wrapper(),
    });

    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.versions).toEqual([]);
  });

  it('builds a stable query key with a nullable missing fund ID', () => {
    expect(currentPlanVersionsQueryKey(7)).toEqual(['current-plan-versions', 7]);
    expect(currentPlanVersionsQueryKey(undefined)).toEqual(['current-plan-versions', null]);
  });

  it('mints a plan version with an idempotency key and invalidates the fund query', async () => {
    const minted = versionFixture({
      id: 'plan-version-1',
      version: 1,
      supersedesVersionId: null,
      supersededByVersionId: null,
    });
    mockApi.mockResolvedValueOnce([] as never).mockResolvedValueOnce(minted as never);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCurrentPlanVersions(7), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.mint.mutateAsync();

    expect(mockApi).toHaveBeenCalledWith(
      'POST',
      '/api/funds/7/current-plan-versions',
      {},
      {
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotency-Key': expect.any(String),
        }),
      }
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: currentPlanVersionsQueryKey(7),
    });
  });
});
