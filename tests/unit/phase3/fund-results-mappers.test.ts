/**
 * Batch 3A1: Mapper tests for snapshot payload -> section type transforms
 *
 * Validates that ReserveSummary maps to ReserveResultsSection and
 * PacingSummary maps to PacingResultsSection correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  mapReserveSnapshot,
  mapPacingSnapshot,
} from '../../../server/services/fund-results-mappers';

describe('mapReserveSnapshot', () => {
  it('maps a valid ReserveSummary to ReserveResultsSection', () => {
    const snapshot = {
      fundId: 1,
      totalAllocation: 40_000_000,
      avgConfidence: 0.85,
      highConfidenceCount: 3,
      allocations: [
        { allocation: 10_000_000, confidence: 0.9, rationale: 'Strong follow-on' },
        { allocation: 15_000_000, confidence: 0.8, rationale: 'Series B expected' },
        { allocation: 15_000_000, confidence: 0.85, rationale: 'Bridge round' },
      ],
      generatedAt: new Date('2026-03-20T12:30:00Z'),
    };
    const fundSize = 100_000_000;

    const result = mapReserveSnapshot(snapshot, fundSize);
    expect(result.totalAllocation).toBe(40_000_000);
    expect(result.reserveRatio).toBeCloseTo(0.4);
    expect(result.avgConfidence).toBe(0.85);
    expect(result.allocations).toHaveLength(3);
    expect(result.allocations[0]).toHaveProperty('allocation');
    expect(result.allocations[0]).toHaveProperty('confidence');
    expect(result.allocations[0]).toHaveProperty('rationale');
  });

  it('derives reserveRatio as totalAllocation / fundSize', () => {
    const snapshot = {
      fundId: 1,
      totalAllocation: 25_000_000,
      avgConfidence: 0.7,
      highConfidenceCount: 1,
      allocations: [{ allocation: 25_000_000, confidence: 0.7, rationale: 'Only company' }],
      generatedAt: new Date(),
    };

    const result = mapReserveSnapshot(snapshot, 50_000_000);
    expect(result.reserveRatio).toBeCloseTo(0.5);
  });

  it('handles zero fundSize without division error', () => {
    const snapshot = {
      fundId: 1,
      totalAllocation: 0,
      avgConfidence: 0,
      highConfidenceCount: 0,
      allocations: [],
      generatedAt: new Date(),
    };

    const result = mapReserveSnapshot(snapshot, 0);
    expect(result.reserveRatio).toBe(0);
  });

  it('handles empty allocations array', () => {
    const snapshot = {
      fundId: 1,
      totalAllocation: 0,
      avgConfidence: 0,
      highConfidenceCount: 0,
      allocations: [],
      generatedAt: new Date(),
    };

    const result = mapReserveSnapshot(snapshot, 100_000_000);
    expect(result.allocations).toEqual([]);
    expect(result.totalAllocation).toBe(0);
  });
});

describe('mapPacingSnapshot', () => {
  it('maps a valid PacingSummary to PacingResultsSection', () => {
    const snapshot = {
      fundSize: 100_000_000,
      totalQuarters: 20,
      avgQuarterlyDeployment: 5_000_000,
      marketCondition: 'neutral' as const,
      deployments: [
        { quarter: 1, deployment: 5_000_000, note: 'Q1 neutral pacing' },
        { quarter: 2, deployment: 5_000_000, note: 'Q2 neutral pacing' },
      ],
      generatedAt: new Date('2026-03-20T12:30:00Z'),
    };

    const result = mapPacingSnapshot(snapshot);
    expect(result.deploymentRate).toBe(5_000_000);
    expect(result.yearsToFullDeploy).toBe(5); // 20 quarters / 4
    expect(result.totalQuarters).toBe(20);
    expect(result.marketCondition).toBe('neutral');
    expect(result.deployments).toHaveLength(2);
  });

  it('derives yearsToFullDeploy as totalQuarters / 4', () => {
    const snapshot = {
      fundSize: 50_000_000,
      totalQuarters: 12,
      avgQuarterlyDeployment: 4_166_667,
      marketCondition: 'bull' as const,
      deployments: [],
      generatedAt: new Date(),
    };

    const result = mapPacingSnapshot(snapshot);
    expect(result.yearsToFullDeploy).toBe(3);
  });

  it('handles odd quarter count (rounds to nearest 0.25)', () => {
    const snapshot = {
      fundSize: 50_000_000,
      totalQuarters: 7,
      avgQuarterlyDeployment: 7_142_857,
      marketCondition: 'bear' as const,
      deployments: [],
      generatedAt: new Date(),
    };

    const result = mapPacingSnapshot(snapshot);
    expect(result.yearsToFullDeploy).toBe(1.75); // 7/4
  });

  it('preserves deployments in native quarterly format', () => {
    const deployments = [
      { quarter: 1, deployment: 3_000_000, note: 'Q1' },
      { quarter: 2, deployment: 4_000_000, note: 'Q2' },
      { quarter: 3, deployment: 3_000_000, note: 'Q3' },
    ];
    const snapshot = {
      fundSize: 30_000_000,
      totalQuarters: 3,
      avgQuarterlyDeployment: 3_333_333,
      marketCondition: 'neutral' as const,
      deployments,
      generatedAt: new Date(),
    };

    const result = mapPacingSnapshot(snapshot);
    expect(result.deployments).toEqual(deployments);
  });
});
