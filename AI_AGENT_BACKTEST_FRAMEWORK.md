# AI Agent Backtesting Framework Design

## Executive Summary

A comprehensive framework to evaluate AI agent performance using historical git data. This system replays past failures, measures agent effectiveness against human fixes, and provides quantitative metrics for continuous improvement of the 4 agent patterns: Evaluator-Optimizer, PromptCache, Router, and Orchestrator.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Backtest Orchestrator                        │
│  - Coordinates test execution across historical commits         │
│  - Manages git state replay and cleanup                         │
│  - Aggregates results and generates reports                     │
└────────────────┬────────────────────────────────────────────────┘
                 │
    ┌────────────┼────────────┬──────────────┬─────────────┐
    │            │            │              │             │
┌───▼────┐  ┌───▼────┐  ┌───▼─────┐  ┌─────▼─────┐  ┌───▼────┐
│  Git   │  │ Test   │  │  Agent  │  │  Metrics  │  │ Report │
│History │  │Failure │  │ Runner  │  │Collector  │  │Generator│
│Analyzer│  │Detector│  │         │  │           │  │         │
└────────┘  └────────┘  └─────────┘  └───────────┘  └────────┘
```

## Core Components

### 1. Git History Analyzer

**Purpose**: Mine git history for backtestable scenarios

**Location**: `packages/backtest-framework/src/GitHistoryAnalyzer.ts`

```typescript
export interface HistoricalTestCase {
  id: string;
  commitHash: string;
  parentHash: string;
  timestamp: Date;
  category: 'test-failure' | 'type-error' | 'bug-fix' | 'performance-regression';

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

export class GitHistoryAnalyzer {
  async scanForTestCases(options: {
    since?: Date;
    until?: Date;
    categories?: HistoricalTestCase['category'][];
    minComplexity?: number;
  }): Promise<HistoricalTestCase[]>;

  async extractTestFailures(commitRange: string): Promise<HistoricalTestCase[]>;

  async extractTypeScriptErrors(commitRange: string): Promise<HistoricalTestCase[]>;

  async extractBugFixes(commitRange: string): Promise<HistoricalTestCase[]>;

  async extractPerformanceRegressions(commitRange: string): Promise<HistoricalTestCase[]>;

  private parseCommitMessage(message: string): {
    type: string;
    scope?: string;
    breaking: boolean;
    fixes?: string[];
  };

  private calculateComplexity(diff: string): number;

  private extractIterationCount(prNumber: number): Promise<number>;
}
```

**Git Patterns to Detect**:

1. **Test Failures**:
   - Commit messages: `fix.*test`, `test.*fix`, `test.*fail`
   - Files changed: `tests/**/*.test.ts`, `tests/**/*.spec.ts`
   - Pattern: Parent commit has failing tests, fix commit makes them pass

2. **TypeScript Errors**:
   - Commit messages: `fix.*ts`, `fix.*type`, `resolve.*error`
   - Files changed: `*.ts`, `*.tsx`
   - Pattern: Parent commit has TS errors, fix commit resolves them

3. **Bug Fixes**:
   - Commit messages: `fix:`, `bug:`, `hotfix:`
   - Pattern: Issue reference in commit message
   - Has associated tests added/modified

4. **Performance Regressions**:
   - Commit messages: `perf:`, `optimize:`, `performance`
   - Files changed: Core engine files
   - Pattern: Benchmark data shows improvement

### 2. Test Failure Detector

**Purpose**: Identify and classify failures at historical commits

**Location**: `packages/backtest-framework/src/FailureDetector.ts`

```typescript
export interface DetectedFailure {
  type: 'test' | 'compile' | 'runtime' | 'build';
  file: string;
  line?: number;
  column?: number;
  message: string;
  stackTrace?: string;
  category: TestFailure['type']; // From TestRepairAgent
}

export class FailureDetector {
  async detectAtCommit(commitHash: string): Promise<DetectedFailure[]>;

  // Run tests and capture failures
  private async runTests(commitHash: string): Promise<DetectedFailure[]>;

  // Run TypeScript compiler and capture errors
  private async runTypeCheck(commitHash: string): Promise<DetectedFailure[]>;

  // Run build and capture errors
  private async runBuild(commitHash: string): Promise<DetectedFailure[]>;

  // Parse output to extract failures
  private parseTestOutput(output: string): DetectedFailure[];
  private parseTypeScriptOutput(output: string): DetectedFailure[];
  private parseBuildOutput(output: string): DetectedFailure[];
}
```

### 3. Agent Runner

**Purpose**: Execute AI agents against historical failures

**Location**: `packages/backtest-framework/src/AgentRunner.ts`

```typescript
export interface AgentRunResult {
  agentName: string;
  agentPattern: 'evaluator-optimizer' | 'prompt-cache' | 'router' | 'orchestrator';
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
  approach: 'same' | 'different' | 'better' | 'worse';

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
}

export class AgentRunner {
  constructor(
    private testRepairAgent: TestRepairAgent,
    private router: AIRouter,
    private orchestrator: Orchestrator,
    private promptCache: PromptCache
  ) {}

  async runAgentOnCase(
    testCase: HistoricalTestCase,
    agentPattern: AgentRunResult['agentPattern']
  ): Promise<AgentRunResult>;

  // Run with Evaluator-Optimizer pattern
  private async runEvaluatorOptimizer(
    testCase: HistoricalTestCase
  ): Promise<AgentRunResult>;

  // Run with PromptCache optimization
  private async runWithPromptCache(
    testCase: HistoricalTestCase
  ): Promise<AgentRunResult>;

  // Run with Router pattern
  private async runWithRouter(
    testCase: HistoricalTestCase
  ): Promise<AgentRunResult>;

  // Run with Orchestrator pattern
  private async runWithOrchestrator(
    testCase: HistoricalTestCase
  ): Promise<AgentRunResult>;

  // Calculate similarity between agent fix and human fix
  private calculateSimilarity(
    agentFix: string,
    humanFix: string
  ): number;
}
```

### 4. Git State Manager

**Purpose**: Safely replay and restore git state

**Location**: `packages/backtest-framework/src/GitStateManager.ts`

```typescript
export class GitStateManager {
  private originalBranch: string;
  private stashId?: string;

  async saveCurrentState(): Promise<void>;

  async checkoutCommit(commitHash: string): Promise<void>;

  async applyAgentFix(fix: string, files: string[]): Promise<void>;

  async restoreOriginalState(): Promise<void>;

  async createBacktestBranch(testCaseId: string): Promise<string>;

  async cleanup(): Promise<void>;
}
```

### 5. Metrics Collector

**Purpose**: Aggregate and analyze backtest results

**Location**: `packages/backtest-framework/src/MetricsCollector.ts`

```typescript
export interface BacktestMetrics {
  // Overall metrics
  totalTestCases: number;
  successRate: number;
  averageDuration: number;
  totalCost: number;

  // By agent pattern
  byPattern: Record<AgentRunResult['agentPattern'], {
    successRate: number;
    averageDuration: number;
    averageCost: number;
    averageIterations: number;
    cacheEffectiveness?: number; // For PromptCache pattern
  }>;

  // By problem category
  byCategory: Record<HistoricalTestCase['category'], {
    totalCases: number;
    successRate: number;
    averageDuration: number;
  }>;

  // By complexity
  byComplexity: Record<'simple' | 'medium' | 'hard', {
    totalCases: number;
    successRate: number;
    averageDuration: number;
  }>;

  // Routing effectiveness (Router pattern)
  routingMetrics?: {
    modelDistribution: Record<AIModel, number>;
    correctRoutes: number;
    incorrectRoutes: number;
  };

  // Comparison with human fixes
  humanComparison: {
    fasterThanHuman: number; // Cases where agent was faster
    slowerThanHuman: number;
    sameSolution: number; // Cases where solution matched
    betterSolution: number; // Cases where agent improved on human fix
    worseSolution: number;
  };
}

export class MetricsCollector {
  private results: AgentRunResult[] = [];
  private testCases: HistoricalTestCase[] = [];

  addResult(result: AgentRunResult, testCase: HistoricalTestCase): void;

  calculateMetrics(): BacktestMetrics;

  generateReport(format: 'json' | 'markdown' | 'html'): string;

  exportToCSV(filename: string): void;

  // Compare different agent patterns
  comparePatterns(): {
    bestForTestFailures: AgentRunResult['agentPattern'];
    bestForTypeErrors: AgentRunResult['agentPattern'];
    bestForBugFixes: AgentRunResult['agentPattern'];
    mostCostEffective: AgentRunResult['agentPattern'];
    fastest: AgentRunResult['agentPattern'];
  };
}
```

### 6. Backtest Orchestrator

**Purpose**: Main entry point and coordination

**Location**: `packages/backtest-framework/src/BacktestOrchestrator.ts`

```typescript
export interface BacktestConfig {
  // Time range
  since?: Date;
  until?: Date;

  // Filtering
  categories?: HistoricalTestCase['category'][];
  minComplexity?: number;
  maxComplexity?: number;
  maxCases?: number;

  // Agent patterns to test
  patterns: AgentRunResult['agentPattern'][];

  // Execution
  parallel?: boolean;
  maxParallel?: number;
  timeout?: number;

  // Output
  outputDir: string;
  generateReport: boolean;
  saveResults: boolean;
}

export class BacktestOrchestrator {
  constructor(
    private historyAnalyzer: GitHistoryAnalyzer,
    private failureDetector: FailureDetector,
    private agentRunner: AgentRunner,
    private stateManager: GitStateManager,
    private metricsCollector: MetricsCollector
  ) {}

  async runBacktest(config: BacktestConfig): Promise<BacktestMetrics>;

  private async executeTestCase(
    testCase: HistoricalTestCase,
    patterns: AgentRunResult['agentPattern'][]
  ): Promise<AgentRunResult[]>;

  private async validateAgentFix(
    fix: string,
    testCase: HistoricalTestCase
  ): Promise<boolean>;

  async generateReport(metrics: BacktestMetrics): Promise<void>;

  async exportResults(results: AgentRunResult[]): Promise<void>;
}
```

## Data Collection Strategy

### Phase 1: Historical Mining (Weeks 1-2)

1. **Scan git history for patterns**:
   ```bash
   # Test failures
   git log --grep="fix.*test" --grep="test.*fail" -i --since="2025-09-01"

   # TypeScript errors
   git log --grep="fix.*ts" --grep="type.*error" -i --since="2025-09-01"

   # Bug fixes with PR references
   git log --grep="fix:" --since="2025-09-01" --format="%H|%s|%b"
   ```

2. **Extract test cases**:
   - Minimum 50 test cases per category
   - Complexity distribution: 30% simple, 50% medium, 20% hard
   - Focus on recent failures (last 3 months) for relevance

3. **Categorize by difficulty**:
   ```typescript
   const complexityScore =
     (filesChanged * 2) +
     (linesChanged / 10) +
     (hasTypeErrors ? 3 : 0) +
     (hasMultipleIterations ? 2 : 0);

   // 1-3: Simple
   // 4-7: Medium
   // 8-10: Hard
   ```

### Phase 2: Baseline Establishment (Week 3)

1. **Run agents without history** (control group):
   - Generate synthetic failures
   - Measure base performance

2. **Run agents on historical cases**:
   - Measure performance vs human fixes
   - Identify pattern strengths/weaknesses

3. **Calibrate routing decisions**:
   - Analyze which models work best for which problems
   - Update Router pattern accordingly

### Phase 3: Continuous Validation (Ongoing)

1. **Weekly backtest runs**:
   - New commits become test cases
   - Track improvement over time

2. **A/B testing**:
   - Compare old vs new agent versions
   - Measure regression/improvement

## Evaluation Metrics

### Success Metrics

1. **Correctness** (Primary):
   - ✅ Tests pass after agent fix
   - ✅ No new failures introduced
   - ✅ TypeScript compiles cleanly

2. **Quality** (Secondary):
   - Similarity to human fix (0-1 score)
   - Follows code conventions
   - Maintainability score

3. **Efficiency** (Tertiary):
   - Time to fix (vs human)
   - Cost per fix (API tokens)
   - Iterations needed

### Comparison Metrics

```typescript
interface ComparisonMetrics {
  // Speed
  timeVsHuman: number; // Negative = faster, positive = slower

  // Cost
  costVsHuman: number; // Estimated human hours * rate vs API cost

  // Quality
  solutionQuality: 'better' | 'same' | 'worse';

  // Approach
  strategyMatch: boolean; // Did agent use same strategy as human?
  strategyEffectiveness: number; // 0-1
}
```

### Pattern-Specific Metrics

1. **Evaluator-Optimizer**:
   - Average iterations to success
   - Improvement per iteration
   - Convergence rate

2. **PromptCache**:
   - Cache hit rate
   - Token savings
   - Latency reduction

3. **Router**:
   - Routing accuracy (correct model chosen)
   - Model utilization distribution
   - Cost optimization effectiveness

4. **Orchestrator**:
   - Subtask decomposition quality
   - Parallel execution efficiency
   - Worker coordination effectiveness

## Implementation Plan

### File Structure

```
packages/backtest-framework/
├── src/
│   ├── GitHistoryAnalyzer.ts
│   ├── FailureDetector.ts
│   ├── AgentRunner.ts
│   ├── GitStateManager.ts
│   ├── MetricsCollector.ts
│   ├── BacktestOrchestrator.ts
│   ├── reporters/
│   │   ├── MarkdownReporter.ts
│   │   ├── HTMLReporter.ts
│   │   └── JSONReporter.ts
│   ├── utils/
│   │   ├── diffUtils.ts
│   │   ├── similarityCalculator.ts
│   │   └── complexityAnalyzer.ts
│   └── __tests__/
│       ├── GitHistoryAnalyzer.test.ts
│       ├── FailureDetector.test.ts
│       └── AgentRunner.test.ts
├── examples/
│   ├── basic-backtest.ts
│   ├── pattern-comparison.ts
│   └── continuous-validation.ts
├── templates/
│   ├── report-template.md
│   └── metrics-dashboard.html
├── package.json
├── tsconfig.json
└── README.md

backtest-results/
├── test-cases/           # Extracted historical cases
│   ├── test-failures/
│   ├── type-errors/
│   ├── bug-fixes/
│   └── performance/
├── runs/                 # Backtest execution results
│   ├── 2025-10-03-run-1/
│   │   ├── results.json
│   │   ├── metrics.json
│   │   └── report.md
│   └── 2025-10-04-run-2/
└── analysis/            # Aggregated analysis
    ├── pattern-comparison.csv
    ├── trend-analysis.json
    └── recommendations.md
```

### Key Interfaces

```typescript
// Main entry point
export interface BacktestFramework {
  // Extract historical test cases
  extractTestCases(config: ExtractionConfig): Promise<HistoricalTestCase[]>;

  // Run backtest
  runBacktest(config: BacktestConfig): Promise<BacktestMetrics>;

  // Compare patterns
  comparePatterns(
    testCases: HistoricalTestCase[],
    patterns: AgentRunResult['agentPattern'][]
  ): Promise<PatternComparison>;

  // Generate reports
  generateReport(
    metrics: BacktestMetrics,
    format: ReportFormat
  ): Promise<string>;
}

// Execution flow
export interface ExecutionFlow {
  // 1. Save current state
  saveState(): Promise<void>;

  // 2. Checkout historical commit (parent of fix)
  checkoutProblemState(commitHash: string): Promise<void>;

  // 3. Detect failures
  detectFailures(): Promise<DetectedFailure[]>;

  // 4. Run agent
  runAgent(pattern: string): Promise<AgentRunResult>;

  // 5. Apply fix
  applyFix(result: AgentRunResult): Promise<void>;

  // 6. Validate
  validateFix(): Promise<boolean>;

  // 7. Compare with human fix
  compareWithHuman(humanCommit: string): Promise<ComparisonMetrics>;

  // 8. Restore state
  restoreState(): Promise<void>;
}
```

### Integration with Existing Agents

```typescript
// Extend TestRepairAgent for backtesting
export class BacktestableTestRepairAgent extends TestRepairAgent {
  async runInBacktestMode(
    testCase: HistoricalTestCase
  ): Promise<AgentRunResult> {
    const startTime = Date.now();

    // Convert historical case to RepairInput
    const input: RepairInput = {
      projectRoot: process.cwd(),
      testPattern: testCase.failingTests?.join('|'),
      maxRepairs: 5,
      draftPR: false
    };

    // Run with tracking
    const result = await this.execute(input);

    // Build backtest result
    return {
      agentName: 'test-repair-agent',
      agentPattern: 'evaluator-optimizer',
      testCaseId: testCase.id,
      duration: Date.now() - startTime,
      // ... map other fields
    };
  }
}

// Router integration
export class BacktestableRouter extends AIRouter {
  private backtestMetrics: RouterBacktestMetrics;

  routeWithTracking(task: Task): RoutingDecision {
    const decision = super.route(task);

    // Track decision for analysis
    this.backtestMetrics.recordDecision(task, decision);

    return decision;
  }

  getBacktestMetrics(): RouterBacktestMetrics {
    return this.backtestMetrics;
  }
}
```

## Execution Flow

### Standard Backtest Run

```typescript
// Example: Run backtest on test failures from last month
const orchestrator = new BacktestOrchestrator(/* deps */);

const config: BacktestConfig = {
  since: new Date('2025-09-01'),
  until: new Date('2025-10-01'),
  categories: ['test-failure', 'type-error'],
  patterns: ['evaluator-optimizer', 'router', 'orchestrator'],
  maxCases: 100,
  parallel: true,
  maxParallel: 3,
  outputDir: './backtest-results/2025-10-03-run-1',
  generateReport: true
};

const metrics = await orchestrator.runBacktest(config);

console.log(`Success rate: ${metrics.successRate}%`);
console.log(`Average duration: ${metrics.averageDuration}ms`);
console.log(`Total cost: $${metrics.totalCost}`);
```

### Pattern Comparison

```typescript
// Compare all patterns on same test cases
const testCases = await historyAnalyzer.scanForTestCases({
  categories: ['test-failure'],
  maxCases: 50
});

const comparison = await orchestrator.comparePatterns(
  testCases,
  ['evaluator-optimizer', 'prompt-cache', 'router', 'orchestrator']
);

// Output:
// - Evaluator-Optimizer: 85% success, avg 12.3s, $0.15/fix
// - PromptCache: 83% success, avg 8.1s, $0.08/fix (46% cost reduction)
// - Router: 88% success, avg 10.2s, $0.12/fix
// - Orchestrator: 91% success, avg 15.7s, $0.22/fix
//
// Recommendation: Use Router for best balance of speed/cost/accuracy
```

### Continuous Validation

```typescript
// Weekly backtest on new commits
async function weeklyBacktest() {
  const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const testCases = await historyAnalyzer.scanForTestCases({
    since: lastWeek,
    categories: ['test-failure', 'type-error', 'bug-fix']
  });

  if (testCases.length === 0) {
    console.log('No new test cases this week');
    return;
  }

  const metrics = await orchestrator.runBacktest({
    testCases,
    patterns: ['router'], // Use best performing pattern
    outputDir: `./backtest-results/weekly/${formatDate(new Date())}`,
    generateReport: true
  });

  // Alert if performance degrades
  if (metrics.successRate < 0.85) {
    await sendAlert('Agent performance degradation detected!', metrics);
  }

  // Update routing decisions based on results
  if (metrics.routingMetrics) {
    await updateRouterConfig(metrics.routingMetrics);
  }
}

// Run weekly
setInterval(weeklyBacktest, 7 * 24 * 60 * 60 * 1000);
```

## Expected Outputs

### 1. Test Case Database

```json
{
  "testCases": [
    {
      "id": "tc-001",
      "commitHash": "9bc74a1",
      "parentHash": "9bc74a1^",
      "category": "type-error",
      "timestamp": "2025-10-03T11:59:34-05:00",
      "problemFiles": ["shared/types/reserve-engine.ts"],
      "errorMessage": "TS7053: Element implicitly has an 'any' type...",
      "fixFiles": ["shared/types/reserve-engine.ts"],
      "humanFixDiff": "@@ -123,7 +123,7 @@\n-  return calculations[metric];\n+  return calculations[metric as keyof typeof calculations];",
      "complexity": 3,
      "filesChanged": 1,
      "linesChanged": 24
    }
  ]
}
```

### 2. Backtest Results

```json
{
  "runId": "2025-10-03-run-1",
  "timestamp": "2025-10-03T15:30:00Z",
  "config": { /* ... */ },
  "results": [
    {
      "testCaseId": "tc-001",
      "agentPattern": "evaluator-optimizer",
      "success": true,
      "duration": 8234,
      "iterations": 2,
      "similarityScore": 0.92,
      "approach": "same",
      "testsPass": true,
      "tokensUsed": 3450,
      "estimatedCost": 0.087
    }
  ],
  "metrics": {
    "totalTestCases": 50,
    "successRate": 0.88,
    "averageDuration": 9234,
    "totalCost": 4.35
  }
}
```

### 3. Analysis Report (Markdown)

```markdown
# Backtest Report: 2025-10-03-run-1

## Summary
- **Test Cases**: 50
- **Success Rate**: 88%
- **Average Duration**: 9.2s
- **Total Cost**: $4.35

## By Pattern
### Evaluator-Optimizer
- Success: 85% (42/50)
- Avg Duration: 12.3s
- Avg Cost: $0.15/fix
- Avg Iterations: 2.1

### Router
- Success: 88% (44/50)
- Avg Duration: 10.2s
- Avg Cost: $0.12/fix
- Model Distribution:
  - deepseek: 45%
  - claude-sonnet: 30%
  - gpt-4: 15%
  - others: 10%

## Comparison with Human Fixes
- **Faster than human**: 62% (31/50)
- **Same solution**: 45% (22/50)
- **Better solution**: 8% (4/50)

## Recommendations
1. Use Router pattern for best balance (88% success, $0.12/fix)
2. TypeScript errors: Route to `deepseek` (92% success)
3. Test failures: Route to `claude-sonnet` (87% success)
4. Enable PromptCache for 40% cost reduction
```

### 4. Trend Analysis (CSV)

```csv
date,pattern,category,success_rate,avg_duration,avg_cost,total_cases
2025-10-01,router,test-failure,0.86,10234,0.13,25
2025-10-01,router,type-error,0.91,8456,0.11,15
2025-10-02,evaluator-optimizer,test-failure,0.83,12567,0.16,20
2025-10-03,router,test-failure,0.88,10123,0.12,30
```

## Success Criteria

1. **Accuracy**: ≥85% success rate on historical test cases
2. **Speed**: ≤15s average time to fix (vs 30min-2hr human time)
3. **Cost**: ≤$0.20 per fix
4. **Quality**: ≥80% similarity to human fixes
5. **Scalability**: Handle 100+ test cases in parallel

## Integration Points

### With Existing Agent Core

```typescript
// packages/agent-core/src/index.ts
export * from './BaseAgent';
export * from './PromptCache';
export * from './Router';
export * from './Orchestrator';

// Add backtest exports
export * from '../backtest-framework/src/BacktestOrchestrator';
export * from '../backtest-framework/src/types';
```

### With Test Repair Agent

```typescript
// packages/test-repair-agent/src/index.ts
export * from './TestRepairAgent';

// Add backtest support
export { BacktestableTestRepairAgent } from './BacktestableTestRepairAgent';
```

### CLI Integration

```typescript
// scripts/backtest.ts
import { BacktestOrchestrator } from '@povc/backtest-framework';

const program = require('commander');

program
  .command('extract')
  .description('Extract test cases from git history')
  .option('--since <date>', 'Start date')
  .option('--until <date>', 'End date')
  .option('--categories <list>', 'Comma-separated categories')
  .action(async (options) => {
    const testCases = await orchestrator.extractTestCases(options);
    console.log(`Extracted ${testCases.length} test cases`);
  });

program
  .command('run')
  .description('Run backtest')
  .option('--config <file>', 'Config file path')
  .option('--pattern <name>', 'Agent pattern to test')
  .action(async (options) => {
    const metrics = await orchestrator.runBacktest(options);
    console.log('Backtest complete:', metrics);
  });

program
  .command('compare')
  .description('Compare agent patterns')
  .option('--patterns <list>', 'Comma-separated patterns')
  .action(async (options) => {
    const comparison = await orchestrator.comparePatterns(options);
    console.log('Comparison:', comparison);
  });

program.parse(process.argv);
```

### Package.json Scripts

```json
{
  "scripts": {
    "backtest:extract": "tsx scripts/backtest.ts extract --since='30 days ago'",
    "backtest:run": "tsx scripts/backtest.ts run --config=backtest.config.json",
    "backtest:compare": "tsx scripts/backtest.ts compare --patterns=router,orchestrator,evaluator-optimizer",
    "backtest:weekly": "tsx scripts/backtest-weekly.ts",
    "backtest:report": "tsx scripts/backtest-report.ts"
  }
}
```

## Next Steps

### Phase 1 (Week 1): Foundation
1. ✅ Implement `GitHistoryAnalyzer`
2. ✅ Implement `FailureDetector`
3. ✅ Implement `GitStateManager`
4. ✅ Extract first 50 test cases

### Phase 2 (Week 2): Agent Integration
1. ✅ Implement `AgentRunner`
2. ✅ Integrate with `TestRepairAgent`
3. ✅ Add backtest mode to `Router`
4. ✅ Add backtest mode to `Orchestrator`

### Phase 3 (Week 3): Metrics & Reporting
1. ✅ Implement `MetricsCollector`
2. ✅ Build report generators
3. ✅ Create dashboards
4. ✅ Run first full backtest

### Phase 4 (Week 4): Optimization
1. ✅ Analyze results
2. ✅ Tune routing decisions
3. ✅ Optimize PromptCache
4. ✅ Improve Evaluator-Optimizer convergence

### Phase 5 (Ongoing): Continuous Validation
1. ✅ Weekly backtest runs
2. ✅ Performance monitoring
3. ✅ Pattern refinement
4. ✅ Cost optimization

## Conclusion

This backtesting framework provides:

1. **Quantitative Validation**: Measure agent performance against real historical data
2. **Pattern Comparison**: Identify best patterns for different problem types
3. **Continuous Improvement**: Track performance over time and optimize
4. **Cost Optimization**: Balance quality vs cost across patterns
5. **Routing Intelligence**: Data-driven model selection

The framework integrates seamlessly with existing agent patterns and provides actionable insights for improving AI agent effectiveness in autonomous development workflows.
