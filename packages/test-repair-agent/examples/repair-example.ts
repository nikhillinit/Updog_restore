#!/usr/bin/env tsx
import { TestRepairAgent } from '../src';

/**
 * Example demonstrating test repair agent functionality
 */
async function runRepairExample() {
  const agent = new TestRepairAgent({
    logLevel: 'info',
  });

  console.log('=== Test Repair Agent Example ===\n');

  // Example 1: Detect and repair test failures
  console.log('1. Running test failure detection...');
  const result = await agent.execute({
    projectRoot: process.cwd(),
    testPattern: undefined, // All tests
    maxRepairs: 3,
    draftPR: false, // Don't create PR in example
  });

  if (result.success) {
    console.log(`✅ Analysis completed`);
    console.log(`📊 Found ${result.data.failures.length} test failures`);
    console.log(`🔧 Generated ${result.data.repairs.length} repairs`);
    
    if (result.data.failures.length > 0) {
      console.log('\n📋 Test Failures:');
      result.data.failures.forEach((failure, index) => {
        console.log(`  ${index + 1}. ${failure.file} - ${failure.testName}`);
        console.log(`     Type: ${failure.type}`);
        console.log(`     Error: ${failure.error.substring(0, 100)}...`);
      });
    }

    if (result.data.repairs.length > 0) {
      console.log('\n🔧 Generated Repairs:');
      result.data.repairs.forEach((repair, index) => {
        console.log(`  ${index + 1}. ${repair.file}`);
        console.log(`     Changes: ${repair.changes}`);
        console.log(`     Success: ${repair.success ? '✅' : '❌'}`);
      });
    }
  } else {
    console.log(`❌ Repair analysis failed: ${result.error}`);
  }

  // Example 2: Status information
  console.log('\n=== Agent Status ===');
  const status = agent.getStatus();
  console.log(JSON.stringify(status, null, 2));

  console.log('\n=== Example Complete ===');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRepairExample().catch(console.error);
}

export { runRepairExample };