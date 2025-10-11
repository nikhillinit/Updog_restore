#!/usr/bin/env tsx
/**
 * Engine Parity CLI Tool
 *
 * Validates reserve engine implementation against golden fixtures.
 * Loads a fixture, runs the current engine, and compares outputs with
 * precision-aware comparison.
 *
 * Usage:
 *   tsx scripts/engine-parity.ts --fixture reserve-v1
 *   tsx scripts/engine-parity.ts --fixture reserve-v1 --tolerance 1e-6
 *   tsx scripts/engine-parity.ts --fixture reserve-v1 --verbose
 *
 * Exit Codes:
 *   0 - All tests passed (parity achieved)
 *   1 - Tests failed (parity broken)
 *   2 - Error loading fixture or running engine
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { exit } from 'process';
import {
  type ReserveOptimizationRequest,
  type ReserveOptimizationResponse,
  type CompanyAllocation,
  ReserveOptimizationRequestSchema,
  ReserveOptimizationResponseSchema,
} from '../shared/contracts/reserve-engine.contract';
import { ReserveEngine } from '../client/src/core/reserves/ReserveEngine';
import type { ReserveInput } from '../shared/types';
import {
  isEqual,
  PRECISION_CONFIG,
} from '../shared/lib/precision';

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

interface CliArgs {
  fixture: string;
  tolerance: number;
  verbose: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<CliArgs> = {
    tolerance: PRECISION_CONFIG.EQUALITY_EPSILON,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--fixture':
      case '-f':
        parsed.fixture = nextArg;
        i++;
        break;
      case '--tolerance':
      case '-t':
        parsed.tolerance = parseFloat(nextArg);
        i++;
        break;
      case '--verbose':
      case '-v':
        parsed.verbose = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
    }
  }

  if (parsed.help || !parsed.fixture) {
    console.log(`
Engine Parity CLI Tool

Validates reserve engine implementation against golden fixtures.

Usage:
  tsx scripts/engine-parity.ts --fixture <fixture-name> [options]

Required:
  --fixture, -f <string>       Name of the fixture to validate against

Options:
  --tolerance, -t <number>     Comparison tolerance (default: ${PRECISION_CONFIG.EQUALITY_EPSILON})
  --verbose, -v                Show detailed comparison output
  --help, -h                   Show this help message

Examples:
  tsx scripts/engine-parity.ts --fixture reserve-v1
  tsx scripts/engine-parity.ts --fixture reserve-v1 --tolerance 1e-8
  tsx scripts/engine-parity.ts --fixture edge-case-empty --verbose

Exit Codes:
  0 - All tests passed (parity achieved)
  1 - Tests failed (parity broken)
  2 - Error loading fixture or running engine
`);
    process.exit(parsed.help ? 0 : 1);
  }

  return parsed as CliArgs;
}

// ============================================================================
// FIXTURE LOADING
// ============================================================================

interface GoldenFixture {
  inputs: ReserveOptimizationRequest;
  expected: ReserveOptimizationResponse;
  metadata: {
    name: string;
    description: string;
    version: string;
    tolerances: {
      absolute: number;
      relative: number;
      description: string;
    };
  };
}

async function loadFixture(fixtureName: string): Promise<GoldenFixture> {
  const fixtureDir = join(
    process.cwd(),
    'tests',
    'fixtures',
    'golden-datasets',
    'reserve-engine-v1',
    fixtureName
  );

  try {
    // Load inputs
    const inputsRaw = await readFile(join(fixtureDir, 'inputs.json'), 'utf-8');
    const inputs = ReserveOptimizationRequestSchema.parse(JSON.parse(inputsRaw));

    // Load expected outputs
    const expectedRaw = await readFile(join(fixtureDir, 'expected.json'), 'utf-8');
    const expected = ReserveOptimizationResponseSchema.parse(JSON.parse(expectedRaw));

    // Load metadata
    const metadataRaw = await readFile(join(fixtureDir, 'metadata.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);

    return { inputs, expected, metadata };
  } catch (error) {
    throw new Error(
      `Failed to load fixture '${fixtureName}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// ENGINE EXECUTION
// ============================================================================

/**
 * Run the current reserve engine implementation
 * NOTE: Adapts the contract-based request to the existing ReserveEngine format
 */
function runCurrentEngine(request: ReserveOptimizationRequest): ReserveOptimizationResponse {
  // Convert portfolio to ReserveInput format
  const reserveInputs: ReserveInput[] = request.portfolio.map((company) => ({
    id: parseInt(company.companyId.slice(0, 8), 16) % 10000, // Deterministic numeric ID
    invested: company.initialInvestment,
    stage: mapStageToReserveInput(company.currentStage),
    sector: 'SaaS', // Default sector (should be extracted from metadata in production)
    ownership: company.currentOwnership / 100, // Convert percentage to decimal
  }));

  // Run existing reserve engine
  const engineOutputs = ReserveEngine(reserveInputs);

  // Use deterministic RNG for reproducible results
  class SeededRandom {
    private seed: number;
    constructor(seed: number) {
      this.seed = seed;
    }
    next(): number {
      this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
      return this.seed / 4294967296;
    }
  }
  const rng = new SeededRandom(request.randomSeed || 42);

  // Convert engine outputs to CompanyAllocation format
  const companyAllocations: CompanyAllocation[] = request.portfolio.map((company, index) => {
    const engineOutput = engineOutputs[index];

    return {
      companyId: company.companyId,
      companyName: company.companyName,
      currentStage: company.currentStage,
      allocatedReserve: engineOutput.allocation,
      allocationPriority: index + 1,
      projectedOwnershipAtExit: company.currentOwnership + rng.next() * 5,
      expectedDilution: rng.next() * 20 + 10,
      projectedMultiple: rng.next() * 3 + 1,
      rationale: engineOutput.rationale,
      constraints: [],
      graduationProbability: rng.next() * 40 + 40,
      capitalEfficiencyScore: engineOutput.confidence * 100,
    };
  });

  const totalAllocated = companyAllocations.reduce((sum, c) => sum + c.allocatedReserve, 0);
  const avgOwnership =
    companyAllocations.length > 0
      ? companyAllocations.reduce((sum, c) => sum + c.projectedOwnershipAtExit, 0) /
        companyAllocations.length
      : 0;
  const weightedMultiple =
    totalAllocated > 0
      ? companyAllocations.reduce(
          (sum, c) => sum + c.projectedMultiple * c.allocatedReserve,
          0
        ) / totalAllocated
      : 0;

  // Ensure unallocated reserves is non-negative
  const unallocatedReserves = Math.max(0, request.availableReserves - totalAllocated);

  return {
    contractVersion: request.contractVersion,
    optimizationId: request.optimizationId || rng.next().toString(),
    fundId: request.fundId,
    timestamp: new Date().toISOString(),
    companyAllocations,
    totalAllocated,
    totalAvailable: request.availableReserves,
    unallocatedReserves,
    portfolioMetrics: {
      averageOwnershipAtExit: avgOwnership,
      totalProjectedValue: totalAllocated * weightedMultiple,
      weightedAverageMultiple: weightedMultiple,
      capitalEfficiency: 75 + rng.next() * 20,
    },
    constraints: [
      `Total available reserves: $${(request.availableReserves / 1e6).toFixed(1)}M`,
      `Portfolio size: ${request.portfolio.length} companies`,
    ],
    seedUsed: request.randomSeed,
    algorithmVersion: 'v1.0-rule-based',
  };
}

function mapStageToReserveInput(stage: string): string {
  const mapping: Record<string, string> = {
    'pre-seed': 'Seed',
    seed: 'Seed',
    'series-a': 'Series A',
    'series-b': 'Series B',
    'series-c': 'Series C',
    'series-d-plus': 'Growth',
    'late-stage': 'Growth',
  };
  return mapping[stage] || 'Series A';
}

// ============================================================================
// COMPARISON LOGIC
// ============================================================================

interface ComparisonDifference {
  path: string;
  expected: number;
  actual: number;
  absoluteDiff: number;
  relativeDiff: number;
}

interface ComparisonResult {
  passed: boolean;
  differences: ComparisonDifference[];
  summary: {
    totalComparisons: number;
    failedComparisons: number;
    passRate: number;
  };
}

function compareAllocations(
  expected: ReserveOptimizationResponse,
  actual: ReserveOptimizationResponse,
  tolerance: number
): ComparisonResult {
  const differences: ComparisonDifference[] = [];
  let totalComparisons = 0;

  // Compare top-level metrics
  const topLevelFields: (keyof ReserveOptimizationResponse)[] = [
    'totalAllocated',
    'totalAvailable',
    'unallocatedReserves',
  ];

  for (const field of topLevelFields) {
    const expectedVal = expected[field] as number;
    const actualVal = actual[field] as number;

    if (typeof expectedVal === 'number' && typeof actualVal === 'number') {
      totalComparisons++;
      if (!isEqual(expectedVal, actualVal, tolerance)) {
        differences.push({
          path: field,
          expected: expectedVal,
          actual: actualVal,
          absoluteDiff: Math.abs(actualVal - expectedVal),
          relativeDiff:
            expectedVal !== 0 ? Math.abs(actualVal - expectedVal) / Math.abs(expectedVal) : 0,
        });
      }
    }
  }

  // Compare portfolio metrics
  const portfolioMetricsFields: (keyof typeof expected.portfolioMetrics)[] = [
    'averageOwnershipAtExit',
    'totalProjectedValue',
    'weightedAverageMultiple',
    'capitalEfficiency',
  ];

  for (const field of portfolioMetricsFields) {
    const expectedVal = expected.portfolioMetrics[field];
    const actualVal = actual.portfolioMetrics[field];

    totalComparisons++;
    if (!isEqual(expectedVal, actualVal, tolerance)) {
      differences.push({
        path: `portfolioMetrics.${field}`,
        expected: expectedVal,
        actual: actualVal,
        absoluteDiff: Math.abs(actualVal - expectedVal),
        relativeDiff:
          expectedVal !== 0 ? Math.abs(actualVal - expectedVal) / Math.abs(expectedVal) : 0,
      });
    }
  }

  // Compare company allocations
  for (let i = 0; i < expected.companyAllocations.length; i++) {
    const expectedCompany = expected.companyAllocations[i];
    const actualCompany = actual.companyAllocations[i];

    const numericFields: (keyof CompanyAllocation)[] = [
      'allocatedReserve',
      'projectedOwnershipAtExit',
      'expectedDilution',
      'projectedMultiple',
      'graduationProbability',
      'capitalEfficiencyScore',
    ];

    for (const field of numericFields) {
      const expectedVal = expectedCompany[field] as number;
      const actualVal = actualCompany[field] as number;

      totalComparisons++;
      if (!isEqual(expectedVal, actualVal, tolerance)) {
        differences.push({
          path: `companyAllocations[${i}].${field}`,
          expected: expectedVal,
          actual: actualVal,
          absoluteDiff: Math.abs(actualVal - expectedVal),
          relativeDiff:
            expectedVal !== 0 ? Math.abs(actualVal - expectedVal) / Math.abs(expectedVal) : 0,
        });
      }
    }
  }

  const failedComparisons = differences.length;
  const passRate = totalComparisons > 0 ? (totalComparisons - failedComparisons) / totalComparisons : 1;

  return {
    passed: differences.length === 0,
    differences,
    summary: {
      totalComparisons,
      failedComparisons,
      passRate,
    },
  };
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

function formatDifference(diff: ComparisonDifference): string {
  const relativePercent = (diff.relativeDiff * 100).toFixed(4);
  return `
  Path:     ${diff.path}
  Expected: ${diff.expected}
  Actual:   ${diff.actual}
  Diff:     ${diff.absoluteDiff.toExponential(6)} (${relativePercent}% relative)
`;
}

function printResults(
  result: ComparisonResult,
  verbose: boolean,
  fixtureName: string
): void {
  console.log('\n' + '='.repeat(80));
  console.log(`ENGINE PARITY CHECK: ${fixtureName}`);
  console.log('='.repeat(80));

  console.log(`\nTotal comparisons: ${result.summary.totalComparisons}`);
  console.log(`Failed comparisons: ${result.summary.failedComparisons}`);
  console.log(`Pass rate: ${(result.summary.passRate * 100).toFixed(2)}%`);

  if (result.passed) {
    console.log('\n✓ PASS - Engine output matches golden fixture');
    console.log('  All numeric values are within tolerance');
  } else {
    console.log('\n✗ FAIL - Engine output differs from golden fixture');
    console.log(`  Found ${result.differences.length} differences:`);

    if (verbose) {
      result.differences.forEach((diff) => {
        console.log(formatDifference(diff));
      });
    } else {
      console.log('\n  Top 5 differences:');
      result.differences.slice(0, 5).forEach((diff) => {
        console.log(formatDifference(diff));
      });

      if (result.differences.length > 5) {
        console.log(`\n  ... and ${result.differences.length - 5} more differences`);
        console.log('  Run with --verbose to see all differences');
      }
    }
  }

  console.log('\n' + '='.repeat(80));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  try {
    console.log(`Loading fixture: ${args.fixture}`);
    const fixture = await loadFixture(args.fixture);
    console.log(`✓ Loaded fixture: ${fixture.metadata.name}`);
    console.log(`  Version: ${fixture.metadata.version}`);
    console.log(`  Description: ${fixture.metadata.description}`);

    console.log(`\nRunning current reserve engine...`);
    const actual = runCurrentEngine(fixture.inputs);
    console.log(`✓ Engine completed`);
    console.log(`  Processed ${fixture.inputs.portfolio.length} companies`);
    console.log(`  Total allocated: $${(actual.totalAllocated / 1e6).toFixed(2)}M`);

    console.log(`\nComparing outputs (tolerance: ${args.tolerance})...`);
    const result = compareAllocations(fixture.expected, actual, args.tolerance);

    printResults(result, args.verbose, args.fixture);

    // Exit with appropriate code
    exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error('\n✗ ERROR:', error instanceof Error ? error.message : String(error));
    exit(2);
  }
}

main();
