/**
 * Excel Parity Testing Suite
 *
 * Validates deterministic calculations against Excel reference results.
 * Tests TVPI, IRR, NAV, and DPI calculations with 1% tolerance.
 *
 * Test Coverage:
 * - Baseline scenario: Standard VC fund with balanced portfolio
 * - Aggressive scenario: High-growth, early-stage focus
 * - Conservative scenario: Late-stage focus, lower risk
 *
 * Tolerance Requirements:
 * - TVPI/DPI: 1% absolute OR 1% relative
 * - IRR: 0.5% absolute OR 0.5% relative
 * - NAV: $1M absolute OR 1% relative
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runFundModel } from '@/lib/fund-calc';
import { exportToCSV, parseCSV, importExcelReference } from '@/lib/export';
import {
  compareWithTolerance,
  generateDiffReport,
  visualDiff,
  type ComparisonResult,
} from '@/tests/utils/compare';
import type { FundModelInputs } from '@shared/schemas/fund-model';

// =============================================================================
// FIXTURE LOADING
// =============================================================================

interface TestScenario {
  name: string;
  inputs: FundModelInputs;
  expectedResults: Array<{
    periodIndex: number;
    tvpi: number;
    dpi: number;
    irr: number;
    nav: number;
    contributions: number;
    distributions: number;
    managementFees: number;
  }>;
  metadata: {
    tolerances: {
      tvpi: { absolute: number; relative: number };
      dpi: { absolute: number; relative: number };
      irr: { absolute: number; relative: number };
      nav: { absolute: number; relative: number };
    };
    expectedOutcomes: {
      finalTVPI: number;
      finalDPI: number;
      finalIRR: number;
      finalNAV: number;
    };
  };
}

/**
 * Load test scenario from fixtures
 */
function loadScenario(scenarioName: string): TestScenario {
  const fixturesPath = join(__dirname, 'fixtures', 'excel-parity', scenarioName);

  // Load inputs
  const inputsPath = join(fixturesPath, 'inputs.json');
  const inputsJson = readFileSync(inputsPath, 'utf-8');
  const inputs = JSON.parse(inputsJson) as FundModelInputs;

  // Load expected results
  const expectedPath = join(fixturesPath, 'expected.csv');
  const expectedCsv = readFileSync(expectedPath, 'utf-8');
  const expectedResults = parseCSV<{
    periodIndex: number;
    tvpi: number;
    dpi: number;
    irr: number;
    nav: number;
    contributions: number;
    distributions: number;
    managementFees: number;
  }>(expectedCsv);

  // Load metadata
  const metadataPath = join(fixturesPath, 'metadata.json');
  const metadataJson = readFileSync(metadataPath, 'utf-8');
  const metadata = JSON.parse(metadataJson);

  return {
    name: scenarioName,
    inputs,
    expectedResults,
    metadata,
  };
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Compare actual results against Excel reference
 */
function compareAgainstExcel(
  actual: Array<{
    periodIndex: number;
    tvpi: number;
    dpi: number;
    irrAnnualized: number;
    nav: number;
    contributions: number;
    distributions: number;
    managementFees: number;
  }>,
  expected: Array<{
    periodIndex: number;
    tvpi: number;
    dpi: number;
    irr: number;
    nav: number;
    contributions: number;
    distributions: number;
    managementFees: number;
  }>,
  tolerances: TestScenario['metadata']['tolerances']
): {
  tvpi: ComparisonResult[];
  dpi: ComparisonResult[];
  irr: ComparisonResult[];
  nav: ComparisonResult[];
} {
  const results = {
    tvpi: [] as ComparisonResult[],
    dpi: [] as ComparisonResult[],
    irr: [] as ComparisonResult[],
    nav: [] as ComparisonResult[],
  };

  // Only compare checkpoints that exist in expected data
  expected.forEach(expectedPeriod => {
    const actualPeriod = actual.find(a => a.periodIndex === expectedPeriod.periodIndex);

    if (!actualPeriod) {
      // Missing period in actual data
      results.tvpi.push({
        matches: false,
        metric: `TVPI[${expectedPeriod.periodIndex}]`,
        actual: NaN,
        expected: expectedPeriod.tvpi,
        absoluteDiff: NaN,
        relativeDiff: NaN,
        withinTolerance: false,
      });
      return;
    }

    // Compare TVPI
    results.tvpi.push(
      compareWithTolerance(
        actualPeriod.tvpi,
        expectedPeriod.tvpi,
        `TVPI[${expectedPeriod.periodIndex}]`,
        {
          absoluteTolerance: tolerances.tvpi.absolute,
          relativeTolerance: tolerances.tvpi.relative,
        }
      )
    );

    // Compare DPI
    results.dpi.push(
      compareWithTolerance(
        actualPeriod.dpi,
        expectedPeriod.dpi,
        `DPI[${expectedPeriod.periodIndex}]`,
        {
          absoluteTolerance: tolerances.dpi.absolute,
          relativeTolerance: tolerances.dpi.relative,
        }
      )
    );

    // Compare IRR
    results.irr.push(
      compareWithTolerance(
        actualPeriod.irrAnnualized,
        expectedPeriod.irr,
        `IRR[${expectedPeriod.periodIndex}]`,
        {
          absoluteTolerance: tolerances.irr.absolute,
          relativeTolerance: tolerances.irr.relative,
        }
      )
    );

    // Compare NAV
    results.nav.push(
      compareWithTolerance(
        actualPeriod.nav,
        expectedPeriod.nav,
        `NAV[${expectedPeriod.periodIndex}]`,
        {
          absoluteTolerance: tolerances.nav.absolute,
          relativeTolerance: tolerances.nav.relative,
        }
      )
    );
  });

  return results;
}

// =============================================================================
// BASELINE SCENARIO TESTS
// =============================================================================

describe('Excel Parity - Baseline Scenario', () => {
  let scenario: TestScenario;
  let actualResults: ReturnType<typeof runFundModel>;

  beforeAll(() => {
    scenario = loadScenario('baseline');

    // Stub: Run fund model calculation
    // In Stream B, this will use actual calculation engines
    actualResults = runFundModel(scenario.inputs);
  });

  it('should load baseline scenario fixtures', () => {
    expect(scenario.name).toBe('baseline');
    expect(scenario.inputs.fundSize).toBe(100000000);
    expect(scenario.expectedResults.length).toBeGreaterThan(0);
  });

  it('should calculate TVPI within 1% tolerance', () => {
    const comparison = compareAgainstExcel(
      actualResults.periodResults,
      scenario.expectedResults,
      scenario.metadata.tolerances
    );

    const report = generateDiffReport(comparison.tvpi, { title: 'TVPI Comparison' });

    if (report.failed > 0) {
      console.log(visualDiff(comparison.tvpi));
    }

    expect(report.failed).toBe(0);
    expect(report.passed).toBe(comparison.tvpi.length);
  });

  it('should calculate DPI within 1% tolerance', () => {
    const comparison = compareAgainstExcel(
      actualResults.periodResults,
      scenario.expectedResults,
      scenario.metadata.tolerances
    );

    const report = generateDiffReport(comparison.dpi, { title: 'DPI Comparison' });

    if (report.failed > 0) {
      console.log(visualDiff(comparison.dpi));
    }

    expect(report.failed).toBe(0);
  });

  it('should calculate IRR within 0.5% tolerance', () => {
    const comparison = compareAgainstExcel(
      actualResults.periodResults,
      scenario.expectedResults,
      scenario.metadata.tolerances
    );

    const report = generateDiffReport(comparison.irr, { title: 'IRR Comparison' });

    if (report.failed > 0) {
      console.log(visualDiff(comparison.irr));
    }

    expect(report.failed).toBe(0);
  });

  it('should calculate NAV within tolerance', () => {
    const comparison = compareAgainstExcel(
      actualResults.periodResults,
      scenario.expectedResults,
      scenario.metadata.tolerances
    );

    const report = generateDiffReport(comparison.nav, { title: 'NAV Comparison' });

    if (report.failed > 0) {
      console.log(visualDiff(comparison.nav));
    }

    expect(report.failed).toBe(0);
  });

  it('should match final outcomes', () => {
    const finalPeriod = actualResults.periodResults[actualResults.periodResults.length - 1];
    expect(finalPeriod).toBeDefined();

    const { expectedOutcomes } = scenario.metadata;

    // Final TVPI
    const tvpiMatch = compareWithTolerance(
      finalPeriod!.tvpi,
      expectedOutcomes.finalTVPI,
      'Final TVPI',
      scenario.metadata.tolerances.tvpi
    );
    expect(tvpiMatch.matches).toBe(true);

    // Final DPI
    const dpiMatch = compareWithTolerance(
      finalPeriod!.dpi,
      expectedOutcomes.finalDPI,
      'Final DPI',
      scenario.metadata.tolerances.dpi
    );
    expect(dpiMatch.matches).toBe(true);

    // Final IRR
    const irrMatch = compareWithTolerance(
      actualResults.kpis.irrAnnualized,
      expectedOutcomes.finalIRR,
      'Final IRR',
      scenario.metadata.tolerances.irr
    );
    expect(irrMatch.matches).toBe(true);
  });

  it('should export results to CSV format', () => {
    const csv = exportToCSV(actualResults.periodResults, undefined, {
      includeMetadata: true,
      scenarioName: 'Baseline',
      precision: 6,
    });

    expect(csv).toContain('periodIndex');
    expect(csv).toContain('tvpi');
    expect(csv).toContain('dpi');
    expect(csv).toContain('irrAnnualized');

    // Should have trailing newline
    expect(csv.endsWith('\n')).toBe(true);

    // Should have at least one data row
    const lines = csv.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    expect(lines.length).toBeGreaterThan(1); // Header + at least 1 data row
  });
});

// =============================================================================
// AGGRESSIVE SCENARIO TESTS
// =============================================================================

describe('Excel Parity - Aggressive Scenario', () => {
  let scenario: TestScenario;
  let actualResults: ReturnType<typeof runFundModel>;

  beforeAll(() => {
    scenario = loadScenario('aggressive');
    actualResults = runFundModel(scenario.inputs);
  });

  it('should load aggressive scenario fixtures', () => {
    expect(scenario.name).toBe('aggressive');
    expect(scenario.inputs.fundSize).toBe(100000000);
    expect(scenario.metadata.expectedOutcomes.finalTVPI).toBeGreaterThan(3.0);
  });

  it('should calculate metrics within tolerance for high-growth scenario', () => {
    const comparison = compareAgainstExcel(
      actualResults.periodResults,
      scenario.expectedResults,
      scenario.metadata.tolerances
    );

    const allResults = [
      ...comparison.tvpi,
      ...comparison.dpi,
      ...comparison.irr,
      ...comparison.nav,
    ];

    const report = generateDiffReport(allResults, { title: 'Aggressive Scenario' });

    if (report.failed > 0) {
      console.log(report.summary);
    }

    expect(report.failed).toBe(0);
  });

  it('should achieve higher TVPI than baseline', () => {
    const finalPeriod = actualResults.periodResults[actualResults.periodResults.length - 1];
    expect(finalPeriod!.tvpi).toBeGreaterThan(3.0); // Aggressive should exceed 3x
  });
});

// =============================================================================
// CONSERVATIVE SCENARIO TESTS
// =============================================================================

describe('Excel Parity - Conservative Scenario', () => {
  let scenario: TestScenario;
  let actualResults: ReturnType<typeof runFundModel>;

  beforeAll(() => {
    scenario = loadScenario('conservative');
    actualResults = runFundModel(scenario.inputs);
  });

  it('should load conservative scenario fixtures', () => {
    expect(scenario.name).toBe('conservative');
    expect(scenario.inputs.fundSize).toBe(100000000);
    expect(scenario.metadata.expectedOutcomes.finalTVPI).toBeLessThan(2.5);
  });

  it('should calculate metrics within tolerance for low-risk scenario', () => {
    const comparison = compareAgainstExcel(
      actualResults.periodResults,
      scenario.expectedResults,
      scenario.metadata.tolerances
    );

    const allResults = [
      ...comparison.tvpi,
      ...comparison.dpi,
      ...comparison.irr,
      ...comparison.nav,
    ];

    const report = generateDiffReport(allResults, { title: 'Conservative Scenario' });

    if (report.failed > 0) {
      console.log(report.summary);
    }

    expect(report.failed).toBe(0);
  });

  it('should have lower IRR than aggressive scenario', () => {
    expect(actualResults.kpis.irrAnnualized).toBeLessThan(0.20); // Conservative should be < 20%
  });
});

// =============================================================================
// CROSS-SCENARIO VALIDATION
// =============================================================================

describe('Excel Parity - Cross-Scenario Validation', () => {
  it('should maintain deterministic results across runs', () => {
    const scenario = loadScenario('baseline');

    // Run twice with same inputs
    const run1 = runFundModel(scenario.inputs);
    const run2 = runFundModel(scenario.inputs);

    // Results should be identical (deterministic)
    expect(run1.kpis.tvpi).toBe(run2.kpis.tvpi);
    expect(run1.kpis.dpi).toBe(run2.kpis.dpi);
    expect(run1.kpis.irrAnnualized).toBe(run2.kpis.irrAnnualized);
  });

  it('should validate scenario ordering: Conservative < Baseline < Aggressive', () => {
    const conservative = runFundModel(loadScenario('conservative').inputs);
    const baseline = runFundModel(loadScenario('baseline').inputs);
    const aggressive = runFundModel(loadScenario('aggressive').inputs);

    // TVPI ordering
    expect(conservative.kpis.tvpi).toBeLessThan(baseline.kpis.tvpi);
    expect(baseline.kpis.tvpi).toBeLessThan(aggressive.kpis.tvpi);

    // IRR ordering
    expect(conservative.kpis.irrAnnualized).toBeLessThan(baseline.kpis.irrAnnualized);
    expect(baseline.kpis.irrAnnualized).toBeLessThan(aggressive.kpis.irrAnnualized);
  });

  it('should export all scenarios to CSV for manual inspection', () => {
    const scenarios = ['baseline', 'aggressive', 'conservative'];

    scenarios.forEach(scenarioName => {
      const scenario = loadScenario(scenarioName);
      const results = runFundModel(scenario.inputs);

      const csv = exportToCSV(results.periodResults, `${scenarioName}-actual.csv`, {
        includeMetadata: true,
        scenarioName: scenario.name,
        precision: 6,
      });

      expect(csv).toBeDefined();
      expect(csv.length).toBeGreaterThan(0);

      // Optional: Write to disk for manual verification
      // fs.writeFileSync(`./debug/${scenarioName}-actual.csv`, csv);
    });
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe('Excel Parity - Error Handling', () => {
  it('should handle missing periods gracefully', () => {
    const scenario = loadScenario('baseline');
    const results = runFundModel(scenario.inputs);

    // Remove some periods to simulate missing data
    const incompletResults = results.periodResults.filter(p => p.periodIndex % 2 === 0);

    const comparison = compareAgainstExcel(
      incompletResults,
      scenario.expectedResults,
      scenario.metadata.tolerances
    );

    // Should still compare available periods
    expect(comparison.tvpi.length).toBe(scenario.expectedResults.length);

    // Some comparisons will fail due to NaN
    const report = generateDiffReport(comparison.tvpi);
    expect(report.failed).toBeGreaterThan(0);
  });

  it('should detect NaN values in calculations', () => {
    const nanResult = compareWithTolerance(
      NaN,
      2.5,
      'Invalid TVPI',
      { absoluteTolerance: 0.01, relativeTolerance: 0.01 }
    );

    expect(nanResult.matches).toBe(false);
    expect(isNaN(nanResult.actual)).toBe(true);
    expect(isNaN(nanResult.absoluteDiff)).toBe(true);
  });

  it('should handle Infinity values in calculations', () => {
    const infResult = compareWithTolerance(
      Infinity,
      2.5,
      'Invalid DPI',
      { absoluteTolerance: 0.01, relativeTolerance: 0.01 }
    );

    expect(infResult.matches).toBe(false);
    expect(infResult.actual).toBe(Infinity);
  });
});
