/**
 * Example usage of BacktestReporter
 *
 * Shows how to:
 * 1. Create backtest cases
 * 2. Generate comprehensive reports
 * 3. Output multiple formats
 * 4. Analyze ROI and patterns
 */

import {
  BacktestReporter,
  BacktestCase,
  BacktestReport,
} from '../src/BacktestReporter';
import { writeFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Sample Backtest Data
// ============================================================================

function generateSampleBacktestCases(): BacktestCase[] {
  const cases: BacktestCase[] = [];
  const startDate = new Date('2025-01-01');

  // Evaluator-Optimizer pattern cases
  cases.push({
    id: 'bt-001',
    timestamp: new Date(startDate.getTime() + 0 * 86400000).toISOString(),
    taskType: 'typescript-error',
    complexity: 6,
    description: 'Fix type mismatch in ReserveEngine calculateReserveStrategy',
    humanTimeMinutes: 45,
    humanCostUSD: 112.50,
    agentPattern: 'evaluator-optimizer',
    agentTimeMinutes: 8,
    agentCostUSD: 2.40,
    success: true,
    qualityScore: 92,
  });

  cases.push({
    id: 'bt-002',
    timestamp: new Date(startDate.getTime() + 1 * 86400000).toISOString(),
    taskType: 'react-component',
    complexity: 7,
    description: 'Build interactive cohort analysis dashboard component',
    humanTimeMinutes: 120,
    humanCostUSD: 300.00,
    agentPattern: 'evaluator-optimizer',
    agentTimeMinutes: 35,
    agentCostUSD: 8.50,
    success: true,
    qualityScore: 88,
  });

  cases.push({
    id: 'bt-003',
    timestamp: new Date(startDate.getTime() + 2 * 86400000).toISOString(),
    taskType: 'test-failure',
    complexity: 8,
    description: 'Fix failing Monte Carlo simulation tests',
    humanTimeMinutes: 90,
    humanCostUSD: 225.00,
    agentPattern: 'evaluator-optimizer',
    agentTimeMinutes: 15,
    agentCostUSD: 4.20,
    success: true,
    qualityScore: 95,
  });

  // Router pattern cases
  cases.push({
    id: 'bt-004',
    timestamp: new Date(startDate.getTime() + 3 * 86400000).toISOString(),
    taskType: 'performance',
    complexity: 5,
    description: 'Optimize PacingEngine calculation performance',
    humanTimeMinutes: 60,
    humanCostUSD: 150.00,
    agentPattern: 'router',
    agentTimeMinutes: 10,
    agentCostUSD: 1.80,
    success: true,
    qualityScore: 90,
    routedModel: 'gemini',
    routingAccurate: true,
  });

  cases.push({
    id: 'bt-005',
    timestamp: new Date(startDate.getTime() + 4 * 86400000).toISOString(),
    taskType: 'database-query',
    complexity: 4,
    description: 'Add index to funds table for better query performance',
    humanTimeMinutes: 30,
    humanCostUSD: 75.00,
    agentPattern: 'router',
    agentTimeMinutes: 5,
    agentCostUSD: 1.20,
    success: true,
    qualityScore: 85,
    routedModel: 'claude-sonnet',
    routingAccurate: true,
  });

  cases.push({
    id: 'bt-006',
    timestamp: new Date(startDate.getTime() + 5 * 86400000).toISOString(),
    taskType: 'api-design',
    complexity: 9,
    description: 'Design new REST API for scenario comparison',
    humanTimeMinutes: 180,
    humanCostUSD: 450.00,
    agentPattern: 'router',
    agentTimeMinutes: 40,
    agentCostUSD: 9.50,
    success: true,
    qualityScore: 87,
    routedModel: 'claude-opus',
    routingAccurate: true,
  });

  // Orchestrator pattern cases
  cases.push({
    id: 'bt-007',
    timestamp: new Date(startDate.getTime() + 6 * 86400000).toISOString(),
    taskType: 'refactoring',
    complexity: 8,
    description: 'Refactor reserve calculation logic across multiple modules',
    humanTimeMinutes: 240,
    humanCostUSD: 600.00,
    agentPattern: 'orchestrator',
    agentTimeMinutes: 55,
    agentCostUSD: 12.00,
    success: true,
    qualityScore: 91,
  });

  cases.push({
    id: 'bt-008',
    timestamp: new Date(startDate.getTime() + 7 * 86400000).toISOString(),
    taskType: 'architecture',
    complexity: 10,
    description: 'Design worker queue architecture for background calculations',
    humanTimeMinutes: 300,
    humanCostUSD: 750.00,
    agentPattern: 'orchestrator',
    agentTimeMinutes: 75,
    agentCostUSD: 18.00,
    success: true,
    qualityScore: 93,
  });

  cases.push({
    id: 'bt-009',
    timestamp: new Date(startDate.getTime() + 8 * 86400000).toISOString(),
    taskType: 'code-review',
    complexity: 7,
    description: 'Comprehensive code review of PacingEngine implementation',
    humanTimeMinutes: 120,
    humanCostUSD: 300.00,
    agentPattern: 'orchestrator',
    agentTimeMinutes: 25,
    agentCostUSD: 6.50,
    success: true,
    qualityScore: 89,
  });

  // Prompt Cache pattern cases
  cases.push({
    id: 'bt-010',
    timestamp: new Date(startDate.getTime() + 9 * 86400000).toISOString(),
    taskType: 'typescript-error',
    complexity: 3,
    description: 'Fix simple type error in fund setup form',
    humanTimeMinutes: 15,
    humanCostUSD: 37.50,
    agentPattern: 'prompt-cache',
    agentTimeMinutes: 2,
    agentCostUSD: 0.30,
    success: true,
    qualityScore: 88,
  });

  cases.push({
    id: 'bt-011',
    timestamp: new Date(startDate.getTime() + 10 * 86400000).toISOString(),
    taskType: 'react-component',
    complexity: 4,
    description: 'Add tooltip to dashboard card component',
    humanTimeMinutes: 20,
    humanCostUSD: 50.00,
    agentPattern: 'prompt-cache',
    agentTimeMinutes: 3,
    agentCostUSD: 0.45,
    success: true,
    qualityScore: 90,
  });

  cases.push({
    id: 'bt-012',
    timestamp: new Date(startDate.getTime() + 11 * 86400000).toISOString(),
    taskType: 'test-failure',
    complexity: 5,
    description: 'Fix flaky test in fund calculation suite',
    humanTimeMinutes: 40,
    humanCostUSD: 100.00,
    agentPattern: 'prompt-cache',
    agentTimeMinutes: 6,
    agentCostUSD: 1.10,
    success: true,
    qualityScore: 85,
  });

  // Mixed failures to show realistic scenarios
  cases.push({
    id: 'bt-013',
    timestamp: new Date(startDate.getTime() + 12 * 86400000).toISOString(),
    taskType: 'debugging',
    complexity: 9,
    description: 'Debug complex race condition in BullMQ worker',
    humanTimeMinutes: 180,
    humanCostUSD: 450.00,
    agentPattern: 'router',
    agentTimeMinutes: 45,
    agentCostUSD: 10.00,
    success: false,
    qualityScore: 0,
    failureReason: 'Complex concurrency issue beyond agent capability',
    routedModel: 'grok',
    routingAccurate: true,
  });

  cases.push({
    id: 'bt-014',
    timestamp: new Date(startDate.getTime() + 13 * 86400000).toISOString(),
    taskType: 'performance',
    complexity: 6,
    description: 'Optimize React component re-renders',
    humanTimeMinutes: 75,
    humanCostUSD: 187.50,
    agentPattern: 'evaluator-optimizer',
    agentTimeMinutes: 20,
    agentCostUSD: 5.00,
    success: false,
    qualityScore: 0,
    failureReason: 'Incomplete optimization, missed key bottleneck',
  });

  cases.push({
    id: 'bt-015',
    timestamp: new Date(startDate.getTime() + 14 * 86400000).toISOString(),
    taskType: 'typescript-error',
    complexity: 7,
    description: 'Fix complex generic type constraints in engine abstraction',
    humanTimeMinutes: 60,
    humanCostUSD: 150.00,
    agentPattern: 'router',
    agentTimeMinutes: 12,
    agentCostUSD: 3.20,
    success: true,
    qualityScore: 82,
    routedModel: 'deepseek',
    routingAccurate: true,
  });

  // Additional successful cases for better statistics
  for (let i = 16; i <= 25; i++) {
    const dayOffset = i - 1;
    const patterns: Array<{ pattern: 'evaluator-optimizer' | 'router' | 'orchestrator' | 'prompt-cache'; taskType: 'typescript-error' | 'react-component' | 'test-failure' | 'performance' }> = [
      { pattern: 'evaluator-optimizer', taskType: 'typescript-error' },
      { pattern: 'router', taskType: 'react-component' },
      { pattern: 'orchestrator', taskType: 'test-failure' },
      { pattern: 'prompt-cache', taskType: 'performance' },
    ];
    const config = patterns[i % 4];

    cases.push({
      id: `bt-${i.toString().padStart(3, '0')}`,
      timestamp: new Date(startDate.getTime() + dayOffset * 86400000).toISOString(),
      taskType: config.taskType,
      complexity: 4 + (i % 5),
      description: `Task ${i}: Various fixes and improvements`,
      humanTimeMinutes: 30 + (i % 6) * 15,
      humanCostUSD: (30 + (i % 6) * 15) * 2.5,
      agentPattern: config.pattern,
      agentTimeMinutes: 5 + (i % 4) * 3,
      agentCostUSD: 1.0 + (i % 4) * 0.8,
      success: i % 10 !== 0, // 10% failure rate
      qualityScore: i % 10 !== 0 ? 80 + (i % 15) : 0,
      failureReason: i % 10 === 0 ? 'Edge case not handled' : undefined,
      routedModel: config.pattern === 'router' ? 'claude-sonnet' : undefined,
      routingAccurate: config.pattern === 'router' ? i % 8 !== 0 : undefined, // 12.5% routing errors
    });
  }

  return cases;
}

// ============================================================================
// Main Example
// ============================================================================

async function runBacktestExample() {
  console.log('🔍 Agent Backtest Reporter - Example\n');

  // 1. Generate sample backtest data
  console.log('Generating sample backtest cases...');
  const cases = generateSampleBacktestCases();
  console.log(`✅ Generated ${cases.length} backtest cases\n`);

  // 2. Create reporter instance
  const reporter = new BacktestReporter();

  // 3. Generate comprehensive report
  console.log('Generating comprehensive report...');
  const developmentTimeHours = 40; // Invested 40 hours building agent system
  const report = reporter.generateReport(cases, developmentTimeHours);
  console.log('✅ Report generated\n');

  // 4. Generate all output formats
  const outputDir = join(__dirname, '..', 'reports');

  // Markdown report
  const markdownReport = reporter.generateMarkdownReport(report);
  console.log('📄 Markdown report preview (first 500 chars):');
  console.log(markdownReport.substring(0, 500) + '...\n');

  // JSON report
  const jsonReport = reporter.generateJSONReport(report);
  console.log('📊 JSON report size:', (jsonReport.length / 1024).toFixed(2), 'KB\n');

  // Executive summary
  const execSummary = reporter.generateExecutiveSummary(report);
  console.log('📋 Executive Summary:\n');
  console.log(execSummary);
  console.log('\n');

  // 5. Display key metrics
  console.log('Key Insights:');
  console.log(`  • Success Rate: ${report.summary.successRate.toFixed(1)}%`);
  console.log(`  • Quality Score: ${report.summary.avgQualityScore.toFixed(1)}/100`);
  console.log(`  • Speed Improvement: ${report.summary.avgSpeedup.toFixed(1)}x faster`);
  console.log(`  • Cost Savings: $${report.summary.totalCostSavingsUSD.toFixed(2)}`);
  console.log(`  • Time Savings: ${report.summary.totalTimeSavingsHours.toFixed(1)} hours`);
  console.log(`  • ROI: ${report.summary.annualizedROI.toFixed(0)}%`);
  console.log(`  • Break-Even: ${report.summary.breakEvenCases} cases (${report.summary.totalCases >= report.summary.breakEvenCases ? 'ACHIEVED' : 'pending'})`);
  console.log('');

  // 6. Pattern breakdown
  console.log('Pattern Performance:');
  for (const [pattern, metrics] of Object.entries(report.patternAnalysis)) {
    if (metrics.totalCases === 0) continue;
    console.log(`  ${pattern}:`);
    console.log(`    - ${metrics.totalCases} cases, ${metrics.successRate.toFixed(1)}% success`);
    console.log(`    - ${metrics.avgSpeedup.toFixed(1)}x speedup, $${metrics.totalCostSavings.toFixed(2)} saved`);
    if (metrics.routingAccuracy !== undefined) {
      console.log(`    - ${metrics.routingAccuracy.toFixed(1)}% routing accuracy`);
    }
  }
  console.log('');

  // 7. Show chart data samples
  console.log('Chart Data Available:');
  console.log(`  ✓ Success Rate by Pattern (${report.charts.successRateByPattern.data.length} bars)`);
  console.log(`  ✓ Cost Savings Over Time (${report.charts.costSavingsOverTime.series[0].data.length} data points)`);
  console.log(`  ✓ Quality Distribution (${report.charts.qualityDistribution.bins.length} bins)`);
  console.log(`  ✓ Router Accuracy (${report.charts.routerAccuracyByTaskType.data.length} segments)`);
  console.log(`  ✓ Speedup Comparison (${report.charts.speedupComparison.data.length} bars)`);
  console.log(`  ✓ Pattern Usage (${report.charts.patternUsage.data.length} segments)`);
  console.log('');

  // 8. Display recommendations
  console.log('Top Recommendations:');
  report.recommendations.slice(0, 3).forEach((rec, i) => {
    console.log(`  ${i + 1}. ${rec}`);
  });
  console.log('');

  // 9. Save reports (commented out - would write to files)
  console.log('💾 To save reports, uncomment writeFileSync calls in example code');
  console.log(`   Would save to: ${outputDir}/`);
  console.log('   - backtest-report.md');
  console.log('   - backtest-report.json');
  console.log('   - backtest-summary.txt');
  console.log('');

  /*
  // Uncomment to actually save files:
  import { mkdirSync } from 'fs';
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(
    join(outputDir, 'backtest-report.md'),
    markdownReport
  );

  writeFileSync(
    join(outputDir, 'backtest-report.json'),
    jsonReport
  );

  writeFileSync(
    join(outputDir, 'backtest-summary.txt'),
    execSummary
  );

  console.log('✅ Reports saved successfully!');
  */

  console.log('✨ Example complete!\n');
}

// Run if executed directly
if (require.main === module) {
  runBacktestExample().catch(console.error);
}

export { runBacktestExample, generateSampleBacktestCases };
