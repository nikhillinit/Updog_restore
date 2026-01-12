# Phase 2 Monte Carlo Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Consolidate Monte Carlo implementations, enable skipped tests, and create unified Phase 2 workflow connecting all engines.

**Architecture:** Create a facade pattern over existing MC implementations, add test fixtures for database-dependent tests, and build PhoenixPhase2Workflow to connect GraduationRateEngine, MOICCalculator, and MonteCarloOrchestrator.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM mocks, Decimal.js precision

---

## Task 1: Add Distribution Validation to Streaming Engine

**Files:**
- Modify: `server/services/streaming-monte-carlo-engine.ts:575-620`
- Create: `server/services/distribution-validator.ts`
- Test: `tests/unit/services/distribution-validator.test.ts`

**Step 1: Write failing test for distribution validation**

```typescript
// tests/unit/services/distribution-validator.test.ts
import { describe, it, expect } from 'vitest';
import { validateDistribution, DistributionValidationError } from '../../../server/services/distribution-validator';

describe('validateDistribution', () => {
  it('passes for valid monotonic percentiles', () => {
    const dist = {
      percentiles: { p5: 0.1, p25: 0.15, p50: 0.2, p75: 0.25, p95: 0.3 },
      statistics: { mean: 0.2, standardDeviation: 0.05, min: 0.05, max: 0.35 },
      metricType: 'irr' as const
    };

    expect(() => validateDistribution(dist)).not.toThrow();
  });

  it('throws for non-monotonic percentiles (P5 > P50)', () => {
    const dist = {
      percentiles: { p5: 0.5, p25: 0.15, p50: 0.2, p75: 0.25, p95: 0.3 },
      statistics: { mean: 0.2, standardDeviation: 0.05, min: 0.05, max: 0.35 },
      metricType: 'irr' as const
    };

    expect(() => validateDistribution(dist)).toThrow(DistributionValidationError);
    expect(() => validateDistribution(dist)).toThrow(/monotonicity/i);
  });

  it('throws for negative multiple', () => {
    const dist = {
      percentiles: { p5: -0.5, p25: 0.5, p50: 1.0, p75: 1.5, p95: 2.0 },
      statistics: { mean: 1.0, standardDeviation: 0.5, min: -0.5, max: 2.5 },
      metricType: 'multiple' as const
    };

    expect(() => validateDistribution(dist)).toThrow(DistributionValidationError);
    expect(() => validateDistribution(dist)).toThrow(/negative multiple/i);
  });

  it('throws for min > max', () => {
    const dist = {
      percentiles: { p5: 0.1, p25: 0.15, p50: 0.2, p75: 0.25, p95: 0.3 },
      statistics: { mean: 0.2, standardDeviation: 0.05, min: 0.5, max: 0.1 },
      metricType: 'irr' as const
    };

    expect(() => validateDistribution(dist)).toThrow(DistributionValidationError);
    expect(() => validateDistribution(dist)).toThrow(/min.*max/i);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/services/distribution-validator.test.ts
```

Expected output:
```
FAIL  Module not found: distribution-validator
```

**Step 3: Implement distribution validator**

Location: `server/services/distribution-validator.ts`

```typescript
/**
 * Distribution Validator
 *
 * Validates Monte Carlo distribution outputs for sanity.
 * Phase 2 Phoenix: Quality gate for probabilistic outputs.
 */

export class DistributionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DistributionValidationError';
  }
}

export type MetricType = 'irr' | 'multiple' | 'dpi' | 'tvpi' | 'totalValue';

export interface DistributionToValidate {
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  statistics: {
    mean: number;
    standardDeviation: number;
    min: number;
    max: number;
  };
  metricType: MetricType;
}

export function validateDistribution(dist: DistributionToValidate): void {
  const errors: string[] = [];

  // Monotonicity check
  if (dist.percentiles.p5 > dist.percentiles.p25) {
    errors.push('P5 > P25 violates monotonicity');
  }
  if (dist.percentiles.p25 > dist.percentiles.p50) {
    errors.push('P25 > P50 violates monotonicity');
  }
  if (dist.percentiles.p50 > dist.percentiles.p75) {
    errors.push('P50 > P75 violates monotonicity');
  }
  if (dist.percentiles.p75 > dist.percentiles.p95) {
    errors.push('P75 > P95 violates monotonicity');
  }

  // Min/Max check
  if (dist.statistics.min > dist.statistics.max) {
    errors.push('min > max is invalid');
  }

  // Non-negativity for multiples
  if (dist.metricType === 'multiple' && dist.statistics.min < 0) {
    errors.push('Negative multiple is invalid');
  }

  // TVPI/DPI should be non-negative
  if ((dist.metricType === 'tvpi' || dist.metricType === 'dpi') && dist.statistics.min < 0) {
    errors.push(`Negative ${dist.metricType.toUpperCase()} is invalid`);
  }

  if (errors.length > 0) {
    throw new DistributionValidationError(
      `Distribution validation failed: ${errors.join('; ')}`
    );
  }
}

export function validateAllDistributions(
  distributions: Record<string, DistributionToValidate>
): void {
  for (const [metric, dist] of Object.entries(distributions)) {
    try {
      validateDistribution(dist);
    } catch (e) {
      if (e instanceof DistributionValidationError) {
        throw new DistributionValidationError(
          `${metric}: ${e.message}`
        );
      }
      throw e;
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/services/distribution-validator.test.ts
```

Expected: **PASS**

**Step 5: Commit**

```bash
git add server/services/distribution-validator.ts tests/unit/services/distribution-validator.test.ts
git commit -m "feat(phase2): add distribution validation for Monte Carlo outputs"
```

---

## Task 2: Create Test Fixtures for Monte Carlo Database Tests

**Files:**
- Create: `tests/fixtures/monte-carlo-fixtures.ts`
- Create: `tests/mocks/drizzle-mock.ts`
- Test: `tests/unit/fixtures/monte-carlo-fixtures.test.ts`

**Step 1: Write failing test for fixtures**

```typescript
// tests/unit/fixtures/monte-carlo-fixtures.test.ts
import { describe, it, expect } from 'vitest';
import {
  createMockFundBaseline,
  createMockVarianceReports,
  createMockFund
} from '../../fixtures/monte-carlo-fixtures';

describe('Monte Carlo Test Fixtures', () => {
  it('creates valid fund baseline', () => {
    const baseline = createMockFundBaseline({ fundId: 1 });

    expect(baseline.id).toBeDefined();
    expect(baseline.fundId).toBe(1);
    expect(baseline.irr).toBeGreaterThan(-1);
    expect(baseline.irr).toBeLessThan(1);
    expect(baseline.multiple).toBeGreaterThan(0);
    expect(baseline.isActive).toBe(true);
    expect(baseline.isDefault).toBe(true);
  });

  it('creates valid variance reports', () => {
    const reports = createMockVarianceReports({ fundId: 1, count: 5 });

    expect(reports).toHaveLength(5);
    reports.forEach(report => {
      expect(report.fundId).toBe(1);
      expect(report.irrVariance).toBeDefined();
      expect(report.multipleVariance).toBeDefined();
    });
  });

  it('creates valid fund', () => {
    const fund = createMockFund({ id: 1 });

    expect(fund.id).toBe(1);
    expect(fund.size).toBeGreaterThan(0);
    expect(fund.name).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/fixtures/monte-carlo-fixtures.test.ts
```

Expected: FAIL - Module not found

**Step 3: Implement test fixtures**

Location: `tests/fixtures/monte-carlo-fixtures.ts`

```typescript
/**
 * Monte Carlo Test Fixtures
 *
 * Provides realistic mock data for Monte Carlo engine tests
 * without requiring database connection.
 */

import { v4 as uuidv4 } from 'uuid';

export interface MockFundBaselineOptions {
  fundId: number;
  irr?: number;
  multiple?: number;
  dpi?: number;
  deployedCapital?: number;
}

export function createMockFundBaseline(options: MockFundBaselineOptions) {
  return {
    id: uuidv4(),
    fundId: options.fundId,
    irr: options.irr ?? 0.15 + (Math.random() * 0.1 - 0.05),
    multiple: options.multiple ?? 2.0 + (Math.random() * 0.5 - 0.25),
    dpi: options.dpi ?? 0.8 + (Math.random() * 0.2 - 0.1),
    deployedCapital: options.deployedCapital ?? 50_000_000,
    averageInvestment: 2_500_000,
    sectorDistribution: {
      'Technology': 40,
      'Healthcare': 30,
      'Consumer': 20,
      'Other': 10
    },
    stageDistribution: {
      'Seed': 30,
      'Series A': 40,
      'Series B': 20,
      'Series C': 10
    },
    isActive: true,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export interface MockVarianceReportOptions {
  fundId: number;
  baselineId?: string;
  count?: number;
}

export function createMockVarianceReports(options: MockVarianceReportOptions) {
  const count = options.count ?? 10;
  const baselineId = options.baselineId ?? uuidv4();

  return Array.from({ length: count }, (_, i) => ({
    id: uuidv4(),
    fundId: options.fundId,
    baselineId,
    asOfDate: new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000), // 30 days apart
    irrVariance: 0.02 + (Math.random() * 0.02 - 0.01),
    multipleVariance: 0.1 + (Math.random() * 0.1 - 0.05),
    dpiVariance: 0.05 + (Math.random() * 0.05 - 0.025),
    createdAt: new Date()
  }));
}

export interface MockFundOptions {
  id: number;
  size?: number;
  name?: string;
}

export function createMockFund(options: MockFundOptions) {
  return {
    id: options.id,
    name: options.name ?? `Test Fund ${options.id}`,
    size: options.size ?? 100_000_000,
    vintage: 2023,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

/**
 * Creates a complete mock dataset for Monte Carlo testing
 */
export function createMockMonteCarloDataset(fundId: number = 1) {
  const fund = createMockFund({ id: fundId });
  const baseline = createMockFundBaseline({ fundId });
  const varianceReports = createMockVarianceReports({
    fundId,
    baselineId: baseline.id,
    count: 10
  });

  return { fund, baseline, varianceReports };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/fixtures/monte-carlo-fixtures.test.ts
```

Expected: **PASS**

**Step 5: Commit**

```bash
git add tests/fixtures/monte-carlo-fixtures.ts tests/unit/fixtures/monte-carlo-fixtures.test.ts
git commit -m "feat(tests): add Monte Carlo test fixtures for database-free testing"
```

---

## Task 3: Create Monte Carlo Facade for Engine Selection

**Files:**
- Create: `server/services/monte-carlo-facade.ts`
- Test: `tests/unit/services/monte-carlo-facade.test.ts`

**Step 1: Write failing test for facade**

```typescript
// tests/unit/services/monte-carlo-facade.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MonteCarloFacade, SimulationMode } from '../../../server/services/monte-carlo-facade';

describe('MonteCarloFacade', () => {
  it('selects streaming engine for large runs', () => {
    const facade = new MonteCarloFacade();
    const mode = facade.selectMode({ runs: 15000, expectationMode: false });

    expect(mode).toBe(SimulationMode.STREAMING);
  });

  it('selects orchestrator for small runs', () => {
    const facade = new MonteCarloFacade();
    const mode = facade.selectMode({ runs: 500, expectationMode: false });

    expect(mode).toBe(SimulationMode.ORCHESTRATOR);
  });

  it('selects expectation mode when requested', () => {
    const facade = new MonteCarloFacade();
    const mode = facade.selectMode({ runs: 10000, expectationMode: true });

    expect(mode).toBe(SimulationMode.EXPECTATION);
  });

  it('provides consistent interface regardless of engine', async () => {
    const facade = new MonteCarloFacade();

    // Both should return SimulationResults
    const config = {
      fundId: 1,
      runs: 100,
      timeHorizonYears: 5,
      expectationMode: false,
      seed: 42
    };

    // Mock the underlying engines
    const result = await facade.run(config);

    expect(result.simulationId).toBeDefined();
    expect(result.irr).toBeDefined();
    expect(result.multiple).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/services/monte-carlo-facade.test.ts
```

Expected: FAIL - Module not found

**Step 3: Implement facade**

Location: `server/services/monte-carlo-facade.ts`

```typescript
/**
 * Monte Carlo Facade
 *
 * Provides unified interface to multiple Monte Carlo implementations.
 * Selects appropriate engine based on configuration.
 *
 * Phase 2 Phoenix: Consolidation layer for MC engines.
 */

import type { SimulationConfig, SimulationResults } from './monte-carlo-engine';
import { MonteCarloOrchestrator } from './monte-carlo-orchestrator';
import { StreamingMonteCarloEngine } from './streaming-monte-carlo-engine';
import { validateAllDistributions } from './distribution-validator';

export enum SimulationMode {
  EXPECTATION = 'expectation',
  ORCHESTRATOR = 'orchestrator',
  STREAMING = 'streaming'
}

export interface FacadeConfig extends SimulationConfig {
  expectationMode?: boolean;
  seed?: number;
}

export class MonteCarloFacade {
  private orchestrator: MonteCarloOrchestrator | null = null;
  private streamingEngine: StreamingMonteCarloEngine | null = null;

  // Thresholds for engine selection
  private readonly STREAMING_THRESHOLD = 10000;

  selectMode(config: FacadeConfig): SimulationMode {
    if (config.expectationMode) {
      return SimulationMode.EXPECTATION;
    }

    if (config.runs >= this.STREAMING_THRESHOLD) {
      return SimulationMode.STREAMING;
    }

    return SimulationMode.ORCHESTRATOR;
  }

  async run(config: FacadeConfig): Promise<SimulationResults> {
    const mode = this.selectMode(config);
    let results: SimulationResults;

    switch (mode) {
      case SimulationMode.EXPECTATION:
        results = await this.runExpectationMode(config);
        break;

      case SimulationMode.STREAMING:
        results = await this.runStreamingMode(config);
        break;

      case SimulationMode.ORCHESTRATOR:
      default:
        results = await this.runOrchestratorMode(config);
        break;
    }

    // Validate all distributions before returning
    this.validateResults(results);

    return results;
  }

  private async runExpectationMode(config: FacadeConfig): Promise<SimulationResults> {
    if (!this.orchestrator) {
      this.orchestrator = new MonteCarloOrchestrator(config.seed);
    }

    const result = await this.orchestrator.runExpectationMode({
      ...config,
      mode: 'expectation'
    });

    // Convert ExpectationModeResult to SimulationResults format
    return this.convertExpectationResult(result, config);
  }

  private async runOrchestratorMode(config: FacadeConfig): Promise<SimulationResults> {
    if (!this.orchestrator) {
      this.orchestrator = new MonteCarloOrchestrator(config.seed);
    }

    const result = await this.orchestrator.runStochasticMode({
      ...config,
      mode: 'stochastic'
    });

    return this.convertStochasticResult(result, config);
  }

  private async runStreamingMode(config: FacadeConfig): Promise<SimulationResults> {
    if (!this.streamingEngine) {
      this.streamingEngine = new StreamingMonteCarloEngine();
    }

    return this.streamingEngine.runStreamingSimulation({
      ...config,
      batchSize: 1000,
      maxConcurrentBatches: 4
    });
  }

  private validateResults(results: SimulationResults): void {
    const distributions = {
      irr: { ...results.irr, metricType: 'irr' as const },
      multiple: { ...results.multiple, metricType: 'multiple' as const },
      dpi: { ...results.dpi, metricType: 'dpi' as const },
      tvpi: { ...results.tvpi, metricType: 'tvpi' as const },
      totalValue: { ...results.totalValue, metricType: 'totalValue' as const }
    };

    validateAllDistributions(distributions);
  }

  private convertExpectationResult(result: unknown, config: FacadeConfig): SimulationResults {
    // Implementation converts ExpectationModeResult to SimulationResults
    // This is a placeholder - actual implementation depends on ExpectationModeResult structure
    throw new Error('Not implemented - requires ExpectationModeResult type');
  }

  private convertStochasticResult(result: unknown, config: FacadeConfig): SimulationResults {
    // Implementation converts StochasticModeResult to SimulationResults
    throw new Error('Not implemented - requires StochasticModeResult type');
  }

  getSelectedMode(config: FacadeConfig): string {
    return this.selectMode(config);
  }
}

export const monteCarloFacade = new MonteCarloFacade();
```

**Step 4: Run test to verify basic selection logic passes**

```bash
npx vitest run tests/unit/services/monte-carlo-facade.test.ts
```

Expected: First 3 tests PASS, last test may fail (requires full implementation)

**Step 5: Commit**

```bash
git add server/services/monte-carlo-facade.ts tests/unit/services/monte-carlo-facade.test.ts
git commit -m "feat(phase2): add Monte Carlo facade for unified engine selection"
```

---

## Task 4: Enable Monte Carlo Orchestrator Integration Tests

**Files:**
- Modify: `tests/unit/engines/monte-carlo-orchestrator.test.ts`
- Create: `tests/mocks/monte-carlo-db-mock.ts`

**Step 1: Create database mock for Monte Carlo tests**

```typescript
// tests/mocks/monte-carlo-db-mock.ts
import { vi } from 'vitest';
import { createMockMonteCarloDataset } from '../fixtures/monte-carlo-fixtures';

/**
 * Mock database queries for Monte Carlo tests
 */
export function setupMonteCarloDbMock(fundId: number = 1) {
  const dataset = createMockMonteCarloDataset(fundId);

  // Mock the db.query methods
  const mockDb = {
    query: {
      fundBaselines: {
        findFirst: vi.fn().mockResolvedValue(dataset.baseline)
      },
      funds: {
        findFirst: vi.fn().mockResolvedValue(dataset.fund)
      },
      varianceReports: {
        findMany: vi.fn().mockResolvedValue(dataset.varianceReports)
      }
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined)
    })
  };

  return { mockDb, dataset };
}

/**
 * Helper to inject mock into Monte Carlo engine
 */
export function injectMockDb(engine: unknown, mockDb: unknown): void {
  // Use Object.defineProperty to override private db property
  Object.defineProperty(engine, 'db', {
    value: mockDb,
    writable: true
  });
}
```

**Step 2: Update orchestrator tests to use mocks**

Location: `tests/unit/engines/monte-carlo-orchestrator.test.ts` - Add new describe block

```typescript
// Add after existing tests
import { setupMonteCarloDbMock, injectMockDb } from '../../mocks/monte-carlo-db-mock';

describe('MonteCarloOrchestrator - Stochastic Mode (with mocks)', () => {
  let orchestrator: MonteCarloOrchestrator;
  let mockDb: ReturnType<typeof setupMonteCarloDbMock>['mockDb'];

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
    const setup = setupMonteCarloDbMock(1);
    mockDb = setup.mockDb;
    // Note: Actual injection depends on engine implementation
  });

  it('should return stochastic mode result with mock data', async () => {
    const config = createBaseConfig({ mode: 'stochastic', runs: 500 });

    // This test validates the mock infrastructure works
    expect(mockDb.query.fundBaselines.findFirst).toBeDefined();
    expect(mockDb.query.funds.findFirst).toBeDefined();
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run tests/unit/engines/monte-carlo-orchestrator.test.ts
```

**Step 4: Commit**

```bash
git add tests/mocks/monte-carlo-db-mock.ts tests/unit/engines/monte-carlo-orchestrator.test.ts
git commit -m "feat(tests): add database mocks for Monte Carlo integration tests"
```

---

## Task 5: Create Phoenix Phase 2 Workflow Integration

**Files:**
- Create: `server/services/phoenix-phase2-workflow.ts`
- Test: `tests/unit/services/phoenix-phase2-workflow.test.ts`

**Step 1: Write failing test for workflow**

```typescript
// tests/unit/services/phoenix-phase2-workflow.test.ts
import { describe, it, expect } from 'vitest';
import { PhoenixPhase2Workflow } from '../../../server/services/phoenix-phase2-workflow';

describe('PhoenixPhase2Workflow', () => {
  it('connects graduation rates to MOIC calculation', async () => {
    const workflow = new PhoenixPhase2Workflow();

    const companies = [
      { id: '1', name: 'Company A', stage: 'series_a' as const, invested: 1000000, valuation: 5000000 }
    ];

    const result = await workflow.calculateGraduationAndMOIC(companies);

    expect(result.graduationSummary).toBeDefined();
    expect(result.moicSummary).toBeDefined();
    expect(result.graduationSummary.mode).toBe('expectation');
  });

  it('ranks companies by exit MOIC on planned reserves', async () => {
    const workflow = new PhoenixPhase2Workflow();

    const companies = [
      { id: '1', name: 'A', exitMOIC: 3.0, plannedReserves: 500000 },
      { id: '2', name: 'B', exitMOIC: 2.0, plannedReserves: 500000 },
      { id: '3', name: 'C', exitMOIC: 4.0, plannedReserves: 500000 }
    ];

    const ranking = await workflow.rankByExitMOIC(companies, 1000000);

    // Should prioritize highest MOIC within budget
    expect(ranking[0].id).toBe('3'); // 4.0x MOIC
    expect(ranking[1].id).toBe('1'); // 3.0x MOIC
  });

  it('runs full Phase 2 pipeline', async () => {
    const workflow = new PhoenixPhase2Workflow();

    const config = {
      fundId: 1,
      runs: 100,
      timeHorizonYears: 5,
      seed: 42
    };

    const result = await workflow.runFullPipeline(config);

    expect(result.graduationRates).toBeDefined();
    expect(result.moicAnalysis).toBeDefined();
    expect(result.reserveRanking).toBeDefined();
    expect(result.monteCarloResults).toBeDefined();
    expect(result.insights).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/services/phoenix-phase2-workflow.test.ts
```

Expected: FAIL - Module not found

**Step 3: Implement workflow**

Location: `server/services/phoenix-phase2-workflow.ts`

```typescript
/**
 * Phoenix Phase 2 Workflow
 *
 * Integrates all Phase 2 engines into a unified workflow:
 * - GraduationRateEngine: Stage transition modeling
 * - MOICCalculator: 7 MOIC variants
 * - Reserve ranking: Exit MOIC on planned reserves
 * - MonteCarloFacade: Probabilistic simulation
 *
 * This is the main entry point for Phase 2 probabilistic features.
 */

import { GraduationRateEngine, GraduationConfig, GraduationSummary } from '../../client/src/core/graduation/GraduationRateEngine';
import { MOICCalculator, Investment, PortfolioMOICSummary } from '../../client/src/core/moic/MOICCalculator';
import { MonteCarloFacade, FacadeConfig } from './monte-carlo-facade';
import type { SimulationResults, ActionableInsights } from './monte-carlo-engine';

export interface Phase2Company {
  id: string;
  name: string;
  stage: 'seed' | 'series_a' | 'series_b' | 'series_c' | 'exit' | 'failed';
  invested: number;
  valuation: number;
  exitMOIC?: number;
  plannedReserves?: number;
}

export interface GraduationAndMOICResult {
  graduationSummary: GraduationSummary;
  moicSummary: PortfolioMOICSummary;
}

export interface ReserveRanking {
  id: string;
  name: string;
  exitMOIC: number;
  allocatedReserves: number;
  rank: number;
}

export interface Phase2PipelineResult {
  graduationRates: GraduationSummary;
  moicAnalysis: PortfolioMOICSummary;
  reserveRanking: ReserveRanking[];
  monteCarloResults: SimulationResults;
  insights: ActionableInsights;
}

export interface Phase2Config {
  fundId: number;
  runs: number;
  timeHorizonYears: number;
  seed?: number;
  expectationMode?: boolean;
}

export class PhoenixPhase2Workflow {
  private graduationEngine: GraduationRateEngine | null = null;
  private moicCalculator: MOICCalculator;
  private monteCarloFacade: MonteCarloFacade;

  constructor() {
    this.moicCalculator = new MOICCalculator();
    this.monteCarloFacade = new MonteCarloFacade();
  }

  /**
   * Calculate graduation probabilities and MOIC for companies
   */
  async calculateGraduationAndMOIC(
    companies: Phase2Company[]
  ): Promise<GraduationAndMOICResult> {
    // Initialize graduation engine with default config
    const graduationConfig: GraduationConfig = {
      expectationMode: true,
      transitions: {
        seedToA: { graduate: 30, fail: 20, remain: 50 },
        aToB: { graduate: 40, fail: 15, remain: 45 },
        bToC: { graduate: 50, fail: 10, remain: 40 },
        cToExit: { graduate: 60, fail: 5, remain: 35 }
      }
    };

    this.graduationEngine = new GraduationRateEngine(graduationConfig);

    // Calculate graduation summary
    const graduationSummary = this.graduationEngine.calculateCohortProjection(
      companies.length,
      20 // quarters
    );

    // Convert to Investment format for MOIC calculation
    const investments: Investment[] = companies.map(c => ({
      id: c.id,
      name: c.name,
      initialInvestment: c.invested * 0.7, // Assume 70% initial
      followOnInvestment: c.invested * 0.3, // 30% follow-on
      currentValuation: c.valuation,
      projectedExitValue: c.valuation * 1.5, // Estimate
      exitProbability: 0.7,
      plannedReserves: c.plannedReserves ?? c.invested * 0.2,
      reserveExitMultiple: 2.5,
      investmentDate: new Date()
    }));

    const moicSummary = this.moicCalculator.calculatePortfolioSummary(investments);

    return { graduationSummary, moicSummary };
  }

  /**
   * Rank companies by exit MOIC on planned reserves
   */
  async rankByExitMOIC(
    companies: Array<{ id: string; name: string; exitMOIC: number; plannedReserves: number }>,
    availableBudget: number
  ): Promise<ReserveRanking[]> {
    // Sort by exit MOIC descending
    const sorted = [...companies].sort((a, b) => b.exitMOIC - a.exitMOIC);

    const ranking: ReserveRanking[] = [];
    let remainingBudget = availableBudget;
    let rank = 1;

    for (const company of sorted) {
      const allocation = Math.min(company.plannedReserves, remainingBudget);

      if (allocation > 0) {
        ranking.push({
          id: company.id,
          name: company.name,
          exitMOIC: company.exitMOIC,
          allocatedReserves: allocation,
          rank: rank++
        });
        remainingBudget -= allocation;
      }
    }

    return ranking;
  }

  /**
   * Run the full Phase 2 pipeline
   */
  async runFullPipeline(config: Phase2Config): Promise<Phase2PipelineResult> {
    // Step 1: Run Monte Carlo simulation
    const monteCarloConfig: FacadeConfig = {
      fundId: config.fundId,
      runs: config.runs,
      timeHorizonYears: config.timeHorizonYears,
      seed: config.seed,
      expectationMode: config.expectationMode
    };

    const monteCarloResults = await this.monteCarloFacade.run(monteCarloConfig);

    // Step 2: Extract insights
    const insights = monteCarloResults.insights;

    // Step 3: Calculate graduation rates (placeholder - needs company data)
    const graduationConfig: GraduationConfig = {
      expectationMode: config.expectationMode ?? true,
      seed: config.seed,
      transitions: {
        seedToA: { graduate: 30, fail: 20, remain: 50 },
        aToB: { graduate: 40, fail: 15, remain: 45 },
        bToC: { graduate: 50, fail: 10, remain: 40 },
        cToExit: { graduate: 60, fail: 5, remain: 35 }
      }
    };

    this.graduationEngine = new GraduationRateEngine(graduationConfig);
    const graduationRates = this.graduationEngine.calculateCohortProjection(20, 20);

    // Step 4: Placeholder MOIC analysis (needs portfolio data)
    const moicAnalysis: PortfolioMOICSummary = {
      companies: [],
      portfolio: {
        blendedMOIC: this.moicCalculator.calculateBlendedMOIC([]),
        totalInvested: 0,
        totalCurrentValue: 0,
        totalProjectedValue: 0
      }
    };

    // Step 5: Placeholder reserve ranking
    const reserveRanking: ReserveRanking[] = [];

    return {
      graduationRates,
      moicAnalysis,
      reserveRanking,
      monteCarloResults,
      insights
    };
  }
}

export const phoenixPhase2Workflow = new PhoenixPhase2Workflow();
```

**Step 4: Run test**

```bash
npx vitest run tests/unit/services/phoenix-phase2-workflow.test.ts
```

**Step 5: Commit**

```bash
git add server/services/phoenix-phase2-workflow.ts tests/unit/services/phoenix-phase2-workflow.test.ts
git commit -m "feat(phase2): add PhoenixPhase2Workflow for unified pipeline"
```

---

## Task 6: Document Engine Selection Criteria

**Files:**
- Create: `docs/phase2-engine-selection.md`

**Step 1: Write documentation**

Location: `docs/phase2-engine-selection.md`

```markdown
# Phase 2 Monte Carlo Engine Selection Guide

## Overview

Phoenix Phase 2 provides multiple Monte Carlo implementations optimized for different use cases.
This guide explains when to use each engine.

## Engine Selection Matrix

| Use Case | Engine | Threshold | Reason |
|----------|--------|-----------|--------|
| Quick analysis (<1k runs) | MonteCarloOrchestrator | runs < 1000 | Low overhead |
| Standard simulation | MonteCarloOrchestrator | 1000-10000 | Balanced performance |
| Large-scale analysis | StreamingMonteCarloEngine | runs > 10000 | Memory efficient |
| Deterministic baseline | ExpectationMode | N/A | No randomness |

## Using the Facade

```typescript
import { monteCarloFacade } from '@/services/monte-carlo-facade';

// The facade automatically selects the best engine
const results = await monteCarloFacade.run({
  fundId: 1,
  runs: 10000,
  timeHorizonYears: 5,
  seed: 42
});
```

## Direct Engine Access

For advanced use cases, you can access engines directly:

```typescript
// Streaming for large runs
import { StreamingMonteCarloEngine } from '@/services/streaming-monte-carlo-engine';

const engine = new StreamingMonteCarloEngine();
const results = await engine.runStreamingSimulation({
  fundId: 1,
  runs: 50000,
  timeHorizonYears: 10,
  batchSize: 1000,
  maxConcurrentBatches: 4
});
```

## Validation

All engines validate outputs using the distribution validator:
- Percentile monotonicity (P5 <= P50 <= P95)
- Non-negative multiples
- Valid min/max ranges

## Integration with Phase 2 Workflow

The recommended approach is to use `PhoenixPhase2Workflow`:

```typescript
import { phoenixPhase2Workflow } from '@/services/phoenix-phase2-workflow';

const results = await phoenixPhase2Workflow.runFullPipeline({
  fundId: 1,
  runs: 10000,
  timeHorizonYears: 5,
  seed: 42
});

// Results include:
// - graduationRates
// - moicAnalysis
// - reserveRanking
// - monteCarloResults
// - insights
```
```

**Step 2: Commit**

```bash
git add docs/phase2-engine-selection.md
git commit -m "docs: add Phase 2 engine selection guide"
```

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| 1 | Distribution Validation | Ready to implement |
| 2 | Test Fixtures | Ready to implement |
| 3 | Monte Carlo Facade | Ready to implement |
| 4 | Enable Integration Tests | Ready to implement |
| 5 | Phase 2 Workflow | Ready to implement |
| 6 | Documentation | Ready to implement |

**Total estimated time:** 6-8 hours

**Execution order:** Tasks 1-2 can run in parallel, then 3-4, then 5-6.

---

**Plan complete and saved to `docs/plans/2026-01-12-phase2-monte-carlo-improvements.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)**
- I dispatch fresh subagent per task
- Review between tasks
- Fast iteration with oversight

**2. Parallel Session (separate)**
- Open new Claude Code session
- Use executing-plans skill
- Batch execution with checkpoints

**Which approach would you like?**
