/**
 * AI Agent Backtesting Framework
 *
 * Test AI agents against historical git failures to measure performance,
 * optimize routing, and achieve 85%+ success rates.
 *
 * @example
 * ```typescript
 * import { BacktestOrchestrator } from '@povc/backtest-framework';
 *
 * const orchestrator = new BacktestOrchestrator();
 *
 * const metrics = await orchestrator.runBacktest({
 *   since: new Date('2025-09-01'),
 *   categories: ['test-failure', 'type-error'],
 *   patterns: ['router', 'evaluator-optimizer'],
 *   maxCases: 50
 * });
 *
 * console.log(`Success rate: ${metrics.successRate * 100}%`);
 * ```
 */

// Core types
export * from './types';

// Main components
export { GitHistoryAnalyzer } from './GitHistoryAnalyzer';
export { FailureDetector } from './FailureDetector';
export { AgentRunner } from './AgentRunner';
export { GitStateManager } from './GitStateManager';
export { MetricsCollector } from './MetricsCollector';
export { BacktestOrchestrator } from './BacktestOrchestrator';

// Reporters
export { MarkdownReporter } from './reporters/MarkdownReporter';
export { HTMLReporter } from './reporters/HTMLReporter';
export { JSONReporter } from './reporters/JSONReporter';
export { CSVReporter } from './reporters/CSVReporter';

// Utilities
export { calculateSimilarity } from './utils/similarityCalculator';
export { calculateComplexity } from './utils/complexityAnalyzer';
export { parseDiff } from './utils/diffUtils';

// Helper functions
export { createBacktestConfig, validateConfig } from './utils/configHelpers';
export { extractTestCases, filterTestCases } from './utils/testCaseHelpers';

// Constants
export const DEFAULT_CONFIG = {
  maxCases: 100,
  parallel: true,
  maxParallel: 3,
  timeout: 180000, // 3 minutes
  minComplexity: 1,
  maxComplexity: 10,
  generateReport: true,
};

export const AGENT_PATTERNS = [
  'evaluator-optimizer',
  'prompt-cache',
  'router',
  'orchestrator',
] as const;

export const TEST_CATEGORIES = [
  'test-failure',
  'type-error',
  'bug-fix',
  'performance-regression',
] as const;
