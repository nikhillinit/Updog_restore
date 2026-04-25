import { describe, expect, it } from 'vitest';
import type { ActualMetrics, ProjectedMetrics, TargetMetrics } from '@shared/types/metrics';
import { VarianceCalculator } from '../../../server/services/variance-calculator';

function makeActual(overrides: Partial<ActualMetrics> = {}): ActualMetrics {
  return {
    asOfDate: '2026-04-25T00:00:00.000Z',
    totalCommitted: 100_000_000,
    totalCalled: 16_700_000,
    totalDeployed: 16_700_000,
    totalUncalled: 83_300_000,
    currentNAV: 46_100_000,
    totalDistributions: 0,
    totalValue: 46_100_000,
    irr: null,
    tvpi: 2.76,
    dpi: null,
    rvpi: 2.76,
    activeCompanies: 3,
    exitedCompanies: 0,
    writtenOffCompanies: 0,
    totalCompanies: 3,
    deploymentRate: 16.7,
    averageCheckSize: 5_566_666.67,
    fundAgeMonths: 12,
    ...overrides,
  };
}

function makeProjected(): ProjectedMetrics {
  return {
    asOfDate: '2026-04-25T00:00:00.000Z',
    projectionDate: '2026-04-25T00:00:00.000Z',
    projectedDeployment: [],
    projectedDistributions: [],
    projectedNAV: [],
    expectedTVPI: 2.5,
    expectedIRR: 0.25,
    expectedDPI: 0,
    totalReserveNeeds: 0,
    allocatedReserves: 0,
    unallocatedReserves: 0,
    reserveAllocationRate: 0,
    deploymentPace: 'behind',
    quartersRemaining: 8,
    recommendedQuarterlyDeployment: 5_000_000,
  };
}

function makeTarget(): TargetMetrics {
  return {
    targetFundSize: 100_000_000,
    targetIRR: 0.25,
    targetTVPI: 2.5,
    targetDeploymentYears: 3,
    targetCompanyCount: 20,
    targetAverageCheckSize: 5_000_000,
  };
}

describe('VarianceCalculator portfolio construction status', () => {
  it('does not report 3 of 20 companies as on track', () => {
    const variance = new VarianceCalculator().calculate(
      makeActual(),
      makeProjected(),
      makeTarget()
    );

    expect(variance.portfolioVariance).toMatchObject({
      actualCompanies: 3,
      targetCompanies: 20,
      variance: -17,
      onTrack: false,
    });
  });

  it('allows near-complete company counts to remain on track', () => {
    const variance = new VarianceCalculator().calculate(
      makeActual({ totalCompanies: 18 }),
      makeProjected(),
      makeTarget()
    );

    expect(variance.portfolioVariance.onTrack).toBe(true);
  });
});
