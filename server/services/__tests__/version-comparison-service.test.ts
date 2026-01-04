/**
 * VersionComparisonService Tests
 *
 * Tests for version comparison and metric delta computation.
 *
 * Run: npm test -- version-comparison-service.test.ts
 *
 * @module server/services/__tests__/version-comparison-service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VersionComparisonService,
  METRIC_TRENDS,
  METRIC_DISPLAY_NAMES,
} from '../version-comparison-service';
import type { SnapshotVersion } from '@shared/schema';

// Mock the database and redis
vi.mock('../../db', () => ({
  redisGetJSON: vi.fn(),
  redisSetJSON: vi.fn(),
}));

// Mock the version service
vi.mock('../snapshot-version-service', () => ({
  SnapshotVersionService: vi.fn().mockImplementation(() => ({
    getVersion: vi.fn(),
  })),
  VersionNotFoundError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'VersionNotFoundError';
    }
  },
}));

describe('VersionComparisonService', () => {
  let service: VersionComparisonService;
  let mockVersionService: {
    getVersion: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create service with mocked dependencies
    service = new VersionComparisonService();

    // Get reference to the mocked version service
    mockVersionService = (service as unknown as { versionService: typeof mockVersionService })
      .versionService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('METRIC_TRENDS configuration', () => {
    it('should have higher_is_better for financial performance metrics', () => {
      expect(METRIC_TRENDS.moic).toBe('higher_is_better');
      expect(METRIC_TRENDS.irr).toBe('higher_is_better');
      expect(METRIC_TRENDS.tvpi).toBe('higher_is_better');
      expect(METRIC_TRENDS.dpi).toBe('higher_is_better');
      expect(METRIC_TRENDS.exit_proceeds).toBe('higher_is_better');
    });

    it('should have lower_is_better for cost metrics', () => {
      expect(METRIC_TRENDS.total_investment).toBe('lower_is_better');
      expect(METRIC_TRENDS.follow_ons).toBe('lower_is_better');
      expect(METRIC_TRENDS.management_fees).toBe('lower_is_better');
    });

    it('should have neutral for non-directional metrics', () => {
      expect(METRIC_TRENDS.reserve_ratio).toBe('neutral');
      expect(METRIC_TRENDS.deployment_pace).toBe('neutral');
    });
  });

  describe('METRIC_DISPLAY_NAMES configuration', () => {
    it('should have display names for all tracked metrics', () => {
      expect(METRIC_DISPLAY_NAMES.moic).toBe('MOIC');
      expect(METRIC_DISPLAY_NAMES.irr).toBe('IRR');
      expect(METRIC_DISPLAY_NAMES.total_investment).toBe('Total Investment');
      expect(METRIC_DISPLAY_NAMES.follow_ons).toBe('Follow-on Capital');
    });
  });

  describe('compareVersions', () => {
    it('should compute state diff between versions', async () => {
      const baseVersion: Partial<SnapshotVersion> = {
        id: 'v1',
        snapshotId: 's1',
        versionNumber: 1,
        stateSnapshot: { fundSize: 100000000, deploymentPace: 12 },
        calculatedMetrics: { moic: 1.5, irr: 0.15 },
      };

      const comparisonVersion: Partial<SnapshotVersion> = {
        id: 'v2',
        snapshotId: 's1',
        versionNumber: 2,
        stateSnapshot: { fundSize: 150000000, deploymentPace: 12 },
        calculatedMetrics: { moic: 2.0, irr: 0.20 },
      };

      mockVersionService.getVersion
        .mockResolvedValueOnce(baseVersion)
        .mockResolvedValueOnce(comparisonVersion);

      const result = await service.compareVersions({
        baseVersionId: 'v1',
        comparisonVersionId: 'v2',
      });

      expect(result.baseVersionId).toBe('v1');
      expect(result.comparisonVersionId).toBe('v2');
      expect(result.stateDiff.modifiedKeys).toContain('fundSize');
      expect(result.stateDiff.totalChanges).toBe(1);
    });

    it('should compute metric deltas correctly', async () => {
      const baseVersion: Partial<SnapshotVersion> = {
        id: 'v1',
        versionNumber: 1,
        stateSnapshot: {},
        calculatedMetrics: { moic: 1.5, irr: 0.15 },
      };

      const comparisonVersion: Partial<SnapshotVersion> = {
        id: 'v2',
        versionNumber: 2,
        stateSnapshot: {},
        calculatedMetrics: { moic: 2.0, irr: 0.20 },
      };

      mockVersionService.getVersion
        .mockResolvedValueOnce(baseVersion)
        .mockResolvedValueOnce(comparisonVersion);

      const result = await service.compareVersions({
        baseVersionId: 'v1',
        comparisonVersionId: 'v2',
      });

      const moicDelta = result.metricDeltas.find((d) => d.metricName === 'moic');
      expect(moicDelta).toBeDefined();
      expect(moicDelta!.baseValue).toBe(1.5);
      expect(moicDelta!.comparisonValue).toBe(2.0);
      expect(moicDelta!.absoluteDelta).toBe(0.5);
      expect(moicDelta!.isBetter).toBe(true); // higher_is_better
    });

    it('should identify improvements for lower_is_better metrics', async () => {
      const baseVersion: Partial<SnapshotVersion> = {
        id: 'v1',
        versionNumber: 1,
        stateSnapshot: {},
        calculatedMetrics: { total_investment: 10000000 },
      };

      const comparisonVersion: Partial<SnapshotVersion> = {
        id: 'v2',
        versionNumber: 2,
        stateSnapshot: {},
        calculatedMetrics: { total_investment: 8000000 },
      };

      mockVersionService.getVersion
        .mockResolvedValueOnce(baseVersion)
        .mockResolvedValueOnce(comparisonVersion);

      const result = await service.compareVersions({
        baseVersionId: 'v1',
        comparisonVersionId: 'v2',
      });

      const investmentDelta = result.metricDeltas.find(
        (d) => d.metricName === 'total_investment'
      );
      expect(investmentDelta!.absoluteDelta).toBe(-2000000);
      expect(investmentDelta!.isBetter).toBe(true); // lower_is_better
    });

    it('should handle null metrics gracefully', async () => {
      const baseVersion: Partial<SnapshotVersion> = {
        id: 'v1',
        versionNumber: 1,
        stateSnapshot: {},
        calculatedMetrics: null,
      };

      const comparisonVersion: Partial<SnapshotVersion> = {
        id: 'v2',
        versionNumber: 2,
        stateSnapshot: {},
        calculatedMetrics: { moic: 1.5 },
      };

      mockVersionService.getVersion
        .mockResolvedValueOnce(baseVersion)
        .mockResolvedValueOnce(comparisonVersion);

      const result = await service.compareVersions({
        baseVersionId: 'v1',
        comparisonVersionId: 'v2',
      });

      expect(result.metricDeltas).toBeDefined();
      const moicDelta = result.metricDeltas.find((d) => d.metricName === 'moic');
      expect(moicDelta!.baseValue).toBeNull();
      expect(moicDelta!.comparisonValue).toBe(1.5);
    });

    it('should filter by requested metrics', async () => {
      const baseVersion: Partial<SnapshotVersion> = {
        id: 'v1',
        versionNumber: 1,
        stateSnapshot: {},
        calculatedMetrics: { moic: 1.5, irr: 0.15, tvpi: 1.2 },
      };

      const comparisonVersion: Partial<SnapshotVersion> = {
        id: 'v2',
        versionNumber: 2,
        stateSnapshot: {},
        calculatedMetrics: { moic: 2.0, irr: 0.20, tvpi: 1.5 },
      };

      mockVersionService.getVersion
        .mockResolvedValueOnce(baseVersion)
        .mockResolvedValueOnce(comparisonVersion);

      const result = await service.compareVersions({
        baseVersionId: 'v1',
        comparisonVersionId: 'v2',
        metrics: ['moic', 'irr'],
      });

      expect(result.metricDeltas).toHaveLength(2);
      expect(result.metricDeltas.map((d) => d.metricName)).toEqual(['moic', 'irr']);
    });

    it('should compute percentage delta correctly', async () => {
      const baseVersion: Partial<SnapshotVersion> = {
        id: 'v1',
        versionNumber: 1,
        stateSnapshot: {},
        calculatedMetrics: { moic: 2.0 },
      };

      const comparisonVersion: Partial<SnapshotVersion> = {
        id: 'v2',
        versionNumber: 2,
        stateSnapshot: {},
        calculatedMetrics: { moic: 2.5 },
      };

      mockVersionService.getVersion
        .mockResolvedValueOnce(baseVersion)
        .mockResolvedValueOnce(comparisonVersion);

      const result = await service.compareVersions({
        baseVersionId: 'v1',
        comparisonVersionId: 'v2',
      });

      const moicDelta = result.metricDeltas.find((d) => d.metricName === 'moic');
      // (2.5 - 2.0) / 2.0 * 100 = 25%
      expect(moicDelta!.percentageDelta).toBeCloseTo(25, 2);
    });

    it('should handle zero base value for percentage delta', async () => {
      const baseVersion: Partial<SnapshotVersion> = {
        id: 'v1',
        versionNumber: 1,
        stateSnapshot: {},
        calculatedMetrics: { moic: 0 },
      };

      const comparisonVersion: Partial<SnapshotVersion> = {
        id: 'v2',
        versionNumber: 2,
        stateSnapshot: {},
        calculatedMetrics: { moic: 1.5 },
      };

      mockVersionService.getVersion
        .mockResolvedValueOnce(baseVersion)
        .mockResolvedValueOnce(comparisonVersion);

      const result = await service.compareVersions({
        baseVersionId: 'v1',
        comparisonVersionId: 'v2',
      });

      const moicDelta = result.metricDeltas.find((d) => d.metricName === 'moic');
      expect(moicDelta!.percentageDelta).toBeNull(); // Avoid divide by zero
    });
  });

  describe('diffSummary', () => {
    it('should generate human-readable diff summary', async () => {
      const baseVersion: Partial<SnapshotVersion> = {
        id: 'v1',
        versionNumber: 1,
        stateSnapshot: { a: 1, b: 2 },
        calculatedMetrics: {},
      };

      const comparisonVersion: Partial<SnapshotVersion> = {
        id: 'v2',
        versionNumber: 2,
        stateSnapshot: { a: 10, c: 3 },
        calculatedMetrics: {},
      };

      mockVersionService.getVersion
        .mockResolvedValueOnce(baseVersion)
        .mockResolvedValueOnce(comparisonVersion);

      const result = await service.compareVersions({
        baseVersionId: 'v1',
        comparisonVersionId: 'v2',
      });

      expect(result.diffSummary).toContain('added');
      expect(result.diffSummary).toContain('removed');
      expect(result.diffSummary).toContain('modified');
    });
  });
});
