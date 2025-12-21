/**
 * Example: How to use the BacktestRunner
 *
 * This example demonstrates:
 * 1. Loading test cases from JSON
 * 2. Running a backtest with custom configuration
 * 3. Accessing and analyzing results
 * 4. Saving reports
 */

import type { BacktestExecutionReport } from '../src/Backtest';
import { BacktestRunner } from '../src/Backtest';
import { resolve } from 'path';

async function runBacktestExample() {
  console.log('Backtest Runner Example\n');

  // 1. Load test cases from JSON file
  const casesPath = resolve(__dirname, 'sample-test-cases.json');
  console.log(`Loading test cases from: ${casesPath}`);

  const testCases = BacktestRunner.loadTestCases(casesPath);
  console.log(`Loaded ${testCases.length} test cases\n`);

  // 2. Create BacktestRunner with custom configuration
  const runner = new BacktestRunner({
    projectRoot: resolve(__dirname, '../../..'), // Root of Updog project
    maxConcurrent: 2, // Run 2 cases in parallel
    timeout: 300000, // 5 minutes per case
    verbose: true, // Enable detailed logging
    dryRun: true, // Simulate execution (don't run actual agents)
    cleanupWorktree: true, // Clean up git worktrees after completion
  });

  // 3. Run the backtest
  console.log('Starting backtest...\n');
  const report: BacktestExecutionReport = await runner.runBacktest(testCases);

  // 4. Analyze results
  console.log(`\n${  '='.repeat(60)}`);
  console.log('RESULTS ANALYSIS');
  console.log('='.repeat(60));
  console.log(`Total Cases: ${report.totalCases}`);
  console.log(`Successful: ${report.successfulCases} (${(report.successRate * 100).toFixed(2)}%)`);
  console.log(`Failed: ${report.failedCases}`);
  console.log();
  console.log('Performance Metrics:');
  console.log(`  Average Quality Score: ${report.averageQualityScore.toFixed(2)}/100`);
  console.log(`  Average Similarity: ${(report.averageSimilarityScore * 100).toFixed(2)}%`);
  console.log(`  Average Speedup: ${report.averageSpeedup.toFixed(2)}x`);
  console.log(`  Average Iterations: ${report.averageIterations.toFixed(2)}`);
  console.log(`  Total Cost: ${report.totalCost.toFixed(2)} units`);
  console.log();

  // 5. Show best and worst cases
  if (report.summary.bestCase) {
    console.log('Best Case:');
    console.log(`  ID: ${report.summary.bestCase.caseId}`);
    console.log(`  Quality: ${report.summary.bestCase.qualityScore.toFixed(2)}/100`);
    console.log(`  Speedup: ${report.summary.bestCase.speedup.toFixed(2)}x`);
    console.log();
  }

  if (report.summary.worstCase) {
    console.log('Worst Case:');
    console.log(`  ID: ${report.summary.worstCase.caseId}`);
    console.log(`  Quality: ${report.summary.worstCase.qualityScore.toFixed(2)}/100`);
    console.log(`  Success: ${report.summary.worstCase.agentSuccess}`);
    console.log();
  }

  // 6. Analyze failures
  const failures = report.results.filter(r => !r.agentSuccess);
  if (failures.length > 0) {
    console.log('Failed Cases:');
    failures.forEach(f => {
      console.log(`  - ${f.caseId}: ${f.errors?.[0] || 'Unknown error'}`);
    });
    console.log();
  }

  // 7. Save report
  const outputPath = resolve(__dirname, '../backtest-example-report.json');
  BacktestRunner.saveReport(report, outputPath);
  console.log(`Report saved to: ${outputPath}`);
  console.log(`Summary saved to: ${outputPath.replace('.json', '-summary.txt')}`);
  console.log();

  // 8. Return report for further processing
  return report;
}

// Advanced usage: Accessing individual results
async function analyzeIndividualCases() {
  const casesPath = resolve(__dirname, 'sample-test-cases.json');
  const testCases = BacktestRunner.loadTestCases(casesPath);

  const runner = new BacktestRunner({
    projectRoot: resolve(__dirname, '../../..'),
    dryRun: true,
  });

  const report = await runner.runBacktest(testCases);

  // Analyze each result
  console.log('\nDetailed Case Analysis:');
  console.log('='.repeat(60));

  report.results.forEach((result, index) => {
    console.log(`\nCase ${index + 1}: ${result.caseId}`);
    console.log(`  Success: ${result.agentSuccess ? '✓' : '✗'}`);
    console.log(`  Quality: ${result.qualityScore.toFixed(1)}/100`);
    console.log(`  Similarity: ${(result.similarityScore * 100).toFixed(1)}%`);
    console.log(`  Speedup: ${result.speedup.toFixed(1)}x`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Cost: ${result.cost.toFixed(2)} units`);

    if (!result.agentSuccess && result.errors) {
      console.log(`  Errors: ${result.errors.join(', ')}`);
    }
  });
}

// Example: Filtering and sorting results
async function analyzeBestPerformers() {
  const casesPath = resolve(__dirname, 'sample-test-cases.json');
  const testCases = BacktestRunner.loadTestCases(casesPath);

  const runner = new BacktestRunner({
    projectRoot: resolve(__dirname, '../../..'),
    dryRun: true,
  });

  const report = await runner.runBacktest(testCases);

  // Find top performers by quality score
  const topPerformers = report.results
    .filter(r => r.agentSuccess)
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, 5);

  console.log('\nTop 5 Performers by Quality:');
  console.log('='.repeat(60));
  topPerformers.forEach((result, index) => {
    console.log(`${index + 1}. ${result.caseId}`);
    console.log(`   Quality: ${result.qualityScore.toFixed(1)}/100`);
    console.log(`   Speedup: ${result.speedup.toFixed(1)}x`);
    console.log(`   Cost: ${result.cost.toFixed(2)} units`);
  });

  // Find fastest cases by speedup
  const fastest = report.results
    .filter(r => r.agentSuccess)
    .sort((a, b) => b.speedup - a.speedup)
    .slice(0, 5);

  console.log('\nTop 5 Fastest Cases:');
  console.log('='.repeat(60));
  fastest.forEach((result, index) => {
    console.log(`${index + 1}. ${result.caseId}`);
    console.log(`   Speedup: ${result.speedup.toFixed(1)}x`);
    console.log(`   Quality: ${result.qualityScore.toFixed(1)}/100`);
  });
}

// Run examples if this file is executed directly
if (require.main === module) {
  runBacktestExample()
    .then(() => analyzeIndividualCases())
    .then(() => analyzeBestPerformers())
    .then(() => {
      console.log('\nExample completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nExample failed:', error);
      process.exit(1);
    });
}

export { runBacktestExample, analyzeIndividualCases, analyzeBestPerformers };
