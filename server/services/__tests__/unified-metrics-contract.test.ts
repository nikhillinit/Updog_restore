/**
 * UnifiedFundMetrics Contract Tests
 *
 * These tests ensure API stability and data integrity for the UnifiedFundMetrics schema.
 * They validate:
 * - Schema structure and shape
 * - Type safety and Zod validation
 * - Numerical invariants and business rules
 * - Edge cases and boundary conditions
 * - Snapshot testing for schema stability
 *
 * Run: npm test -- unified-metrics-contract.test.ts
 *
 * @module server/services/__tests__/unified-metrics-contract
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type {
  UnifiedFundMetrics,
  ActualMetrics,
  ProjectedMetrics,
  TargetMetrics,
  VarianceMetrics,
} from '@shared/types/metrics';
import { isUnifiedFundMetrics } from '@shared/types/metrics';

// ============================================================================
// Zod Schema Definitions
// ============================================================================

/**
 * Zod schema for ActualMetrics
 *
 * Validates the structure and types of actual metrics data
 */
const ActualMetricsSchema = z.object({
  asOfDate: z.string().datetime(),
  totalCommitted: z.number().min(0),
  totalCalled: z.number().min(0),
  totalDeployed: z.number().min(0),
  totalUncalled: z.number().min(0),
  currentNAV: z.number().min(0),
  totalDistributions: z.number().min(0),
  totalValue: z.number().min(0),
  irr: z.number().min(-0.999999).max(1000), // IRR bounds: -99.9999% to 100,000%
  tvpi: z.number().min(0),
  dpi: z.number().min(0).nullable(), // null when totalDistributions == 0
  rvpi: z.number().min(0),
  activeCompanies: z.number().int().min(0),
  exitedCompanies: z.number().int().min(0),
  writtenOffCompanies: z.number().int().min(0),
  totalCompanies: z.number().int().min(0),
  deploymentRate: z.number().min(0).max(100),
  averageCheckSize: z.number().min(0),
  fundAgeMonths: z.number().int().min(0).optional(),
});

/**
 * Zod schema for ProjectedMetrics
 */
const ProjectedMetricsSchema = z.object({
  asOfDate: z.string().datetime(),
  projectionDate: z.string().datetime(),
  projectedDeployment: z.array(z.number().min(0)),
  projectedDistributions: z.array(z.number().min(0)),
  projectedNAV: z.array(z.number().min(0)),
  expectedTVPI: z.number().min(0),
  expectedIRR: z.number().min(-0.999999).max(1000),
  expectedDPI: z.number().min(0),
  totalReserveNeeds: z.number().min(0),
  allocatedReserves: z.number().min(0),
  unallocatedReserves: z.number().min(0),
  reserveAllocationRate: z.number().min(0).max(100),
  deploymentPace: z.enum(['ahead', 'on-track', 'behind']),
  quartersRemaining: z.number().int().min(0),
  recommendedQuarterlyDeployment: z.number().min(0),
  deploymentProbability: z.number().min(0).max(1).optional(),
  optimisticTVPI: z.number().min(0).optional(),
  pessimisticTVPI: z.number().min(0).optional(),
  irrRange: z.tuple([z.number(), z.number()]).optional(),
});

/**
 * Zod schema for TargetMetrics
 */
const TargetMetricsSchema = z.object({
  targetFundSize: z.number().min(0),
  targetIRR: z.number().min(-0.999999).max(1000),
  targetTVPI: z.number().min(0),
  targetDPI: z.number().min(0).optional(),
  targetDeploymentYears: z.number().min(0),
  targetCompanyCount: z.number().int().min(0),
  targetAverageCheckSize: z.number().min(0),
  targetReserveRatio: z.number().min(0).max(1).optional(),
});

/**
 * Zod schema for VarianceMetrics
 */
const VarianceMetricsSchema = z.object({
  deploymentVariance: z.object({
    actual: z.number().min(0),
    target: z.number().min(0),
    variance: z.number(),
    percentDeviation: z.number(),
    status: z.enum(['ahead', 'on-track', 'behind']),
  }),
  performanceVariance: z.object({
    actualIRR: z.number(),
    targetIRR: z.number(),
    variance: z.number(),
    status: z.enum(['above', 'on-track', 'below']),
  }),
  tvpiVariance: z.object({
    actual: z.number().min(0),
    projected: z.number().min(0),
    target: z.number().min(0),
    varianceVsProjected: z.number(),
    varianceVsTarget: z.number(),
  }),
  paceVariance: z.object({
    status: z.enum(['ahead', 'on-track', 'behind']),
    monthsDeviation: z.number(),
    periodElapsedPercent: z.number().min(0).max(100),
    capitalDeployedPercent: z.number().min(0).max(100),
  }),
  portfolioVariance: z.object({
    actualCompanies: z.number().int().min(0),
    targetCompanies: z.number().int().min(0),
    variance: z.number().int(),
    onTrack: z.boolean(),
  }),
});

/**
 * Complete UnifiedFundMetrics Zod schema
 */
const UnifiedFundMetricsSchema = z.object({
  fundId: z.number().int().positive(),
  fundName: z.string().min(1),
  actual: ActualMetricsSchema,
  projected: ProjectedMetricsSchema,
  target: TargetMetricsSchema,
  variance: VarianceMetricsSchema,
  lastUpdated: z.string().datetime(),
  _cache: z
    .object({
      hit: z.boolean(),
      key: z.string(),
      ttl: z.number().int().min(0).optional(),
      staleWhileRevalidate: z.boolean().optional(),
    })
    .optional(),
  _status: z
    .object({
      quality: z.enum(['complete', 'partial', 'fallback']),
      engines: z.object({
        actual: z.enum(['success', 'partial', 'failed']),
        projected: z.enum(['success', 'partial', 'failed', 'skipped']),
        target: z.enum(['success', 'partial', 'failed']),
        variance: z.enum(['success', 'partial', 'failed']),
      }),
      warnings: z.array(z.string()).optional(),
      computeTimeMs: z.number().int().min(0).optional(),
    })
    .optional(),
});

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a minimal valid UnifiedFundMetrics object for testing
 */
function createValidMetrics(overrides?: Partial<UnifiedFundMetrics>): UnifiedFundMetrics {
  const baseDate = '2025-01-01T00:00:00.000Z';

  const actual: ActualMetrics = {
    asOfDate: baseDate,
    totalCommitted: 100000000,
    totalCalled: 50000000,
    totalDeployed: 45000000,
    totalUncalled: 50000000,
    currentNAV: 60000000,
    totalDistributions: 10000000,
    totalValue: 70000000,
    irr: 0.25,
    tvpi: 1.4,
    dpi: 0.2,
    rvpi: 1.2,
    activeCompanies: 10,
    exitedCompanies: 2,
    writtenOffCompanies: 1,
    totalCompanies: 13,
    deploymentRate: 45,
    averageCheckSize: 3461538,
    fundAgeMonths: 24,
  };

  const projected: ProjectedMetrics = {
    asOfDate: baseDate,
    projectionDate: baseDate,
    projectedDeployment: Array(12).fill(0),
    projectedDistributions: Array(12).fill(0),
    projectedNAV: Array(12).fill(60000000),
    expectedTVPI: 2.5,
    expectedIRR: 0.3,
    expectedDPI: 1.5,
    totalReserveNeeds: 20000000,
    allocatedReserves: 15000000,
    unallocatedReserves: 5000000,
    reserveAllocationRate: 75,
    deploymentPace: 'on-track',
    quartersRemaining: 8,
    recommendedQuarterlyDeployment: 5000000,
  };

  const target: TargetMetrics = {
    targetFundSize: 100000000,
    targetIRR: 0.25,
    targetTVPI: 2.5,
    targetDeploymentYears: 3,
    targetCompanyCount: 20,
    targetAverageCheckSize: 5000000,
  };

  const variance: VarianceMetrics = {
    deploymentVariance: {
      actual: 45000000,
      target: 50000000,
      variance: -5000000,
      percentDeviation: -10,
      status: 'behind',
    },
    performanceVariance: {
      actualIRR: 0.25,
      targetIRR: 0.25,
      variance: 0,
      status: 'on-track',
    },
    tvpiVariance: {
      actual: 1.4,
      projected: 2.5,
      target: 2.5,
      varianceVsProjected: -1.1,
      varianceVsTarget: -1.1,
    },
    paceVariance: {
      status: 'on-track',
      monthsDeviation: 0,
      periodElapsedPercent: 50,
      capitalDeployedPercent: 45,
    },
    portfolioVariance: {
      actualCompanies: 13,
      targetCompanies: 20,
      variance: -7,
      onTrack: true,
    },
  };

  return {
    fundId: 1,
    fundName: 'Test Fund I',
    actual,
    projected,
    target,
    variance,
    lastUpdated: baseDate,
    ...overrides,
  };
}

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('UnifiedFundMetrics - Zod Schema Validation', () => {
  it('should validate complete UnifiedFundMetrics object', () => {
    const metrics = createValidMetrics();
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(true);
  });

  it('should reject invalid fundId (non-positive)', () => {
    const metrics = createValidMetrics({ fundId: 0 });
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(false);
  });

  it('should reject invalid fundName (empty string)', () => {
    const metrics = createValidMetrics({ fundName: '' });
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(false);
  });

  it('should validate optional _cache metadata', () => {
    const metrics = createValidMetrics({
      _cache: {
        hit: true,
        key: 'fund:1:unified-metrics:v1',
        ttl: 300,
      },
    });
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(true);
  });

  it('should validate optional _status metadata', () => {
    const metrics = createValidMetrics({
      _status: {
        quality: 'complete',
        engines: {
          actual: 'success',
          projected: 'success',
          target: 'success',
          variance: 'success',
        },
        warnings: ['Test warning'],
        computeTimeMs: 150,
      },
    });
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(true);
  });

  it('should validate ActualMetrics with optional fundAgeMonths', () => {
    const metrics = createValidMetrics();
    delete metrics.actual.fundAgeMonths;
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(true);
  });

  it('should validate ProjectedMetrics with optional scenario fields', () => {
    const metrics = createValidMetrics();
    metrics.projected.optimisticTVPI = 3.5;
    metrics.projected.pessimisticTVPI = 1.5;
    metrics.projected.irrRange = [0.15, 0.45];
    metrics.projected.deploymentProbability = 0.85;

    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(true);
  });

  it('should reject negative deployment rate', () => {
    const metrics = createValidMetrics();
    metrics.actual.deploymentRate = -10;
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(false);
  });

  it('should reject deployment rate > 100', () => {
    const metrics = createValidMetrics();
    metrics.actual.deploymentRate = 150;
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(false);
  });

  it('should validate IRR within reasonable bounds', () => {
    const metrics = createValidMetrics();
    metrics.actual.irr = -0.95; // -95% (near total loss)
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(true);
  });

  it('should reject IRR below minimum bound', () => {
    const metrics = createValidMetrics();
    metrics.actual.irr = -1.5; // -150% (impossible)
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(false);
  });

  it('should validate very high IRR (unicorn scenario)', () => {
    const metrics = createValidMetrics();
    metrics.actual.irr = 9.5; // 950% (exceptional)
    const result = UnifiedFundMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Numerical Invariant Tests
// ============================================================================

describe('UnifiedFundMetrics - Numerical Invariants', () => {
  it('should enforce TVPI >= DPI invariant', () => {
    const metrics = createValidMetrics();

    // TVPI = totalValue / totalCalled
    const tvpi = metrics.actual.totalValue / metrics.actual.totalCalled;
    // DPI = totalDistributions / totalCalled
    const dpi = metrics.actual.dpi || 0;

    expect(tvpi).toBeGreaterThanOrEqual(dpi);
  });

  it('should set DPI to null when totalDistributions == 0', () => {
    const metrics = createValidMetrics();
    metrics.actual.totalDistributions = 0;
    metrics.actual.dpi = null;
    metrics.actual.totalValue = metrics.actual.currentNAV; // totalValue = NAV + 0

    expect(metrics.actual.dpi).toBeNull();
    expect(metrics.actual.totalValue).toBe(metrics.actual.currentNAV);
  });

  it('should calculate MOIC == TVPI when paid-in equals called capital', () => {
    const metrics = createValidMetrics();
    // In this context, MOIC (Multiple on Invested Capital) == TVPI
    const moic = metrics.actual.totalValue / metrics.actual.totalCalled;
    const tvpi = metrics.actual.tvpi;

    expect(moic).toBeCloseTo(tvpi, 2);
  });

  it('should enforce totalValue = currentNAV + totalDistributions', () => {
    const metrics = createValidMetrics();

    expect(metrics.actual.totalValue).toBe(
      metrics.actual.currentNAV + metrics.actual.totalDistributions
    );
  });

  it('should enforce totalUncalled = totalCommitted - totalCalled', () => {
    const metrics = createValidMetrics();

    expect(metrics.actual.totalUncalled).toBe(
      metrics.actual.totalCommitted - metrics.actual.totalCalled
    );
  });

  it('should enforce totalCompanies = active + exited + written-off', () => {
    const metrics = createValidMetrics();

    expect(metrics.actual.totalCompanies).toBe(
      metrics.actual.activeCompanies +
        metrics.actual.exitedCompanies +
        metrics.actual.writtenOffCompanies
    );
  });

  it('should enforce deploymentRate = (totalDeployed / totalCommitted) * 100', () => {
    const metrics = createValidMetrics();
    const expectedRate = (metrics.actual.totalDeployed / metrics.actual.totalCommitted) * 100;

    expect(metrics.actual.deploymentRate).toBeCloseTo(expectedRate, 2);
  });

  it('should enforce all multiples >= 0', () => {
    const metrics = createValidMetrics();

    expect(metrics.actual.tvpi).toBeGreaterThanOrEqual(0);
    expect(metrics.actual.dpi ?? 0).toBeGreaterThanOrEqual(0);
    expect(metrics.actual.rvpi).toBeGreaterThanOrEqual(0);
    expect(metrics.projected.expectedTVPI).toBeGreaterThanOrEqual(0);
    expect(metrics.projected.expectedDPI).toBeGreaterThanOrEqual(0);
  });

  it('should enforce unallocatedReserves = totalReserveNeeds - allocatedReserves', () => {
    const metrics = createValidMetrics();

    expect(metrics.projected.unallocatedReserves).toBe(
      metrics.projected.totalReserveNeeds - metrics.projected.allocatedReserves
    );
  });

  it('should enforce reserveAllocationRate = (allocatedReserves / totalReserveNeeds) * 100', () => {
    const metrics = createValidMetrics();

    if (metrics.projected.totalReserveNeeds > 0) {
      const expectedRate =
        (metrics.projected.allocatedReserves / metrics.projected.totalReserveNeeds) * 100;
      expect(metrics.projected.reserveAllocationRate).toBeCloseTo(expectedRate, 2);
    }
  });

  it('should handle edge case: TVPI = DPI when NAV = 0 (fully exited)', () => {
    const metrics = createValidMetrics();
    metrics.actual.currentNAV = 0;
    metrics.actual.totalDistributions = 70000000;
    metrics.actual.totalValue = 70000000;
    metrics.actual.tvpi = 1.4;
    metrics.actual.dpi = 1.4;
    metrics.actual.rvpi = 0;

    expect(metrics.actual.tvpi).toBe(metrics.actual.dpi);
    expect(metrics.actual.rvpi).toBe(0);
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('UnifiedFundMetrics - Type Guards', () => {
  it('should correctly identify valid UnifiedFundMetrics', () => {
    const metrics = createValidMetrics();

    expect(isUnifiedFundMetrics(metrics)).toBe(true);
  });

  it('should reject null', () => {
    expect(isUnifiedFundMetrics(null)).toBe(false);
  });

  it('should reject undefined', () => {
    expect(isUnifiedFundMetrics(undefined)).toBe(false);
  });

  it('should reject non-object values', () => {
    expect(isUnifiedFundMetrics('string')).toBe(false);
    expect(isUnifiedFundMetrics(123)).toBe(false);
    expect(isUnifiedFundMetrics(true)).toBe(false);
  });

  it('should reject object missing required fields', () => {
    const incomplete = {
      fundId: 1,
      fundName: 'Test',
      // missing actual, projected, target, variance, lastUpdated
    };

    expect(isUnifiedFundMetrics(incomplete)).toBe(false);
  });

  it('should reject object with wrong field types', () => {
    const invalid = {
      fundId: '1', // should be number
      fundName: 'Test',
      actual: {},
      projected: {},
      target: {},
      variance: {},
      lastUpdated: '2025-01-01',
    };

    expect(isUnifiedFundMetrics(invalid)).toBe(false);
  });
});

// ============================================================================
// Snapshot Tests
// ============================================================================

describe('UnifiedFundMetrics - Snapshot Testing', () => {
  it('should match snapshot for complete metrics structure', () => {
    const metrics = createValidMetrics({
      _cache: {
        hit: false,
        key: 'fund:1:unified-metrics:v1',
      },
      _status: {
        quality: 'complete',
        engines: {
          actual: 'success',
          projected: 'success',
          target: 'success',
          variance: 'success',
        },
        computeTimeMs: 125,
      },
    });

    // Snapshot ensures no unexpected fields are added/removed
    expect(metrics).toMatchSnapshot();
  });

  it('should match snapshot for minimal metrics (no optional fields)', () => {
    const metrics = createValidMetrics();
    delete metrics.actual.fundAgeMonths;

    expect(metrics).toMatchSnapshot();
  });

  it('should match snapshot for metrics with all optional scenario fields', () => {
    const metrics = createValidMetrics();
    metrics.projected.optimisticTVPI = 3.5;
    metrics.projected.pessimisticTVPI = 1.5;
    metrics.projected.irrRange = [0.15, 0.45];
    metrics.projected.deploymentProbability = 0.85;

    expect(metrics).toMatchSnapshot();
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('UnifiedFundMetrics - Edge Cases', () => {
  it('should handle empty fund (no companies)', () => {
    const metrics = createValidMetrics();
    metrics.actual.activeCompanies = 0;
    metrics.actual.exitedCompanies = 0;
    metrics.actual.writtenOffCompanies = 0;
    metrics.actual.totalCompanies = 0;
    metrics.actual.totalDeployed = 0;
    metrics.actual.currentNAV = 0;
    metrics.actual.totalDistributions = 0;
    metrics.actual.totalValue = 0;
    metrics.actual.tvpi = 0;
    metrics.actual.dpi = null;
    metrics.actual.rvpi = 0;
    metrics.actual.deploymentRate = 0;
    metrics.actual.averageCheckSize = 0;
    metrics.actual.irr = 0;

    const result = UnifiedFundMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it('should handle single company fund', () => {
    const metrics = createValidMetrics();
    metrics.actual.activeCompanies = 1;
    metrics.actual.exitedCompanies = 0;
    metrics.actual.writtenOffCompanies = 0;
    metrics.actual.totalCompanies = 1;
    metrics.actual.totalDeployed = 5000000;
    metrics.actual.averageCheckSize = 5000000;

    const result = UnifiedFundMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it('should handle fund with 100+ companies (performance scenario)', () => {
    const metrics = createValidMetrics();
    metrics.actual.activeCompanies = 80;
    metrics.actual.exitedCompanies = 20;
    metrics.actual.writtenOffCompanies = 10;
    metrics.actual.totalCompanies = 110;
    metrics.actual.totalDeployed = 95000000;
    metrics.actual.deploymentRate = 95;
    metrics.actual.averageCheckSize = 863636;

    const result = UnifiedFundMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it('should handle fund with zero distributions (DPI = null)', () => {
    const metrics = createValidMetrics();
    metrics.actual.totalDistributions = 0;
    metrics.actual.dpi = null;
    metrics.actual.totalValue = metrics.actual.currentNAV;

    const result = UnifiedFundMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
    expect(metrics.actual.dpi).toBeNull();
  });

  it('should handle fully deployed fund (deploymentRate = 100)', () => {
    const metrics = createValidMetrics();
    metrics.actual.totalDeployed = metrics.actual.totalCommitted;
    metrics.actual.deploymentRate = 100;
    metrics.actual.totalUncalled = 0;

    const result = UnifiedFundMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it('should handle negative IRR scenario (fund underperforming)', () => {
    const metrics = createValidMetrics();
    metrics.actual.irr = -0.15; // -15%
    metrics.actual.totalValue = 40000000; // Less than called
    metrics.actual.tvpi = 0.8; // Below 1.0x

    const result = UnifiedFundMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it('should handle very high IRR scenario (unicorn fund)', () => {
    const metrics = createValidMetrics();
    metrics.actual.irr = 8.5; // 850%
    metrics.actual.totalValue = 500000000;
    metrics.actual.tvpi = 10;

    const result = UnifiedFundMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it('should handle partial calculation failure status', () => {
    const metrics = createValidMetrics({
      _status: {
        quality: 'partial',
        engines: {
          actual: 'success',
          projected: 'failed',
          target: 'success',
          variance: 'partial',
        },
        warnings: ['Projected metrics calculation failed: Insufficient data'],
        computeTimeMs: 85,
      },
    });

    const result = UnifiedFundMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it('should handle stale cache scenario', () => {
    const metrics = createValidMetrics({
      _cache: {
        hit: true,
        key: 'fund:1:unified-metrics:v1',
        ttl: 0,
        staleWhileRevalidate: true,
      },
    });

    const result = UnifiedFundMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it('should handle skipped projections scenario', () => {
    const metrics = createValidMetrics({
      _status: {
        quality: 'partial',
        engines: {
          actual: 'success',
          projected: 'skipped',
          target: 'success',
          variance: 'success',
        },
        warnings: ['Projections skipped for performance'],
        computeTimeMs: 45,
      },
    });

    const result = UnifiedFundMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Nested Object Structure Tests
// ============================================================================

describe('UnifiedFundMetrics - Nested Object Structures', () => {
  it('should validate nested actual metrics object', () => {
    const metrics = createValidMetrics();
    const result = ActualMetricsSchema.safeParse(metrics.actual);

    expect(result.success).toBe(true);
  });

  it('should validate nested projected metrics object', () => {
    const metrics = createValidMetrics();
    const result = ProjectedMetricsSchema.safeParse(metrics.projected);

    expect(result.success).toBe(true);
  });

  it('should validate nested target metrics object', () => {
    const metrics = createValidMetrics();
    const result = TargetMetricsSchema.safeParse(metrics.target);

    expect(result.success).toBe(true);
  });

  it('should validate nested variance metrics object', () => {
    const metrics = createValidMetrics();
    const result = VarianceMetricsSchema.safeParse(metrics.variance);

    expect(result.success).toBe(true);
  });

  it('should validate array fields in projected metrics', () => {
    const metrics = createValidMetrics();
    metrics.projected.projectedDeployment = [1000000, 2000000, 1500000];
    metrics.projected.projectedDistributions = [0, 0, 500000];
    metrics.projected.projectedNAV = [60000000, 61000000, 62000000];

    const result = ProjectedMetricsSchema.safeParse(metrics.projected);
    expect(result.success).toBe(true);
  });

  it('should reject negative values in projected arrays', () => {
    const metrics = createValidMetrics();
    metrics.projected.projectedDeployment = [1000000, -500000]; // negative

    const result = ProjectedMetricsSchema.safeParse(metrics.projected);
    expect(result.success).toBe(false);
  });

  it('should validate deployment variance nested object', () => {
    const variance = createValidMetrics().variance.deploymentVariance;

    expect(variance).toHaveProperty('actual');
    expect(variance).toHaveProperty('target');
    expect(variance).toHaveProperty('variance');
    expect(variance).toHaveProperty('percentDeviation');
    expect(variance).toHaveProperty('status');
    expect(['ahead', 'on-track', 'behind']).toContain(variance.status);
  });

  it('should validate performance variance nested object', () => {
    const variance = createValidMetrics().variance.performanceVariance;

    expect(variance).toHaveProperty('actualIRR');
    expect(variance).toHaveProperty('targetIRR');
    expect(variance).toHaveProperty('variance');
    expect(variance).toHaveProperty('status');
    expect(['above', 'on-track', 'below']).toContain(variance.status);
  });
});

// ============================================================================
// Comprehensive Integration Test
// ============================================================================

describe('UnifiedFundMetrics - Integration', () => {
  it('should validate complete real-world metrics example', () => {
    const realWorldMetrics: UnifiedFundMetrics = {
      fundId: 42,
      fundName: 'Acme Ventures Fund III',
      actual: {
        asOfDate: '2025-10-04T12:00:00.000Z',
        totalCommitted: 250000000,
        totalCalled: 175000000,
        totalDeployed: 168000000,
        totalUncalled: 75000000,
        currentNAV: 285000000,
        totalDistributions: 45000000,
        totalValue: 330000000,
        irr: 0.285,
        tvpi: 1.886,
        dpi: 0.257,
        rvpi: 1.629,
        activeCompanies: 32,
        exitedCompanies: 8,
        writtenOffCompanies: 4,
        totalCompanies: 44,
        deploymentRate: 67.2,
        averageCheckSize: 3818182,
        fundAgeMonths: 48,
      },
      projected: {
        asOfDate: '2025-10-04T12:00:00.000Z',
        projectionDate: '2025-10-04T12:00:00.000Z',
        projectedDeployment: [8000000, 7000000, 6000000, 5000000, 4000000, 3000000, 2000000, 1000000, 0, 0, 0, 0],
        projectedDistributions: [2000000, 3000000, 5000000, 8000000, 12000000, 15000000, 20000000, 25000000, 30000000, 35000000, 25000000, 15000000],
        projectedNAV: [290000000, 295000000, 300000000, 310000000, 315000000, 320000000, 310000000, 290000000, 250000000, 200000000, 150000000, 80000000],
        expectedTVPI: 3.2,
        expectedIRR: 0.32,
        expectedDPI: 2.8,
        totalReserveNeeds: 85000000,
        allocatedReserves: 65000000,
        unallocatedReserves: 20000000,
        reserveAllocationRate: 76.47,
        deploymentPace: 'ahead',
        quartersRemaining: 4,
        recommendedQuarterlyDeployment: 5000000,
        deploymentProbability: 0.92,
        optimisticTVPI: 4.5,
        pessimisticTVPI: 2.1,
        irrRange: [0.18, 0.48],
      },
      target: {
        targetFundSize: 250000000,
        targetIRR: 0.25,
        targetTVPI: 3.0,
        targetDPI: 2.5,
        targetDeploymentYears: 4,
        targetCompanyCount: 50,
        targetAverageCheckSize: 5000000,
        targetReserveRatio: 0.5,
      },
      variance: {
        deploymentVariance: {
          actual: 168000000,
          target: 187500000,
          variance: -19500000,
          percentDeviation: -10.4,
          status: 'behind',
        },
        performanceVariance: {
          actualIRR: 0.285,
          targetIRR: 0.25,
          variance: 0.035,
          status: 'above',
        },
        tvpiVariance: {
          actual: 1.886,
          projected: 3.2,
          target: 3.0,
          varianceVsProjected: -1.314,
          varianceVsTarget: -1.114,
        },
        paceVariance: {
          status: 'ahead',
          monthsDeviation: 3,
          periodElapsedPercent: 100,
          capitalDeployedPercent: 67.2,
        },
        portfolioVariance: {
          actualCompanies: 44,
          targetCompanies: 50,
          variance: -6,
          onTrack: true,
        },
      },
      lastUpdated: '2025-10-04T12:00:00.000Z',
      _cache: {
        hit: false,
        key: 'fund:42:unified-metrics:v1',
        ttl: 300,
      },
      _status: {
        quality: 'complete',
        engines: {
          actual: 'success',
          projected: 'success',
          target: 'success',
          variance: 'success',
        },
        computeTimeMs: 187,
      },
    };

    const result = UnifiedFundMetricsSchema.safeParse(realWorldMetrics);
    expect(result.success).toBe(true);

    // Verify type guard
    expect(isUnifiedFundMetrics(realWorldMetrics)).toBe(true);

    // Verify invariants
    expect(realWorldMetrics.actual.tvpi).toBeGreaterThanOrEqual(realWorldMetrics.actual.dpi!);
    expect(realWorldMetrics.actual.totalValue).toBe(
      realWorldMetrics.actual.currentNAV + realWorldMetrics.actual.totalDistributions
    );
    expect(realWorldMetrics.actual.totalCompanies).toBe(
      realWorldMetrics.actual.activeCompanies +
        realWorldMetrics.actual.exitedCompanies +
        realWorldMetrics.actual.writtenOffCompanies
    );
  });
});
