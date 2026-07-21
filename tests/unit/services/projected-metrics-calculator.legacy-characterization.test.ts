import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fund } from '@shared/schema';
import type { ProjectedMetrics } from '@shared/types/metrics';
import { ProjectedMetricsCalculator } from '../../../server/services/projected-metrics-calculator';

const RANDOM_SEQ = [0.42, 0.17, 0.88, 0.63, 0.05];
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

function installSeededRandom(): void {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => RANDOM_SEQ[i++ % RANDOM_SEQ.length]!);
}

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

describe('ProjectedMetricsCalculator legacy characterization (seeded, fixed clock)', () => {
  let previousNodeEnv: string | undefined;
  let previousAlgCohort: string | undefined;

  beforeEach(() => {
    previousNodeEnv = process.env['NODE_ENV'];
    previousAlgCohort = process.env['ALG_COHORT'];
    process.env['NODE_ENV'] = 'test';
    process.env['ALG_COHORT'] = 'false';
    installSeededRandom();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('ALG_COHORT', previousAlgCohort);
  });

  it('locks the standard-path ProjectedMetrics shape without pinning random-influenced values', async () => {
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
        projectedDistributions: expect.any(Array),
        projectedNAV: expect.any(Array),
        expectedTVPI: expect.any(Number),
        expectedIRR: expect.any(Number),
        expectedDPI: expect.any(Number),
        totalReserveNeeds: expect.any(Number),
        allocatedReserves: expect.any(Number),
        unallocatedReserves: expect.any(Number),
        reserveAllocationRate: expect.any(Number),
        deploymentPace: expect.any(String),
        quartersRemaining: expect.any(Number),
        recommendedQuarterlyDeployment: expect.any(Number),
      })
    );
    expect(Number.isFinite(result.expectedTVPI)).toBe(true);
    expect(Number.isFinite(result.expectedIRR)).toBe(true);
    expect(Number.isFinite(result.expectedDPI)).toBe(true);
    expect(result.projectedDistributions).toHaveLength(40);
    expect(result.projectedNAV).toHaveLength(40);
    expect(result.projectedDeployment.length).toBeGreaterThan(0);
    expect(result.projectedDeployment.every(Number.isFinite)).toBe(true);
    expect(['ahead', 'on-track', 'behind']).toContain(result.deploymentPace);
  });

  it('locks reserve-input defaults through deterministic equality and a non-vacuity control', async () => {
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

    // Reserve and pacing results do not draw randomness, so equality here pins the current defaults.
    expect(reserveTuple(rAbsent)).toEqual(reserveTuple(rDefault));
    // The non-default control proves the equality above is load-bearing rather than a 0 === 0 tautology.
    expect(reserveTuple(rNon)).not.toEqual(reserveTuple(rDefault));
  });

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
  it('pins the current null-engine fallback arrays', () => {
    type PmcFallbacks = {
      buildDistributionProjection(c: null): number[];
      buildNAVProjection(c: null): number[];
      buildDeploymentProjection(p: null, r: null): number[];
    };
    const priv = new ProjectedMetricsCalculator() as unknown as PmcFallbacks;

    // These are reached only when an engine returns null. They are pinned as current behavior that
    // Task 2's containment guard protects, explicitly not endorsed as decision-grade.
    expect(priv.buildDistributionProjection(null)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 1_000_000, 2_000_000, 5_000_000, 10_000_000,
    ]);
    const nav = priv.buildNAVProjection(null);
    expect(nav).toHaveLength(40);
    expect(nav[0]).toBe(10_000_000);
    expect(nav[39]).toBeCloseTo(49_000_000, 6);
    expect(priv.buildDeploymentProjection(null, null)).toEqual(Array(12).fill(0));
  });
});
