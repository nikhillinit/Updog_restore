import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fund } from '@shared/schema';
import type { ProjectedMetrics } from '@shared/types/metrics';
import { ProjectedMetricsCalculator } from '../../../server/services/projected-metrics-calculator';

const FIXED_TIME = new Date('2026-07-01T00:00:00Z');

const fund = {
  id: 1,
  name: 'Char Fund',
  size: '100000000',
  deployedCapital: '24000000',
  managementFee: '0.02',
  carryPercentage: '0.2',
  vintageYear: 2021,
  establishmentDate: '2024-01-01',
  status: 'active',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
} as unknown as Fund;
const investmentDate = new Date('2021-06-01T00:00:00.000Z');

type CompanyInputs = Parameters<ProjectedMetricsCalculator['calculate']>[1];

function restoreEnv(name: 'NODE_ENV' | 'ALG_COHORT', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function reserveTuple(result: ProjectedMetrics): [number, number, number, number] {
  return [
    result.totalReserveNeeds,
    result.allocatedReserves,
    result.unallocatedReserves,
    result.reserveAllocationRate,
  ];
}

describe('ProjectedMetricsCalculator legacy characterization (fixed clock)', () => {
  let previousNodeEnv: string | undefined;
  let previousAlgCohort: string | undefined;

  beforeEach(() => {
    previousNodeEnv = process.env['NODE_ENV'];
    previousAlgCohort = process.env['ALG_COHORT'];
    process.env['NODE_ENV'] = 'test';
    process.env['ALG_COHORT'] = 'false';
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('ALG_COHORT', previousAlgCohort);
  });

  it('locks the standard-path ProjectedMetrics shape with cohort-sourced fields unavailable', async () => {
    const calc = new ProjectedMetricsCalculator();
    const result = await calc.calculate(
      fund,
      [
        {
          id: 1,
          investmentAmount: '1000000',
          stage: 'Seed',
          currentStage: 'Seed',
          sector: 'SaaS',
          ownershipCurrentPct: '0.1',
          investmentDate,
        },
      ],
      { fundTermYears: 10 }
    );

    expect(result).toEqual(
      expect.objectContaining({
        asOfDate: expect.any(String),
        projectionDate: expect.any(String),
        projectedDeployment: expect.any(Array),
        projectedDistributions: null,
        projectedNAV: null,
        expectedTVPI: null,
        expectedIRR: null,
        expectedDPI: null,
        totalReserveNeeds: expect.any(Number),
        allocatedReserves: expect.any(Number),
        unallocatedReserves: expect.any(Number),
        reserveAllocationRate: expect.any(Number),
        deploymentPace: expect.any(String),
        quartersRemaining: expect.any(Number),
        recommendedQuarterlyDeployment: expect.any(Number),
      })
    );
    // P0 Task 1: no engine provides performance projections on this path, so the
    // calculator reports explicit unavailability rather than config targets.
    expect(result.expectedTVPI).toBeNull();
    expect(result.expectedIRR).toBeNull();
    expect(result.expectedDPI).toBeNull();
    expect(result.projectedDistributions).toBeNull();
    expect(result.projectedNAV).toBeNull();
    expect(result.projectedDeployment.length).toBeGreaterThan(0);
    expect(result.projectedDeployment.every(Number.isFinite)).toBe(true);
    expect(['ahead', 'on-track', 'behind']).toContain(result.deploymentPace);
  });

  it('passes absent ownership through as null: same base allocation as an explicit 0.1, no confidence bonus', async () => {
    const calc = new ProjectedMetricsCalculator();
    const absent = [
      { id: 1, investmentAmount: '1000000', investmentDate },
    ] as unknown as CompanyInputs;
    const explicitDefault: CompanyInputs = [
      {
        id: 1,
        investmentAmount: '1000000',
        stage: 'Seed',
        currentStage: 'Seed',
        sector: 'SaaS',
        ownershipCurrentPct: '0.1',
        investmentDate,
      },
    ];
    const nonDefault: CompanyInputs = [
      {
        id: 1,
        investmentAmount: '1000000',
        stage: 'Series C',
        currentStage: 'Series C',
        sector: 'Fintech',
        ownershipCurrentPct: '0.5',
        investmentDate,
      },
    ];
    const config = { fundTermYears: 10 };

    const rAbsent = await calc.calculate(fund, absent, config);
    const rDefault = await calc.calculate(fund, explicitDefault, config);
    const rNon = await calc.calculate(fund, nonDefault, config);

    // Reserve results draw no randomness. Absent stage/sector still default to Seed/SaaS, so both
    // sides share the base allocation 1M * 1.5 * 1.1 = 1,650,000. Ownership is the only difference:
    // absent -> null (ADR-054: never defaulted) -> neutral in the engine, so confidence is
    // 0.3 + 0.2 = 0.5 and allocatedReserves = 1,650,000 * 0.5 = 825,000. An explicit 0.1 sits in the
    // no-multiplier band but earns the +0.15 ownership bonus (0.65 -> 1,072,500). The absent values
    // are reachable only with ownership === null: 0 would take the 0.8 penalty (1,320,000) and the
    // former '0.1' default would reproduce the explicit column exactly.
    expect(reserveTuple(rAbsent)).toEqual([1_650_000, 825_000, 825_000, 50]);
    expect(rDefault.totalReserveNeeds).toBe(1_650_000);
    expect(rDefault.allocatedReserves).toBeCloseTo(1_072_500, 6);
    expect(rAbsent.allocatedReserves).toBeLessThan(rDefault.allocatedReserves);
    // The non-default control proves the pins above are load-bearing rather than a 0 === 0 tautology.
    expect(reserveTuple(rNon)).not.toEqual(reserveTuple(rDefault));
  });

  // The construction-path `config.targetIRR ?? 0.25` default is a separate pre-existing
  // fabrication, deferred as item 11 in the semantic-convergence P0 plan. Pinned here as
  // current behavior, explicitly not endorsed.
  it('locks the construction-path targetIRR default and deterministic containment values', async () => {
    const calc = new ProjectedMetricsCalculator();
    const result = await calc.calculate(
      fund,
      [],
      { fundTermYears: 10, investmentPeriodYears: 5 },
      { useConstructionForecast: true }
    );

    expect(result.expectedIRR).toBe(0.25);
    expect(result.deploymentPace).toBe('on-track');
    expect(result.totalReserveNeeds).toBe(0);
    expect(result.allocatedReserves).toBe(0);
    expect(result.unallocatedReserves).toBe(0);
    expect(result.reserveAllocationRate).toBe(0);
    expect(result.quartersRemaining).toBe(20);
    expect(result.projectedNAV).toHaveLength(40);
    expect(Number.isFinite(result.expectedTVPI)).toBe(true);
  });
});

describe('deterministic fallback constants (white-box; characterized, NOT endorsed)', () => {
  it('pins the null-pacing deployment fallback and confirms the synthesized curves are gone', () => {
    type PmcFallbacks = {
      buildDeploymentProjection(p: null, r: null): number[];
      buildDistributionProjection?: unknown;
      buildNAVProjection?: unknown;
      generateDistributionSchedule?: unknown;
      generateNAVProgression?: unknown;
    };
    const priv = new ProjectedMetricsCalculator() as unknown as PmcFallbacks;

    // Reached only when the pacing engine returns null; pinned as current behavior,
    // explicitly not endorsed as decision-grade.
    expect(priv.buildDeploymentProjection(null, null)).toEqual(Array(12).fill(0));

    // P0 Task 1 regression guard: the hardcoded J-curve / NAV ramp fallbacks and the
    // config-scaled synthesized schedules must not return.
    expect(priv.buildDistributionProjection).toBeUndefined();
    expect(priv.buildNAVProjection).toBeUndefined();
    expect(priv.generateDistributionSchedule).toBeUndefined();
    expect(priv.generateNAVProgression).toBeUndefined();
  });
});
