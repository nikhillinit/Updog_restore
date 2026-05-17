import { describe, expect, it } from 'vitest';

import {
  calculateStreamingRiskMetricsFromDistributions,
  type MemoryEfficientDistribution,
} from '../../../server/services/streaming-monte-carlo-engine';

function distribution(values: number[]): MemoryEfficientDistribution {
  const sortedValues = [...values].sort((a, b) => a - b);
  const count = sortedValues.length;
  const mean = sortedValues.reduce((sum, value) => sum + value, 0) / count;
  const variance = sortedValues.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / count;

  return {
    min: sortedValues[0] ?? 0,
    max: sortedValues[sortedValues.length - 1] ?? 0,
    mean,
    standardDeviation: Math.sqrt(variance),
    percentiles: new Map<number, number>([
      [5, sortedValues[Math.floor(0.05 * (count - 1))] ?? mean],
      [10, sortedValues[Math.floor(0.1 * (count - 1))] ?? mean],
    ]),
    count,
    samples: sortedValues,
  };
}

describe('calculateStreamingRiskMetricsFromDistributions', () => {
  it('derives tail risk from streamed sample data instead of fixed approximations', () => {
    const result = calculateStreamingRiskMetricsFromDistributions({
      irr: distribution([-0.3, -0.2, -0.1, 0.1, 0.2]),
      totalValue: distribution([70, 80, 90, 110, 120]),
    });

    expect(result.valueAtRisk.var5).toBe(-0.3);
    expect(result.valueAtRisk.var10).toBe(-0.3);
    expect(result.conditionalValueAtRisk.cvar5).toBe(-0.3);
    expect(result.conditionalValueAtRisk.cvar10).toBe(-0.3);
    expect(result.probabilityOfLoss).toBe(0.6);
    expect(result.downsideRisk).toBeCloseTo(0.16207, 6);
  });

  it('handles zero-variance streams without divide-by-zero ratios', () => {
    const result = calculateStreamingRiskMetricsFromDistributions({
      irr: distribution([0.15, 0.15, 0.15, 0.15]),
      totalValue: distribution([100, 100, 100, 100]),
    });

    expect(result.conditionalValueAtRisk.cvar5).toBe(0.15);
    expect(result.probabilityOfLoss).toBe(0);
    expect(result.downsideRisk).toBe(0);
    expect(result.sharpeRatio).toBe(10);
    expect(result.sortinoRatio).toBe(10);
    expect(result.maxDrawdown).toBe(0);
  });
});
