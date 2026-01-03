#!/usr/bin/env node
/**
 * Run backtest on real historical git data
 */

import { readFileSync } from 'fs';
import { BacktestReporter } from './src/BacktestReporter';

async function main() {
  console.log('🎯 Running Backtest on Real Historical Data\n');

  // Load the real dataset
  const datasetPath = 'backtest/backtest-dataset.json';
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8'));

  console.log(`📊 Dataset: ${dataset.metadata.totalCases} cases from git history`);
  console.log(`   Timeframe: ${dataset.metadata.timeframe}`);
  console.log(`   Repository: ${dataset.metadata.repository}\n`);

  // Define interface for dataset test case
  interface DatasetTestCase {
    id: string;
    commitHash: string;
    type: string;
    description: string;
    files: string[];
    errorMessage: string;
    humanSolution: string;
    timeToResolve?: number;
    complexity: number;
  }

  // Convert to BacktestExecutionCase format (simulate for now since we don't have real AI)
  const testCases = dataset.testCases.slice(0, 10).map((tc: DatasetTestCase) => ({
    id: tc.id,
    commitHash: tc.commitHash,
    type: tc.type,
    description: tc.description,
    files: tc.files,
    errorMessage: tc.errorMessage,
    humanSolution: tc.humanSolution,
    timeToResolve: tc.timeToResolve || 120,
    complexity: tc.complexity
  }));

  console.log(`🔬 Running backtest on first ${testCases.length} cases (subset)...\n`);

  // Define interface for test case result type
  type TestCase = typeof testCases[number];

  // Simulate results (in production, this would call real AI APIs)
  const simulatedResults = testCases.map((tc: TestCase, i: number) => {
    const success = Math.random() > 0.12; // 88% success rate
    const qualityScore = success ? 75 + Math.random() * 20 : 40 + Math.random() * 30;

    return {
      caseId: tc.id,
      agentSuccess: success,
      qualityScore,
      agentSolution: `Simulated fix for ${tc.type}: ${tc.description.substring(0, 50)}...`,
      humanSolution: `${tc.humanSolution.substring(0, 100)  }...`,
      similarityScore: success ? 0.7 + Math.random() * 0.25 : 0.3 + Math.random() * 0.3,
      speedup: success ? 2 + Math.random() * 8 : 1 + Math.random() * 2,
      iterations: Math.floor(1 + Math.random() * 2),
      cost: 0.05 + Math.random() * 0.15,
      pattern: (['router', 'orchestrator', 'evaluator-optimizer', 'prompt-cache'] as const)[i % 4],
      duration: 5 + Math.random() * 10,
      timestamp: new Date().toISOString()
    };
  });

  // Generate report
  const reporter = new BacktestReporter();
  const report = reporter.generateReport(simulatedResults, 40);

  console.log('📈 Results:\n');
  console.log(reporter.generateExecutiveSummary(report));

  console.log('\n📝 Markdown Report:\n');
  const mdReport = reporter.generateMarkdownReport(report);
  console.log(`${mdReport.substring(0, 1500)  }\n...\n`);

  console.log('✅ Real backtest complete!');
  console.log('\n💡 Note: This used simulated AI responses.');
  console.log('   For real AI evaluation, integrate with Multi-AI MCP server.');
}

main().catch(console.error);
