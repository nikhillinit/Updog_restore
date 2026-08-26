import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapitalAllocationOutput, SectorProfile } from '@/schemas/modeling-wizard.schemas';
import type { SharedWizardComputationContext } from '@/lib/wizard-computation-context';
import { useEngineComparison } from '@/hooks/useEngineComparison';

const { calculateEngineComparisonMock } = vi.hoisted(() => ({
  calculateEngineComparisonMock: vi.fn(),
}));

vi.mock('@/lib/wizard-reserve-bridge', () => ({
  calculateEngineComparison: calculateEngineComparisonMock,
}));

const mockSectorProfiles: SectorProfile[] = [
  {
    id: 'sector-1',
    name: 'SaaS',
    allocation: 100,
    stages: [
      {
        id: 'seed-1',
        stage: 'seed',
        roundSize: 5,
        valuation: 20,
        esopPercentage: 10,
        graduationRate: 50,
        exitRate: 20,
        exitValuation: 80,
        monthsToGraduate: 18,
        monthsToExit: 48,
      },
    ],
  },
];

const mockCapitalAllocation: CapitalAllocationOutput = {
  entryStrategy: 'amount-based',
  initialCheckSize: 1,
  followOnStrategy: {
    reserveRatio: 0.5,
    stageAllocations: [
      {
        stageId: 'seed',
        stageName: 'Seed',
        maintainOwnership: 10,
        participationRate: 60,
      },
    ],
  },
  pacingModel: {
    investmentsPerYear: 10,
    deploymentCurve: 'linear',
  },
  pacingHorizon: [
    {
      id: 'period-1',
      startMonth: 0,
      endMonth: 12,
      allocationPercent: 100,
    },
  ],
};

const mockWizardContext: SharedWizardComputationContext = {
  steps: {
    generalInfo: {
      fundName: 'Sandbox Fund',
      vintageYear: 2026,
      fundSize: 100,
      currency: 'USD',
      establishmentDate: '2026-01-01',
      isEvergreen: false,
      fundLife: 10,
      investmentPeriod: 3,
    },
    sectorProfiles: {
      sectorProfiles: mockSectorProfiles,
    },
    capitalAllocation: mockCapitalAllocation,
  },
};

describe('useEngineComparison', () => {
  beforeEach(() => {
    calculateEngineComparisonMock.mockReset();
    calculateEngineComparisonMock.mockResolvedValue({
      allocations: [],
      inputSummary: {
        totalAllocated: 0,
        allocationEfficiency: 0.52,
      },
      portfolioMetrics: {
        expectedPortfolioMOIC: 1.8,
        concentrationRisk: 'low',
        portfolioDiversification: 0.45,
      },
    });
    localStorage.clear();
    vi.unstubAllEnvs();
    delete (import.meta.env as Record<string, unknown>)['VITE_ENABLE_ENGINE_INTEGRATION'];
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    delete (import.meta.env as Record<string, unknown>)['VITE_ENABLE_ENGINE_INTEGRATION'];
  });

  it('stays disabled by default', () => {
    const { result } = renderHook(() =>
      useEngineComparison({
        wizardContext: mockWizardContext,
        sectorProfiles: mockSectorProfiles,
        capitalAllocation: mockCapitalAllocation,
        debounceMs: 1,
      })
    );

    expect(result.current.isEnabled).toBe(false);
    expect(calculateEngineComparisonMock).not.toHaveBeenCalled();
  });

  it('enables engine comparison through the generated legacy env alias', async () => {
    vi.stubEnv('VITE_ENABLE_ENGINE_INTEGRATION', 'true');

    const { result } = renderHook(() =>
      useEngineComparison({
        wizardContext: mockWizardContext,
        sectorProfiles: mockSectorProfiles,
        capitalAllocation: mockCapitalAllocation,
        debounceMs: 1,
      })
    );

    expect(result.current.isEnabled).toBe(true);

    await waitFor(() => {
      expect(calculateEngineComparisonMock).toHaveBeenCalledTimes(1);
    });
  });
});
