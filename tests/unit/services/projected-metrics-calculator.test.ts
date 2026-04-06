import { beforeEach, describe, expect, it, vi } from 'vitest';
import Decimal from '@shared/lib/decimal-config';

const { generateForecastMock } = vi.hoisted(() => ({
  generateForecastMock: vi.fn(),
}));

vi.mock('../../../server/services/construction-forecast-calculator', () => ({
  ConstructionForecastCalculator: {
    generateForecast: generateForecastMock,
  },
}));

import { ProjectedMetricsCalculator } from '../../../server/services/projected-metrics-calculator';

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
      {
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
        engineResults: null,
        createdAt: new Date('2026-01-15T00:00:00.000Z'),
      } as any,
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
});
