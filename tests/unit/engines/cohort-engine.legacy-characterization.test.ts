import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CohortEngine,
  compareCohorts,
  generateCohortSummary,
} from '@shared/core/cohorts/CohortEngine';
import type { CohortInput } from '@shared/types';

const RANDOM_SEQ = [0.42, 0.17, 0.88, 0.63, 0.05];
const STAGES = ['Seed', 'Series A', 'Series B', 'Series C'];
const FIXED_TIME = new Date('2026-07-01T00:00:00Z');
const input: CohortInput = { fundId: 1, vintageYear: 2021, cohortSize: 8 };

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

function expectCompanyShape(
  companies: ReturnType<typeof CohortEngine>['companies'],
  expectedCount: number
): void {
  expect(companies).toHaveLength(expectedCount);
  expect(companies.map((company) => company.id)).toEqual(
    Array.from({ length: expectedCount }, (_, index) => index + 1)
  );

  for (const company of companies) {
    expect(company.name).toEqual(expect.any(String));
    expect(company.name.length).toBeGreaterThan(0);
    expect(STAGES).toContain(company.stage);
    expect(Number.isInteger(company.valuation)).toBe(true);
    expect(company.valuation).toBeGreaterThan(0);
  }
}

function expectRuleBasedPerformance(
  performance: ReturnType<typeof CohortEngine>['performance']
): void {
  expect(Number.isFinite(performance.irr)).toBe(true);
  expect(performance.irr).toBe(Math.round(performance.irr * 10_000) / 10_000);
  expect(performance.multiple).toBeGreaterThanOrEqual(1);
  expect(performance.multiple).toBe(Math.round(performance.multiple * 100) / 100);
  expect(performance.dpi).toBeGreaterThanOrEqual(0);
}

describe('CohortEngine legacy characterization (seeded, rule-based, fixed clock)', () => {
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

  it('locks summary shape and clock-derived metadata without pinning synthetic values', () => {
    const summary = generateCohortSummary(input);

    expect(summary.totalCompanies).toBe(8);
    expectCompanyShape(summary.companies, 8);
    expectRuleBasedPerformance(summary.performance);
    expect(Object.keys(summary.stageDistribution).every((stage) => STAGES.includes(stage))).toBe(
      true
    );
    expect(Object.values(summary.stageDistribution).reduce((sum, count) => sum + count, 0)).toBe(8);

    const meanValuation =
      summary.companies.reduce((sum, company) => sum + company.valuation, 0) /
      summary.companies.length;
    expect(summary.avgValuation).toBe(Math.round(meanValuation));
    expect(summary.metadata).toEqual({
      algorithmMode: 'rule-based',
      yearsActive: 5,
      maturityLevel: 1,
    });
    expect(summary.generatedAt).toBeInstanceOf(Date);
    expect(summary.generatedAt.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('locks the direct engine output shape', () => {
    const result = CohortEngine(input);

    expect(result).toEqual(
      expect.objectContaining({
        cohortId: expect.any(String),
        vintageYear: 2021,
        performance: expect.any(Object),
        companies: expect.any(Array),
      })
    );
    expect(result.cohortId.length).toBeGreaterThan(0);
    expectRuleBasedPerformance(result.performance);
    expectCompanyShape(result.companies, 8);
  });

  it('locks comparison aggregation shape across two cohorts', () => {
    const result = compareCohorts([input, { ...input, vintageYear: 2022 }]);

    expect(result.comparison.totalCompanies).toBe(16);
    expect(result.cohorts.map((cohort) => cohort.cohortId)).toContain(
      result.comparison.bestPerforming
    );
    expect(Number.isFinite(result.comparison.avgIRR)).toBe(true);
    expect(Number.isFinite(result.comparison.avgMultiple)).toBe(true);
  });
});

describe('CohortEngine ML-variant (ALG_COHORT=true)', () => {
  let previousNodeEnv: string | undefined;
  let previousAlgCohort: string | undefined;

  beforeEach(() => {
    previousNodeEnv = process.env['NODE_ENV'];
    previousAlgCohort = process.env['ALG_COHORT'];
    process.env['NODE_ENV'] = 'test';
    process.env['ALG_COHORT'] = 'true';
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

  it('locks the ML branch while retaining shape-only assertions for synthetic values', () => {
    const summary = generateCohortSummary(input);

    expect(summary.metadata?.algorithmMode).toBe('ml-enhanced');
    for (const company of summary.companies) {
      expect(Number.isInteger(company.valuation)).toBe(true);
      expect(company.valuation).toBeGreaterThan(0);
    }
    expect(summary.performance.multiple).toBeGreaterThanOrEqual(0);
    expect(summary.performance.dpi).toBeGreaterThanOrEqual(0);
  });
});

describe('legacy lane is nondeterministic by design (UNSEEDED — no Math.random stub)', () => {
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

  it('retains the unseeded-randomness tripwire for legacy shadow semantics', () => {
    const a = generateCohortSummary(input);
    const b = generateCohortSummary(input);

    // Committed evidence that the legacy engine draws unseeded Math.random: this tripwire fails if
    // the engine becomes deterministic. It justifies Task 13 shadow divergence telemetry and is not
    // an endorsement of this lane as decision-grade.
    expect(a.avgValuation).not.toBe(b.avgValuation);
  });
});
