#!/usr/bin/env node
/**
 * Demo: Evaluator-Optimizer Pattern (Claude Cookbook)
 *
 * This demonstrates the iterative repair improvement loop where:
 * 1. Generator creates initial repair
 * 2. Evaluator critiques the repair against criteria
 * 3. Optimizer improves based on feedback
 * 4. Loop continues until PASS or max iterations
 */

import type { TestFailure, RepairInput } from './src/TestRepairAgent';
import { TestRepairAgent } from './src/TestRepairAgent';

async function demo() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Evaluator-Optimizer Pattern Demo (Claude Cookbook)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const agent = new TestRepairAgent();

  // Simulate different types of test failures
  const testFailures: TestFailure[] = [
    {
      file: 'client/src/utils/validation.ts',
      testName: 'should handle null input gracefully',
      error: 'TypeError: Cannot read property "length" of null at line 42',
      type: 'runtime'
    },
    {
      file: 'server/routes/api.ts',
      testName: 'should validate request body',
      error: 'AssertionError: expected "error" but received "success"',
      type: 'assertion'
    },
    {
      file: 'shared/types.ts',
      testName: 'should compile without errors',
      error: 'SyntaxError: Unexpected token "}" at line 156',
      type: 'syntax'
    }
  ];

  const input: RepairInput = {
    projectRoot: process.cwd(),
    maxRepairs: testFailures.length
  };

  console.log('🎯 Testing Evaluator-Optimizer Loop\n');

  for (const [index, failure] of testFailures.entries()) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Test ${index + 1}/${testFailures.length}: ${failure.testName}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`📁 File: ${failure.file}`);
    console.log(`❌ Error: ${failure.error.substring(0, 80)}...`);
    console.log(`🏷️  Type: ${failure.type}\n`);

    try {
      // Access the private evaluatorOptimizerLoop method for demo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (agent as any).evaluatorOptimizerLoop(failure, input);

      console.log(`✨ Results after ${result.iterations} iteration(s):`);
      console.log(`   Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`   Evaluation: ${result.evaluation.status}`);
      console.log(`   Repair: ${result.changes}`);

      if (result.evaluation.feedback !== 'All criteria met') {
        console.log(`   Feedback: ${result.evaluation.feedback}`);
      }

      console.log(`\n   📊 Criteria Check:`);
      console.log(`      ${result.evaluation.criteria.testPasses ? '✅' : '❌'} Test Passes`);
      console.log(`      ${result.evaluation.criteria.noRegressions ? '✅' : '❌'} No Regressions`);
      console.log(`      ${result.evaluation.criteria.followsConventions ? '✅' : '❌'} Follows Conventions`);

    } catch (error: unknown) {
      console.log(`   ❌ Error during repair: ${error}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Pattern Benefits Demonstrated:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✓ Iterative improvement vs single-shot repairs');
  console.log('  ✓ Clear evaluation criteria (testPasses, noRegressions, conventions)');
  console.log('  ✓ Structured feedback for optimization');
  console.log('  ✓ Early stopping on PASS (efficiency)');
  console.log('  ✓ Max iterations prevent infinite loops');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run demo
demo().catch(console.error);
