#!/usr/bin/env tsx
/**
 * Golden Reserve Fixture Generator
 *
 * Generates comprehensive, deterministic test fixtures for the Reserve Engine.
 * Creates three files per fixture:
 *   - inputs.json: All engine inputs (portfolio, strategies, constraints)
 *   - expected.json: Expected allocation outputs
 *   - metadata.json: Test metadata, tolerances, assumptions
 *
 * Usage:
 *   tsx scripts/generate-golden-reserve-fixture.ts --name reserve-v1 --portfolio-size 10
 *   tsx scripts/generate-golden-reserve-fixture.ts --name edge-case-empty --portfolio-size 0
 *   tsx scripts/generate-golden-reserve-fixture.ts --name strategic-companies --seed 12345
 *
 * Features:
 *   - Deterministic generation with fixed random seeds
 *   - Contract-compliant inputs and outputs
 *   - Comprehensive edge case coverage
 *   - Zod validation for type safety
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  type ReserveOptimizationRequest,
  type ReserveOptimizationResponse,
  type CompanyInput,
  type CompanyAllocation,
  type GraduationMatrix,
  type StageStrategy,
  type CompanyStage,
  CompanyStageSchema,
  ReserveOptimizationRequestSchema,
  ReserveOptimizationResponseSchema,
  CONTRACT_VERSION,
} from '../shared/contracts/reserve-engine.contract';
import { ReserveEngine } from '../client/src/core/reserves/ReserveEngine';
import type { ReserveInput } from '../shared/types';

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

interface CliArgs {
  name: string;
  portfolioSize: number;
  seed: number;
  includeEdgeCases: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<CliArgs> = {
    portfolioSize: 10,
    seed: 42,
    includeEdgeCases: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--name':
        parsed.name = nextArg;
        i++;
        break;
      case '--portfolio-size':
        parsed.portfolioSize = parseInt(nextArg, 10);
        i++;
        break;
      case '--seed':
        parsed.seed = parseInt(nextArg, 10);
        i++;
        break;
      case '--edge-cases':
        parsed.includeEdgeCases = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
    }
  }

  if (parsed.help || !parsed.name) {
    console.log(`
Golden Reserve Fixture Generator

Usage:
  tsx scripts/generate-golden-reserve-fixture.ts --name <fixture-name> [options]

Required:
  --name <string>              Name of the fixture (e.g., "reserve-v1")

Options:
  --portfolio-size <number>    Number of portfolio companies (default: 10)
  --seed <number>              Random seed for determinism (default: 42)
  --edge-cases                 Include edge cases (empty reserves, strategic companies)
  --help, -h                   Show this help message

Examples:
  tsx scripts/generate-golden-reserve-fixture.ts --name reserve-v1 --portfolio-size 10
  tsx scripts/generate-golden-reserve-fixture.ts --name edge-case-empty --portfolio-size 0
  tsx scripts/generate-golden-reserve-fixture.ts --name strategic-mix --seed 12345 --edge-cases
`);
    process.exit(parsed.help ? 0 : 1);
  }

  return parsed as CliArgs;
}

// ============================================================================
// DETERMINISTIC RANDOM NUMBER GENERATOR (PRNG)
// ============================================================================

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Linear Congruential Generator (LCG)
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  uuid(): string {
    // Generate deterministic UUID using seed
    const hex = '0123456789abcdef';
    let uuid = '';
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        uuid += '-';
      } else if (i === 14) {
        uuid += '4'; // Version 4 UUID
      } else if (i === 19) {
        uuid += hex[this.nextInt(8, 11)]; // Variant bits
      } else {
        uuid += hex[this.nextInt(0, 15)];
      }
    }
    return uuid;
  }
}

// ============================================================================
// FIXTURE GENERATION
// ============================================================================

function generateGraduationMatrix(rng: SeededRandom): GraduationMatrix {
  return {
    'pre-seed': rng.nextInt(20, 40),
    seed: rng.nextInt(30, 50),
    'series-a': rng.nextInt(40, 60),
    'series-b': rng.nextInt(50, 70),
    'series-c': rng.nextInt(60, 80),
    'series-d-plus': rng.nextInt(70, 90),
    'late-stage': 0, // Final stage
  };
}

function generateStageStrategies(rng: SeededRandom): StageStrategy[] {
  const stages: CompanyStage[] = [
    'pre-seed',
    'seed',
    'series-a',
    'series-b',
    'series-c',
    'series-d-plus',
    'late-stage',
  ];

  return stages.map((stage) => ({
    stage,
    targetReserveMultiple: rng.next() * 2 + 1.5, // 1.5 to 3.5
    minReserveAmount: rng.nextInt(50000, 200000),
    maxReserveAmount: rng.nextInt(5000000, 10000000),
    targetOwnershipAtExit: rng.nextInt(10, 25),
    proRataParticipation: rng.nextInt(80, 100),
  }));
}

function generateCompany(
  rng: SeededRandom,
  index: number,
  includeEdgeCases: boolean
): CompanyInput {
  const stages: CompanyStage[] = ['seed', 'series-a', 'series-b', 'series-c', 'series-d-plus'];
  const stage = rng.choice(stages);

  // Edge case: strategic company with high conviction
  const isStrategic = includeEdgeCases && index % 5 === 0;

  return {
    companyId: rng.uuid(),
    companyName: `Company ${index + 1}`,
    currentStage: stage,
    currentValuation: rng.nextInt(5_000_000, 100_000_000),
    currentOwnership: rng.next() * 20 + 5, // 5-25%
    initialInvestment: rng.nextInt(500_000, 5_000_000),
    revenueGrowthRate: rng.next() * 100 + 50, // 50-150%
    burnRate: rng.nextInt(50_000, 500_000),
    monthsToNextRound: rng.nextInt(6, 18),
    isStrategic,
    hasFollowOnRights: rng.next() > 0.2, // 80% have rights
    maxDilutionTolerance: rng.nextInt(30, 60),
  };
}

function generateRequest(args: CliArgs): ReserveOptimizationRequest {
  const rng = new SeededRandom(args.seed);
  const fundId = rng.uuid();

  const portfolio: CompanyInput[] = [];
  for (let i = 0; i < args.portfolioSize; i++) {
    portfolio.push(generateCompany(rng, i, args.includeEdgeCases));
  }

  const request: ReserveOptimizationRequest = {
    contractVersion: CONTRACT_VERSION,
    fundId,
    optimizationId: rng.uuid(),
    portfolio,
    graduationMatrix: generateGraduationMatrix(rng),
    stageStrategies: generateStageStrategies(rng),
    availableReserves: rng.nextInt(10_000_000, 50_000_000),
    minAllocationPerCompany: rng.nextInt(50_000, 100_000),
    maxAllocationPerCompany: rng.nextInt(5_000_000, 10_000_000),
    optimizationGoal: rng.choice(['maximize-ownership', 'minimize-dilution', 'balanced']),
    prioritizeStrategic: true,
    randomSeed: args.seed,
  };

  // Validate request
  const validated = ReserveOptimizationRequestSchema.parse(request);
  return validated;
}

/**
 * Run the reserve engine to generate expected outputs
 * NOTE: This is a stub that demonstrates the integration pattern.
 * Replace with actual reserve engine implementation when available.
 */
function runReserveEngine(request: ReserveOptimizationRequest): ReserveOptimizationResponse {
  const rng = new SeededRandom(request.randomSeed || 42);

  // Convert portfolio to ReserveInput format for existing engine
  const reserveInputs: ReserveInput[] = request.portfolio.map((company) => ({
    id: parseInt(company.companyId.slice(0, 8), 16) % 10000, // Deterministic numeric ID
    invested: company.initialInvestment,
    stage: mapStageToReserveInput(company.currentStage),
    sector: 'SaaS', // Default sector
    ownership: company.currentOwnership / 100, // Convert percentage to decimal
  }));

  // Run existing reserve engine
  const engineOutputs = ReserveEngine(reserveInputs);

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
    companyAllocations.reduce((sum, c) => sum + c.projectedOwnershipAtExit, 0) /
    companyAllocations.length;
  const weightedMultiple =
    companyAllocations.reduce(
      (sum, c) => sum + c.projectedMultiple * c.allocatedReserve,
      0
    ) / totalAllocated;

  // Ensure unallocated reserves is non-negative
  const unallocatedReserves = Math.max(0, request.availableReserves - totalAllocated);

  const response: ReserveOptimizationResponse = {
    contractVersion: CONTRACT_VERSION,
    optimizationId: request.optimizationId || rng.uuid(),
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
      capitalEfficiency: 75 + rng.next() * 20, // 75-95%
    },
    constraints: [
      `Total available reserves: $${(request.availableReserves / 1e6).toFixed(1)}M`,
      `Portfolio size: ${request.portfolio.length} companies`,
    ],
    seedUsed: request.randomSeed,
    algorithmVersion: 'v1.0-rule-based',
  };

  // Validate response
  const validated = ReserveOptimizationResponseSchema.parse(response);
  return validated;
}

function mapStageToReserveInput(stage: CompanyStage): string {
  const mapping: Record<CompanyStage, string> = {
    'pre-seed': 'Seed',
    seed: 'Seed',
    'series-a': 'Series A',
    'series-b': 'Series B',
    'series-c': 'Series C',
    'series-d-plus': 'Growth',
    'late-stage': 'Growth',
  };
  return mapping[stage];
}

function generateMetadata(args: CliArgs, request: ReserveOptimizationRequest): any {
  return {
    name: args.name,
    description: `Golden dataset for reserve engine with ${args.portfolioSize} companies`,
    assumptions: [
      'Deterministic allocation using fixed random seed',
      'Contract version: ' + CONTRACT_VERSION,
      'Rule-based allocation algorithm',
      `Portfolio size: ${args.portfolioSize}`,
      `Random seed: ${args.seed}`,
    ],
    expectedOutcomes: {
      totalAllocated: 0, // Will be filled after engine run
      averageConfidence: 0.65,
      strategicCompanyCount: args.includeEdgeCases
        ? Math.floor(args.portfolioSize / 5)
        : 0,
    },
    tolerances: {
      absolute: 1e-6,
      relative: 1e-6,
      description: 'Precision-aware comparison using 6 decimal places',
    },
    validation: {
      checkpoints: [0, Math.floor(args.portfolioSize / 2), args.portfolioSize - 1],
      criticalMetrics: [
        'totalAllocated',
        'totalAvailable',
        'unallocatedReserves',
        'averageOwnershipAtExit',
      ],
    },
    version: CONTRACT_VERSION,
    author: 'generate-golden-reserve-fixture.ts',
    createdDate: new Date().toISOString(),
  };
}

// ============================================================================
// FILE WRITING
// ============================================================================

async function writeFixture(
  args: CliArgs,
  request: ReserveOptimizationRequest,
  response: ReserveOptimizationResponse
): Promise<void> {
  const fixtureDir = join(
    process.cwd(),
    'tests',
    'fixtures',
    'golden-datasets',
    'reserve-engine-v1',
    args.name
  );

  // Ensure directory exists
  await mkdir(fixtureDir, { recursive: true });

  // Generate metadata
  const metadata = generateMetadata(args, request);
  metadata.expectedOutcomes.totalAllocated = response.totalAllocated;

  // Write files
  await writeFile(
    join(fixtureDir, 'inputs.json'),
    JSON.stringify(request, null, 2),
    'utf-8'
  );

  await writeFile(
    join(fixtureDir, 'expected.json'),
    JSON.stringify(response, null, 2),
    'utf-8'
  );

  await writeFile(
    join(fixtureDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );

  console.log(`✓ Generated fixture: ${args.name}`);
  console.log(`  Location: ${fixtureDir}`);
  console.log(`  Portfolio size: ${args.portfolioSize}`);
  console.log(`  Random seed: ${args.seed}`);
  console.log(`  Total allocated: $${(response.totalAllocated / 1e6).toFixed(2)}M`);
  console.log(`  Files created:`);
  console.log(`    - inputs.json`);
  console.log(`    - expected.json`);
  console.log(`    - metadata.json`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  try {
    const args = parseArgs();

    console.log('Generating golden reserve fixture...\n');

    // Generate request
    const request = generateRequest(args);
    console.log(`✓ Generated request with ${request.portfolio.length} companies`);

    // Run engine
    const response = runReserveEngine(request);
    console.log(`✓ Ran reserve engine (allocated $${(response.totalAllocated / 1e6).toFixed(2)}M)`);

    // Write fixture
    await writeFixture(args, request, response);

    console.log('\n✓ Fixture generation complete!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error generating fixture:', error);
    process.exit(1);
  }
}

main();
