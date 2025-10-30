#!/usr/bin/env tsx

/**
 * Example usage of the Tool Evaluation Framework
 * This demonstrates how to programmatically use the evaluation tools
 */

import { EVALUATION_TOOLS, executeTask, type EvaluationTask } from './waterfall-evaluator';

async function runExamples() {
  console.log('🚀 Tool Evaluation Framework - Example Usage\n');

  // Example 1: Direct tool usage
  console.log('=== Example 1: Direct Waterfall Calculation ===');
  const waterfallResult = await EVALUATION_TOOLS.calculateWaterfall.execute({
    fundSize: 100000000, // $100M
    carryPercent: 0.2, // 20%
    hurdle: 0.08, // 8%
    type: 'AMERICAN',
    catchUp: true,
  });
  console.log('Waterfall Result:', JSON.stringify(waterfallResult, null, 2));

  // Example 2: Reserve calculation
  console.log('\n=== Example 2: Reserve Allocation ===');
  const reserveResult = await EVALUATION_TOOLS.calculateReserves.execute({
    totalFund: 150000000, // $150M
    deployedCapital: 75000000, // $75M deployed
    targetReserveRatio: 1.0, // 1:1 ratio
    portfolioCompanies: 30,
  });
  console.log('Reserve Result:', JSON.stringify(reserveResult, null, 2));

  // Example 3: Pacing analysis
  console.log('\n=== Example 3: Investment Pacing ===');
  const pacingResult = await EVALUATION_TOOLS.calculatePacing.execute({
    fundSize: 200000000,
    fundLifeYears: 10,
    deploymentPeriodYears: 4,
    currentDeployed: 60000000,
    yearsElapsed: 1.5,
  });
  console.log('Pacing Result:', JSON.stringify(pacingResult, null, 2));

  // Example 4: Run evaluation task
  console.log('\n=== Example 4: Run Evaluation Task ===');
  const task: EvaluationTask = {
    id: 'example-1',
    description: 'Example waterfall calculation',
    category: 'waterfall',
    prompt:
      'Calculate the carry distribution for a $50 million fund with 20% carry, 8% hurdle, AMERICAN waterfall',
    expectedResponse: '{"carried":10000000,"hurdleAmount":4000000}',
    tolerance: undefined,
    metadata: {},
  };

  const taskResult = await executeTask(task, EVALUATION_TOOLS);
  console.log('Task Result:', {
    passed: taskResult.passed,
    expected: taskResult.expected,
    actual: taskResult.actual,
    duration: `${taskResult.duration}ms`,
  });

  // Example 5: Validate waterfall changes
  console.log('\n=== Example 5: Waterfall Field Updates ===');
  const updateResult = await EVALUATION_TOOLS.applyWaterfallUpdate.execute({
    waterfall: {
      type: 'AMERICAN',
      carryVesting: {
        schedule: 'LINEAR',
        cliffMonths: 12,
        vestingMonths: 48,
        immediateVest: 0.25,
      },
    },
    field: 'carryVesting.immediateVest',
    value: 0.3, // Update immediate vest to 30%
  });
  console.log('Update Result:', JSON.stringify(updateResult, null, 2));

  // Example 6: Error handling
  console.log('\n=== Example 6: Error Handling ===');
  const errorResult = await EVALUATION_TOOLS.calculateWaterfall.execute({
    fundSize: 100000000,
    carryPercent: -0.5, // Invalid negative carry
    hurdle: 0.08,
    type: 'AMERICAN',
    catchUp: true,
  });
  console.log('Error Result:', JSON.stringify(errorResult, null, 2));

  // Summary
  console.log('\n📊 Example Summary:');
  console.log('- Direct tool execution ✅');
  console.log('- Evaluation task processing ✅');
  console.log('- Error handling ✅');
  console.log('- All major calculation types demonstrated ✅');
}

// Run the examples
runExamples().catch(console.error);
