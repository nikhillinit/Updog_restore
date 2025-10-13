/**
 * Excel Parity Validator
 * Validates that our calculations match Excel reference implementations
 * within acceptable tolerance levels
 */

import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';
import type { Company, StagePolicy, ReserveConstraints } from '@/types/domain-min';
import type {
  EngineCompany,
  EngineStagePolicy,
  EngineInput,
  EngineResult} from '@/core/reserves/types';
import {
  normalizeStage,
  isRawCompany,
  isRawStagePolicy
} from '@/core/reserves/types';

// Extended Company type for parity validation
interface ParityCompany extends Company {
  invested?: number;
  ownership?: number;
  currentValuation?: number;
  reserveCap?: number;
}

// Extended StagePolicy for parity validation
interface ParityStagePolicy extends Omit<StagePolicy, 'max_check_size_cents' | 'reserve_ratio'> {
  reserveMultiple?: number;
  weight?: number;
  maxInvestment?: number;
  max_check_size_cents?: number;
  reserve_ratio?: number;
}

// Extended constraints for parity
interface ParityConstraints {
  minCheckSize?: number;
  maxPerCompany?: number;
  min_reserve_cents?: number;
  max_reserve_cents?: number;
  target_reserve_months?: number;
  max_concentration_percent?: number;

  maxPerStage?: Record<string, number>;
}

// Convert parity format to engine format
function toEngineCompany(input: ParityCompany): EngineCompany {
  if (!isRawCompany(input)) {
    throw new Error(`Invalid company data structure: ${JSON.stringify(input)}`);
  }

  return {
    id: String(input.id),
    name: String(input.name ?? input.id),
    stage: normalizeStage(input.stage),
    invested: Number(input.invested ?? input.allocated ?? 0),
    ownership: Number(input.ownership ?? 0),
    ...(input.reserveCap != null ? { reserveCap: Number(input.reserveCap) } : {})
  };
}

function toEngineStagePolicy(input: ParityStagePolicy): EngineStagePolicy {
  if (!isRawStagePolicy(input)) {
    throw new Error(`Invalid stage policy structure: ${JSON.stringify(input)}`);
  }

  return {
    stage: normalizeStage(input.stage),
    reserveMultiple: Number(input.reserveMultiple ?? input.reserve_ratio ?? 1.0),
    weight: Number(input.weight ?? 1.0)
  };
}

// Keep old functions for backward compatibility but mark as deprecated
/** @deprecated Use toEngineCompany instead */
function toCompany(input: ParityCompany): Company {
  return {
    id: input.id,
    name: input.name,
    stage: input.stage,
    ...(input.allocated !== undefined ? { allocated: input.allocated } : {})
  };
}

/** @deprecated Use toEngineStagePolicy instead */
function toStagePolicy(input: ParityStagePolicy): StagePolicy {
  return {
    stage: input.stage,
    max_check_size_cents: input.max_check_size_cents ?? (input.maxInvestment ? input.maxInvestment * 100 : 0),
    reserve_ratio: input.reserve_ratio ?? input.reserveMultiple ?? 1.0
  };
}

function toConstraints(input: ParityConstraints): ReserveConstraints {
  return {
    min_reserve_cents: input.min_reserve_cents ?? (input.minCheckSize ? input.minCheckSize * 100 : 0),
    max_reserve_cents: input.max_reserve_cents ?? (input.maxPerCompany ? input.maxPerCompany * 100 : 0),
    target_reserve_months: input.target_reserve_months ?? 18,
    max_concentration_percent: input.max_concentration_percent ?? 20
  };
}

export interface ParityDataset {
  name: string;
  description: string;
  input: {
    companies: ParityCompany[];
    availableReserves: number;
    policies: ParityStagePolicy[];
    constraints?: ParityConstraints;
  };
  expectedOutput: {
    totalAllocated: number;
    allocations?: Array<{
      companyId: string;
      allocation: number;
    }>;
    allocateds?: Array<{  // Legacy field name for backward compatibility
      id: string;
      allocated: number;
    }>;
  };
  tolerance: number; // Acceptable drift percentage (e.g., 0.01 for 1%)
}

export interface ParityValidationResult {
  name: string;
  passed: boolean;
  drift: number; // Actual drift percentage
  details: {
    expectedTotal: number;
    actualTotal: number;
    difference: number;
    companyMismatches: Array<{
      companyId: string;
      expected: number;
      actual: number;
      drift: number;
    }>;
  };
}

export class ExcelParityValidator {
  private datasets: ParityDataset[] = [];
  private engine: ConstrainedReserveEngine;

  constructor() {
    this.engine = new ConstrainedReserveEngine();
    this.loadBuiltInDatasets();
  }

  /**
   * Add a custom dataset for validation
   */
  addDataset(dataset: ParityDataset): void {
    this.datasets.push(dataset);
  }

  /**
   * Load built-in test datasets
   */
  private loadBuiltInDatasets(): void {
    // Basic seed portfolio test
    this.datasets.push({
      name: 'seed_portfolio_basic',
      description: 'Basic seed portfolio with 3 companies',
      input: {
        companies: [
          {
            id: 'c1',
            name: 'TechCo',
            stage: 'seed',
            invested: 1000000, // Parity-specific field
            ownership: 0.15,
            currentValuation: 5000000,
          },
          {
            id: 'c2',
            name: 'BioStartup',
            stage: 'seed',
            invested: 500000, // Parity-specific field
            ownership: 0.10,
            currentValuation: 2000000,
          },
          {
            id: 'c3',
            name: 'AIVenture',
            stage: 'seed',
            invested: 750000, // Parity-specific field
            ownership: 0.12,
            currentValuation: 3000000,
          },
        ],
        availableReserves: 5000000,
        policies: [
          {
            stage: 'seed',
            reserveMultiple: 2.0,
            weight: 1.0,
            maxInvestment: 2000000,
          },
        ],
        constraints: {
          minCheckSize: 100000,
          maxPerCompany: 2000000,
        },
      },
      expectedOutput: {
        totalAllocated: 4500000, // Expected from Excel calculation
        allocations: [
          { companyId: 'c1', allocation: 2000000 },
          { companyId: 'c2', allocation: 1000000 },
          { companyId: 'c3', allocation: 1500000 },
        ],
      },
      tolerance: 0.01, // 1% tolerance
    });

    // Mixed stage portfolio test
    this.datasets.push({
      name: 'mixed_stage_portfolio',
      description: 'Portfolio with companies at different stages',
      input: {
        companies: [
          {
            id: 'd1',
            name: 'EarlyCo',
            stage: 'preseed',
            invested: 250000,
            ownership: 0.20,
          },
          {
            id: 'd2',
            name: 'GrowthCo',
            stage: 'series_a',
            invested: 3000000,
            ownership: 0.08,
            currentValuation: 15000000,
          },
          {
            id: 'd3',
            name: 'MatureCo',
            stage: 'series_b',
            invested: 5000000,
            ownership: 0.05,
            currentValuation: 50000000,
          },
        ],
        availableReserves: 10000000,
        policies: [
          {
            stage: 'preseed',
            reserveMultiple: 3.0,
            weight: 0.8,
          },
          {
            stage: 'series_a',
            reserveMultiple: 1.5,
            weight: 1.2,
          },
          {
            stage: 'series_b',
            reserveMultiple: 1.0,
            weight: 1.0,
          },
        ],
        constraints: {
          minCheckSize: 100000,
          maxPerStage: {
            preseed: 1000000,
            series_a: 5000000,
            series_b: 5000000,
          },
        },
      },
      expectedOutput: {
        totalAllocated: 9750000,
        allocations: [
          { companyId: 'd1', allocation: 750000 },
          { companyId: 'd2', allocation: 4500000 },
          { companyId: 'd3', allocation: 4500000 }, // Limited by remaining reserves
        ],
      },
      tolerance: 0.015, // 1.5% tolerance
    });
  }

  /**
   * Validate all datasets
   */
  async validateAll(): Promise<{
    passed: number;
    failed: number;
    results: ParityValidationResult[];
    overallPassRate: number;
  }> {
    const results: ParityValidationResult[] = [];

    for (const dataset of this.datasets) {
      const result = await this.validateDataset(dataset);
      results.push(result);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return {
      passed,
      failed,
      results,
      overallPassRate: passed / (passed + failed),
    };
  }

  /**
   * Validate a single dataset
   */
  async validateDataset(dataset: ParityDataset): Promise<ParityValidationResult> {
    const { input, expectedOutput, tolerance } = dataset;

    // Validate and transform input data
    const validCompanies = input.companies.filter(isRawCompany);
    const validPolicies = input.policies.filter(isRawStagePolicy);
    
    if (validCompanies.length !== input.companies.length) {
      console.warn(`Filtered out ${input.companies.length - validCompanies.length} invalid companies`);
    }
    
    if (validPolicies.length !== input.policies.length) {
      console.warn(`Filtered out ${input.policies.length - validPolicies.length} invalid policies`);
    }

    // Create properly typed engine input
    const engineInput: EngineInput = {
      companies: validCompanies.map(c => toEngineCompany(c)),
      availableReserves: Number(input.availableReserves),
      stagePolicies: validPolicies.map(p => toEngineStagePolicy(p)),
      constraints: input.constraints || {}
    };

    // Run calculation with typed result
    const result = this.engine.calculate(engineInput) as EngineResult;

    // Compare totals
    const actualTotal = result.totalAllocated;
    const expectedTotal = expectedOutput.totalAllocated;
    const totalDifference = Math.abs(actualTotal - expectedTotal);
    const totalDrift = expectedTotal !== 0 ? totalDifference / expectedTotal : 0;

    // Compare individual allocations
    const companyMismatches: Array<{
      companyId: string;
      expected: number;
      actual: number;
      drift: number;
    }> = [];

    // Handle both 'allocateds' (legacy) and 'allocations' field names
    const expectedAllocationsRaw = expectedOutput.allocateds || expectedOutput.allocations || [];
    
    // Normalize to a common format for processing
    const expectedAllocations = expectedAllocationsRaw.map((alloc: any) => ({
      id: alloc.id || alloc.companyId,
      allocated: alloc.allocated ?? alloc.allocation ?? 0
    }));
    
    for (const expectedAlloc of expectedAllocations) {
      const actualAlloc = result.allocations.find(
        a => a.id === expectedAlloc.id
      );
      
      const actual = actualAlloc?.allocated || 0;
      const expected = expectedAlloc.allocated;
      const difference = Math.abs(actual - expected);
      const drift = expected !== 0 ? difference / expected : 0;

      if (drift > tolerance) {
        companyMismatches.push({
          companyId: expectedAlloc.id,
          expected,
          actual,
          drift,
        });
      }
    }

    const passed = totalDrift <= tolerance && companyMismatches.length === 0;

    return {
      name: dataset.name,
      passed,
      drift: totalDrift,
      details: {
        expectedTotal,
        actualTotal,
        difference: totalDifference,
        companyMismatches,
      },
    };
  }

  /**
   * Generate a detailed parity report
   */
  generateReport(results: ParityValidationResult[]): string {
    const lines: string[] = [];
    
    lines.push('Excel Parity Validation Report');
    lines.push('=' .repeat(50));
    lines.push('');

    for (const result of results) {
      lines.push(`Dataset: ${result.name}`);
      lines.push(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
      lines.push(`Drift: ${(result.drift * 100).toFixed(2)}%`);
      
      if (!result.passed) {
        lines.push('Details:');
        lines.push(`  Expected Total: $${result.details.expectedTotal.toLocaleString()}`);
        lines.push(`  Actual Total: $${result.details.actualTotal.toLocaleString()}`);
        lines.push(`  Difference: $${result.details.difference.toLocaleString()}`);
        
        if (result.details.companyMismatches.length > 0) {
          lines.push('  Company Mismatches:');
          for (const mismatch of result.details.companyMismatches) {
            lines.push(`    ${mismatch.companyId}:`);
            lines.push(`      Expected: $${mismatch.expected.toLocaleString()}`);
            lines.push(`      Actual: $${mismatch.actual.toLocaleString()}`);
            lines.push(`      Drift: ${(mismatch.drift * 100).toFixed(2)}%`);
          }
        }
      }
      
      lines.push('');
    }

    const summary = results.reduce(
      (acc: any, r: any) => ({
        passed: acc.passed + (r.passed ? 1 : 0),
        failed: acc.failed + (r.passed ? 0 : 1),
      }),
      { passed: 0, failed: 0 }
    );

    lines.push('Summary');
    lines.push('-'.repeat(50));
    lines.push(`Total Tests: ${results.length}`);
    lines.push(`Passed: ${summary.passed}`);
    lines.push(`Failed: ${summary.failed}`);
    lines.push(`Pass Rate: ${((summary.passed / results.length) * 100).toFixed(1)}%`);

    return lines.join('\n');
  }
}