#!/usr/bin/env tsx

import { ConstrainedReserveEngine } from '../client/src/core/reserves/ConstrainedReserveEngine.js';
import type { ReserveInput } from '../shared/schemas.js';

// Excel test cases from the original proof-of-concept spreadsheet
const excelTestCases = [
  {
    name: 'Basic Allocation Test',
    input: {
      availableReserves: 5000000,
      companies: [
        { id: 'comp_1', name: 'Alpha Ventures', stage: 'seed', invested: 500000, ownership: 0.15 },
        { id: 'comp_2', name: 'Beta Corp', stage: 'series_a', invested: 2000000, ownership: 0.12 },
        { id: 'comp_3', name: 'Gamma Labs', stage: 'preseed', invested: 150000, ownership: 0.18 },
      ],
      stagePolicies: [
        { stage: 'preseed', reserveMultiple: 3, weight: 1 },
        { stage: 'seed', reserveMultiple: 2.5, weight: 1.2 },
        { stage: 'series_a', reserveMultiple: 2, weight: 1.5 },
      ],
      constraints: {
        minCheck: 50000,
        discountRateAnnual: 0.12
      }
    } as ReserveInput,
    expectedOutputs: {
      // Expected allocations from Excel model (approximate)
      totalAllocatedRange: [3000000, 5000000],
      allocationsCount: 3,
      topAllocation: { companyId: 'comp_2', minAmount: 1500000 } // Series A should get priority
    }
  },
  {
    name: 'Constraint Test - MinCheck',
    input: {
      availableReserves: 100000,
      companies: [
        { id: 'small_1', name: 'Small Co', stage: 'preseed', invested: 25000, ownership: 0.25 },
        { id: 'medium_1', name: 'Medium Co', stage: 'seed', invested: 200000, ownership: 0.15 },
      ],
      stagePolicies: [
        { stage: 'preseed', reserveMultiple: 2, weight: 1 },
        { stage: 'seed', reserveMultiple: 2, weight: 1 },
      ],
      constraints: {
        minCheck: 75000,
        discountRateAnnual: 0.12
      }
    } as ReserveInput,
    expectedOutputs: {
      totalAllocatedRange: [75000, 100000],
      allocationsCount: 1, // Only one company should get allocation due to minCheck
      excludedCompany: 'small_1' // Small company shouldn't get allocation
    }
  },
  {
    name: 'Stage Cap Test',
    input: {
      availableReserves: 10000000,
      companies: [
        { id: 'seed_1', name: 'Seed Co 1', stage: 'seed', invested: 500000, ownership: 0.15 },
        { id: 'seed_2', name: 'Seed Co 2', stage: 'seed', invested: 400000, ownership: 0.18 },
        { id: 'seed_3', name: 'Seed Co 3', stage: 'seed', invested: 600000, ownership: 0.12 },
      ],
      stagePolicies: [
        { stage: 'seed', reserveMultiple: 3, weight: 1 },
      ],
      constraints: {
        maxPerStage: { seed: 2000000 },
        discountRateAnnual: 0.12
      }
    } as ReserveInput,
    expectedOutputs: {
      totalAllocatedRange: [1900000, 2000000], // Should hit stage cap
      stageTotal: { stage: 'seed', maxAmount: 2000000 }
    }
  }
];

function validateTestCase(testCase: typeof excelTestCases[0]) {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  console.log('─'.repeat(50));
  
  const engine = new ConstrainedReserveEngine();
  const result = engine.calculate(testCase.input);
  
  let passed = true;
  const errors: string[] = [];
  
  // Basic validation
  if (!result.conservationOk) {
    errors.push('❌ Conservation check failed');
    passed = false;
  } else {
    console.log('✅ Conservation check passed');
  }
  
  // Total allocated range check
  const { totalAllocatedRange } = testCase.expectedOutputs;
  if (totalAllocatedRange) {
    const [min, max] = totalAllocatedRange;
    if (result.totalAllocated < min || result.totalAllocated > max) {
      errors.push(`❌ Total allocated ${result.totalAllocated} not in range [${min}, ${max}]`);
      passed = false;
    } else {
      console.log(`✅ Total allocated ${result.totalAllocated} within expected range`);
    }
  }
  
  // Allocations count check
  if (testCase.expectedOutputs.allocationsCount !== undefined) {
    if (result.allocations.length !== testCase.expectedOutputs.allocationsCount) {
      errors.push(`❌ Expected ${testCase.expectedOutputs.allocationsCount} allocations, got ${result.allocations.length}`);
      passed = false;
    } else {
      console.log(`✅ Allocation count: ${result.allocations.length}`);
    }
  }
  
  // Top allocation check
  if (testCase.expectedOutputs.topAllocation) {
    const { companyId, minAmount } = testCase.expectedOutputs.topAllocation;
    const topAlloc = result.allocations.find(a => a.id === companyId);
    if (!topAlloc || topAlloc.allocated < minAmount) {
      errors.push(`❌ Company ${companyId} should have at least ${minAmount}, got ${topAlloc?.allocated || 0}`);
      passed = false;
    } else {
      console.log(`✅ Top allocation check passed for ${companyId}`);
    }
  }
  
  // Excluded company check
  if (testCase.expectedOutputs.excludedCompany) {
    const excluded = result.allocations.find(a => a.id === testCase.expectedOutputs.excludedCompany);
    if (excluded) {
      errors.push(`❌ Company ${testCase.expectedOutputs.excludedCompany} should not receive allocation`);
      passed = false;
    } else {
      console.log(`✅ Excluded company check passed`);
    }
  }
  
  // Stage total check
  if (testCase.expectedOutputs.stageTotal) {
    const { stage, maxAmount } = testCase.expectedOutputs.stageTotal;
    const stageTotal = result.allocations
      .filter(a => a.stage === stage)
      .reduce((sum, a) => sum + a.allocated, 0);
    
    if (stageTotal > maxAmount) {
      errors.push(`❌ Stage ${stage} total ${stageTotal} exceeds max ${maxAmount}`);
      passed = false;
    } else {
      console.log(`✅ Stage ${stage} total: ${stageTotal}`);
    }
  }
  
  // Display results
  console.log('\n📊 Results:');
  result.allocations.forEach(alloc => {
    console.log(`  ${alloc.name} (${alloc.stage}): $${alloc.allocated.toLocaleString()}`);
  });
  console.log(`  Remaining: $${result.remaining.toLocaleString()}`);
  
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(error => console.log(`  ${error}`));
  }
  
  return passed;
}

function main() {
  console.log('🔬 Excel Parity Validation');
  console.log('═'.repeat(50));
  
  let totalTests = excelTestCases.length;
  let passedTests = 0;
  
  for (const testCase of excelTestCases) {
    if (validateTestCase(testCase)) {
      passedTests++;
    }
  }
  
  console.log('\n📈 Summary');
  console.log('─'.repeat(50));
  console.log(`Tests passed: ${passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Excel parity maintained.');
    process.exit(0);
  } else {
    console.log('💥 Some tests failed. Check algorithm against Excel model.');
    process.exit(1);
  }
}

// Run main() when executed directly (cross-platform compatible)
main();