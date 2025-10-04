/**
 * Core types for the AI Agent Backtesting Framework
 */

import type { AIModel } from '@povc/agent-core';

// ============================================================================
// Historical Test Cases
// ============================================================================

export type TestCategory = 'test-failure' | 'type-error' | 'bug-fix' | 'performance-regression';

export interface HistoricalTestCase {
  id: string;
  commitHash: string;
  parentHash: string;
  timestamp: Date;
  category: TestCategory;

  // Problem state (at parent commit)
  problemFiles: string[];
  errorMessage: string;
  failingTests?: string[];

  // Solution state (at commit)
  fixFiles: string[];
  humanFixDiff: string;
  fixDescription: string;

  // Metadata
  author: string;
  prNumber?: number;
  iterationCount?: number; // From PR commits

  // Difficulty scoring
  complexity: number; // 1-10 scale
  filesChanged: number;
  linesChanged: number;
}

// ============================================================================
// Detected Failures
// ============================================================================

export type FailureType = 'test' | 'compile' | 'runtime' | 'build';

export interface DetectedFailure {
  type: FailureType;
  file: string;
  line?: number;
  column?: number;
  message: string;
  stackTrace?: string;
  category: 'syntax' | 'runtime' | 'assertion' | 'timeout';
}

// ============================================================================
// Agent Execution Results
// ============================================================================

export type AgentPattern = 'evaluator-optimizer' | 'prompt-cache' | 'router' | 'orchestrator';
export type SolutionApproach = 'same' | 'different' | 'better' | 'worse';

export interface AgentRunResult {
  agentName: string;
  agentPattern: AgentPattern;
  testCaseId: string;

  // Execution metrics
  startTime: Date;
  endTime: Date;
  duration: number;
  iterations: number;

  // Agent output
  proposedFix: string;
  fixFiles: string[];
  fixStrategy: string;

  // Quality metrics
  success: boolean;
  testsPass: boolean;
  noRegressions: boolean;

  // Comparison with human fix
  similarityScore: number; // 0-1, how similar to human fix
  approach: SolutionApproach;

  // Cost metrics
  apiCalls: number;
  tokensUsed: number;
  estimatedCost: number;
  cacheHits?: number;

  // Routing decisions (if using Router)
  routingDecisions?: Array<{
    task: string;
    model: AIModel;
    reason: string;
  }>;

  // Orchestrator subtasks (if using Orchestrator)
  subtasks?: Array<{
    id: string;
    description: string;
    worker: AIModel;
    status: 'completed' | 'failed';
  }>;
}

// ============================================================================
// Comparison Metrics
// ============================================================================

export interface ComparisonMetrics {
  // Speed
  timeVsHuman: number; // Negative = faster, positive = slower (in seconds)

  // Cost
  costVsHuman: number; // Human cost estimate vs API cost

  // Quality
  solutionQuality: SolutionApproach;

  // Approach
  strategyMatch: boolean; // Did agent use same strategy as human?
  strategyEffectiveness: number; // 0-1
}

// ============================================================================
// Backtest Configuration
// ============================================================================

export interface BacktestConfig {
  // Time range
  since?: Date;
  until?: Date;

  // Filtering
  categories?: TestCategory[];
  minComplexity?: number;
  maxComplexity?: number;
  maxCases?: number;

  // Agent patterns to test
  patterns: AgentPattern[];

  // Execution
  parallel?: boolean;
  maxParallel?: number;
  timeout?: number;

  // Output
  outputDir: string;
  generateReport: boolean;
  saveResults?: boolean;

  // Budget
  maxCost?: number;
  stopOnBudget?: boolean;
}

// ============================================================================
// Backtest Metrics
// ============================================================================

export interface PatternMetrics {
  successRate: number;
  averageDuration: number;
  averageCost: number;
  averageIterations: number;
  cacheEffectiveness?: number; // For PromptCache pattern
}

export interface CategoryMetrics {
  totalCases: number;
  successRate: number;
  averageDuration: number;
}

export interface ComplexityMetrics {
  totalCases: number;
  successRate: number;
  averageDuration: number;
}

export interface RoutingMetrics {
  modelDistribution: Record<AIModel, number>;
  correctRoutes: number;
  incorrectRoutes: number;
  averageConfidence: number;
}

export interface HumanComparisonMetrics {
  fasterThanHuman: number; // Cases where agent was faster
  slowerThanHuman: number;
  sameSolution: number; // Cases where solution matched
  betterSolution: number; // Cases where agent improved on human fix
  worseSolution: number;
  averageSpeedup: number; // Average time savings vs human
}

export interface BacktestMetrics {
  // Overall metrics
  runId: string;
  timestamp: Date;
  totalTestCases: number;
  successRate: number;
  averageDuration: number;
  totalCost: number;

  // By agent pattern
  byPattern: Record<AgentPattern, PatternMetrics>;

  // By problem category
  byCategory: Record<TestCategory, CategoryMetrics>;

  // By complexity
  byComplexity: Record<'simple' | 'medium' | 'hard', ComplexityMetrics>;

  // Routing effectiveness (Router pattern)
  routingMetrics?: RoutingMetrics;

  // Comparison with human fixes
  humanComparison: HumanComparisonMetrics;

  // Results breakdown
  results: AgentRunResult[];
  testCases: HistoricalTestCase[];
}

// ============================================================================
// Pattern Comparison
// ============================================================================

export interface PatternComparison {
  testCases: HistoricalTestCase[];
  patterns: AgentPattern[];

  // Results by pattern
  resultsByPattern: Record<AgentPattern, AgentRunResult[]>;

  // Winner for each category
  bestForTestFailures: AgentPattern;
  bestForTypeErrors: AgentPattern;
  bestForBugFixes: AgentPattern;
  bestForPerformance: AgentPattern;

  // Overall winner
  mostCostEffective: AgentPattern;
  fastest: AgentPattern;
  mostAccurate: AgentPattern;

  // Detailed comparison
  comparison: Array<{
    testCaseId: string;
    category: TestCategory;
    complexity: number;
    results: Record<AgentPattern, {
      success: boolean;
      duration: number;
      cost: number;
      similarity: number;
    }>;
    winner: AgentPattern;
    reasoning: string;
  }>;
}

// ============================================================================
// Extraction Configuration
// ============================================================================

export interface ExtractionConfig {
  repoPath: string;
  since?: Date;
  until?: Date;
  categories?: TestCategory[];
  minComplexity?: number;
  maxComplexity?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

// ============================================================================
// Report Configuration
// ============================================================================

export type ReportFormat = 'json' | 'markdown' | 'html' | 'csv';

export interface ReportConfig {
  format: ReportFormat;
  outputPath: string;
  includeCharts?: boolean;
  includeRawData?: boolean;
  template?: string;
}

// ============================================================================
// Git State Management
// ============================================================================

export interface GitState {
  originalBranch: string;
  hasUncommittedChanges: boolean;
  stashId?: string;
  backtestBranch?: string;
}

export interface GitCheckoutOptions {
  commitHash: string;
  createBranch?: boolean;
  branchName?: string;
}

// ============================================================================
// Analysis Results
// ============================================================================

export interface TrendAnalysis {
  period: 'daily' | 'weekly' | 'monthly';
  dataPoints: Array<{
    date: Date;
    successRate: number;
    averageDuration: number;
    averageCost: number;
    totalCases: number;
  }>;

  // Trends
  successRateTrend: 'improving' | 'stable' | 'degrading';
  costTrend: 'increasing' | 'stable' | 'decreasing';
  durationTrend: 'slower' | 'stable' | 'faster';

  // Predictions
  predictedSuccessRate?: number;
  predictedCost?: number;
  predictedDuration?: number;
}

export interface RecommendationResult {
  category: TestCategory;
  recommendedPattern: AgentPattern;
  confidence: number;
  reasoning: string;
  expectedSuccessRate: number;
  expectedCost: number;
  expectedDuration: number;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface DiffChange {
  type: 'add' | 'remove' | 'modify';
  file: string;
  oldContent?: string;
  newContent?: string;
  lineNumber?: number;
}

export interface SimilarityResult {
  score: number; // 0-1
  matchingLines: number;
  totalLines: number;
  approach: SolutionApproach;
  differences: DiffChange[];
}

export interface ComplexityFactors {
  filesChanged: number;
  linesChanged: number;
  hasTypeErrors: boolean;
  hasMultipleIterations: boolean;
  cyclomaticComplexity?: number;
  dependencyCount?: number;
}
