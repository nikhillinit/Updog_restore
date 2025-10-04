# Backtest Execution Engine

## Overview

The Backtest Execution Engine allows you to run AI agents against historical test cases to measure their performance, accuracy, and ROI compared to human solutions.

## Features

- **Safe Git Operations**: Uses git worktrees to isolate backtest execution from your working directory
- **Multi-Agent Support**: Integrates with Router, Orchestrator, and TestRepairAgent patterns
- **Comprehensive Metrics**: Tracks success rate, quality score, speed, iterations, and cost
- **Solution Comparison**: Measures similarity between agent and human solutions
- **Concurrent Execution**: Runs multiple test cases in parallel with configurable concurrency
- **Detailed Reporting**: Generates JSON reports and human-readable summaries

## Quick Start

### 1. Prepare Test Cases

Create a JSON file with your historical test cases:

```json
[
  {
    "id": "case-001",
    "commitHash": "abc123",
    "type": "test-failure",
    "description": "Fix failing unit test",
    "files": ["src/example.ts"],
    "errorMessage": "TypeError: Cannot read property...",
    "humanSolution": "Added null check",
    "timeToResolve": 15,
    "complexity": 3
  }
]
```

See `examples/sample-test-cases.json` for a complete example.

### 2. Run Backtest

```bash
# Basic usage
npm run backtest -- --cases test-cases.json

# With options
npm run backtest -- --cases test-cases.json --output results.json --verbose

# Dry run to test configuration
npm run backtest -- --cases test-cases.json --dry-run
```

### 3. Review Results

The tool generates two files:
- `backtest-report.json`: Full JSON report with all metrics
- `backtest-report-summary.txt`: Human-readable summary

## Test Case Format

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the test case |
| `commitHash` | string | Git commit hash where the issue occurred |
| `type` | TaskType | Type of task (see Task Types below) |
| `description` | string | Brief description of the issue |
| `files` | string[] | List of files involved |
| `errorMessage` | string | The error or issue description |
| `humanSolution` | string | How a human solved it |
| `timeToResolve` | number | Time taken by human (in minutes) |
| `complexity` | number | Complexity rating (1-10 scale) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `metadata.testCommand` | string | Command to run tests |
| `metadata.expectedOutcome` | string | Expected result after fix |
| `metadata.category` | string | Custom category tag |

### Task Types

- `typescript-error`: TypeScript compilation errors
- `test-failure`: Failing unit/integration tests
- `react-component`: React component development
- `performance`: Performance optimization
- `database-query`: Database query issues
- `api-design`: API endpoint design
- `refactoring`: Code refactoring
- `debugging`: Complex debugging tasks
- `code-review`: Code review findings
- `architecture`: Architecture decisions
- `general`: General tasks

## CLI Options

```
OPTIONS:
  -c, --cases <file>           Path to test cases JSON file (required)
  -o, --output <file>          Output report file (default: backtest-report.json)
  -p, --project-root <path>    Project root directory (default: current directory)
  -v, --verbose                Enable verbose logging
  -d, --dry-run                Run without executing agents (simulation mode)
  -m, --max-concurrent <n>     Max concurrent test cases (default: 3)
  -t, --timeout <seconds>      Timeout per case in seconds (default: 300)
  --no-cleanup                 Don't cleanup git worktrees after completion
  -h, --help                   Show help message
```

## Evaluation Metrics

### Success Rate
- **Definition**: Percentage of cases where agent produced a working solution
- **Target**: > 80%
- **Formula**: `(successful cases / total cases) * 100`

### Quality Score (0-100)
Composite score based on:
- **Similarity to human solution (40%)**: How similar is the agent's approach?
- **Efficiency (20%)**: Number of iterations needed
- **Speed (20%)**: Time to solution vs human
- **Conciseness (10%)**: Solution length comparison
- **Cost efficiency (10%)**: API call costs

### Similarity Score (0-1)
Measures how similar agent solution is to human solution:
- **Structural similarity (60%)**: Levenshtein distance-based comparison
- **Keyword overlap (40%)**: Shared concepts and patterns

### Speedup Factor
- **Definition**: How much faster the agent was compared to human
- **Formula**: `human_time_minutes / agent_time_minutes`
- **Example**: 3.5x means agent was 3.5 times faster

### Cost Estimate
Estimated cost in arbitrary units based on:
- Number of agent iterations
- Model complexity
- Token usage

## Report Structure

### Summary Metrics
```json
{
  "totalCases": 10,
  "successfulCases": 8,
  "failedCases": 2,
  "averageQualityScore": 78.5,
  "averageSimilarityScore": 0.72,
  "averageSpeedup": 4.2,
  "averageIterations": 1.8,
  "totalCost": 145.0,
  "successRate": 0.8
}
```

### Individual Results
```json
{
  "caseId": "case-001",
  "agentSuccess": true,
  "qualityScore": 85.0,
  "agentSolution": "...",
  "humanSolution": "...",
  "similarityScore": 0.78,
  "speedup": 5.2,
  "iterations": 2,
  "cost": 12.5
}
```

## Git Worktree Isolation

The backtest engine uses git worktrees to safely run tests at historical commits:

1. **Creates isolated worktree** at `.backtest-worktrees/case-{id}`
2. **Checks out specific commit** for each test case
3. **Runs agent** in isolated environment
4. **Cleans up** worktree after completion

This ensures:
- No interference with your current working directory
- Safe concurrent execution of multiple test cases
- Accurate historical context for each test

## Example Output

```
============================================================
BACKTEST RUNNER
============================================================
Test Cases: examples/sample-test-cases.json
Project Root: /path/to/project
Output: backtest-report.json
Mode: LIVE
============================================================

Loading test cases...
Loaded 10 test cases

Starting backtest...

Processing batch 1/4 (3 cases)
Case case-001 completed (success: true, quality: 85.0, speedup: 5.2x)
Case case-002 completed (success: true, quality: 92.0, speedup: 6.1x)
Case case-003 completed (success: false, quality: 0.0, speedup: 0.0x)

...

Saving report...
Report saved to: backtest-report.json
Summary saved to: backtest-report-summary.txt

============================================================
SUMMARY
============================================================

Total Cases:          10
Successful:           8 (80.00%)
Failed:               2

Performance Metrics:
  Quality Score:      78.50/100
  Similarity:         72.00%
  Speedup:            4.20x
  Avg Iterations:     1.80
  Total Cost:         145.00 units

Duration:             45.23s
============================================================

All test cases completed successfully!
```

## Integration with Existing Agents

### Using with TestRepairAgent

```typescript
import { BacktestRunner, BacktestExecutionCase } from '@povc/agent-core';
import { TestRepairAgent } from '@povc/test-repair-agent';

const runner = new BacktestRunner({
  projectRoot: '/path/to/project',
});

// Custom agent executor using TestRepairAgent
const cases: BacktestExecutionCase[] = BacktestRunner.loadTestCases('test-cases.json');

// Run backtest
const report = await runner.runBacktest(cases);

// Generate detailed report
console.log(`Success rate: ${(report.successRate * 100).toFixed(2)}%`);
```

### Using with Router Pattern

The BacktestRunner automatically uses the AIRouter to select the best agent for each task type.

### Using with Orchestrator Pattern

For complex tasks, the Orchestrator pattern can be used to break down tasks into subtasks.

## Best Practices

1. **Start Small**: Begin with 5-10 well-documented test cases
2. **Diverse Cases**: Include a mix of task types and complexity levels
3. **Accurate Timing**: Record realistic human resolution times
4. **Clear Solutions**: Document what the human actually did to fix the issue
5. **Version Control**: Keep test cases in version control
6. **Regular Updates**: Add new cases as you encounter interesting problems
7. **Review Results**: Analyze failures to improve agent performance

## Troubleshooting

### Worktree Cleanup Issues
```bash
# Manually clean up stale worktrees
git worktree prune
```

### Permission Errors
Ensure you have permission to create worktrees in your project directory.

### Timeout Issues
Increase timeout for complex cases:
```bash
npm run backtest -- --cases test-cases.json --timeout 600
```

### Memory Issues
Reduce concurrent execution:
```bash
npm run backtest -- --cases test-cases.json --max-concurrent 1
```

## Advanced Usage

### Programmatic API

```typescript
import { BacktestRunner, BacktestExecutionCase, AgentExecutor } from '@povc/agent-core';

// Create custom agent executor
const customExecutor: AgentExecutor = {
  name: 'my-custom-agent',
  execute: async (testCase, context) => {
    // Your custom agent logic
    return {
      success: true,
      solution: '...',
      iterations: 1,
      duration: 1000,
      cost: 5,
    };
  },
};

// Create runner
const runner = new BacktestRunner({
  projectRoot: process.cwd(),
  maxConcurrent: 5,
  timeout: 600000,
});

// Load and run
const cases = BacktestRunner.loadTestCases('test-cases.json');
const report = await runner.runBacktest(cases);

// Save results
BacktestRunner.saveReport(report, 'custom-report.json');
```

### Custom Evaluation Metrics

Extend the BacktestRunner class to add custom evaluation logic:

```typescript
class CustomBacktestRunner extends BacktestRunner {
  protected calculateQualityScore(agentResult, testCase, similarityScore) {
    // Your custom quality scoring logic
    return super.calculateQualityScore(agentResult, testCase, similarityScore);
  }
}
```

## See Also

- [BacktestReporter](./src/BacktestReporter.ts): Comprehensive reporting system
- [Router Pattern](./src/Router.ts): AI model routing
- [Orchestrator Pattern](./src/Orchestrator.ts): Multi-agent coordination
- [TestRepairAgent](../test-repair-agent/): Automated test repair
