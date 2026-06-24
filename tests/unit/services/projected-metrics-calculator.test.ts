import { beforeEach, describe, expect, it, vi } from 'vitest';
import Decimal from '@shared/lib/decimal-config';
import type { Fund } from '@shared/schema';

const { generateForecastMock } = vi.hoisted(() => ({
  generateForecastMock: vi.fn(),
}));

vi.mock('../../../server/services/construction-forecast-calculator', () => ({
  ConstructionForecastCalculator: {
    generateForecast: generateForecastMock,
  },
}));

import { ProjectedMetricsCalculator } from '../../../server/services/projected-metrics-calculator';

const zeroTargetFund: Fund = {
  id: 1,
  name: 'Zero Target Fund',
  size: '100000000',
  deployedCapital: '0',
  managementFee: '0.02',
  carryPercentage: '0.2',
  vintageYear: 2026,
  establishmentDate: '2026-01-15',
  status: 'active',
  isActive: true,
  baseCurrency: 'USD',
  engineResults: null,
  createdAt: new Date('2026-01-15T00:00:00.000Z'),
};

describe('ProjectedMetricsCalculator construction forecast target fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    generateForecastMock.mockReturnValue({
      projected: {
        tvpi: 0,
        dpi: 0,
      },
      jCurvePath: {
        nav: Array.from({ length: 40 }, () => new Decimal(0)),
        dpi: Array.from({ length: 40 }, () => new Decimal(0)),
        calls: Array.from({ length: 40 }, () => new Decimal(0)),
      },
    });
  });

  it('passes explicit zero-valued targets through the construction-forecast path', async () => {
    const calculator = new ProjectedMetricsCalculator();

    const result = await calculator.calculate(
      zeroTargetFund,
      [],
      {
        targetIRR: 0,
        targetTVPI: 0,
        targetDPI: 0,
      },
      { useConstructionForecast: true }
    );

    expect(generateForecastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetTVPI: 0,
      })
    );
    expect(result.expectedIRR).toBe(0);
    expect(result.expectedTVPI).toBe(0);
    expect(result.expectedDPI).toBe(0);
  });

  it('scales construction forecast path arrays to fund-size dollars', async () => {
    generateForecastMock.mockReturnValueOnce({
      projected: {
        tvpi: 2.5,
        dpi: 0.8,
      },
      jCurvePath: {
        nav: [
          new Decimal(0.1),
          new Decimal(0.12),
          ...Array.from({ length: 38 }, () => new Decimal(0)),
        ],
        dpi: [
          new Decimal(0.02),
          new Decimal(0.05),
          ...Array.from({ length: 38 }, () => new Decimal(0)),
        ],
        calls: [
          new Decimal(0.25),
          new Decimal(0.15),
          ...Array.from({ length: 38 }, () => new Decimal(0)),
        ],
      },
    });

    const calculator = new ProjectedMetricsCalculator();

    const result = await calculator.calculate(
      zeroTargetFund,
      [],
      {
        targetIRR: 0.2,
        targetTVPI: 2.5,
        targetDPI: 0.8,
      },
      { useConstructionForecast: true }
    );

    expect(result.projectedDeployment[0]).toBe(25_000_000);
    expect(result.projectedDeployment[1]).toBe(15_000_000);
    expect(result.projectedNAV[0]).toBe(10_000_000);
    expect(result.projectedNAV[1]).toBe(12_000_000);
    expect(result.projectedDistributions[0]).toBe(2_000_000);
    expect(result.projectedDistributions[1]).toBe(3_000_000);
  });
});
