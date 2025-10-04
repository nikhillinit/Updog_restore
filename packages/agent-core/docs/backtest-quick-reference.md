# Backtest Reporter - Quick Reference

One-page reference for the BacktestReporter system.

## Import

```typescript
import {
  BacktestReporter,
  BacktestCase,
  BacktestReport,
  AgentPattern
} from '@agent-core';
```

## Basic Usage

```typescript
// 1. Create backtest cases
const cases: BacktestCase[] = [
  {
    id: 'bt-001',
    timestamp: '2025-01-15T10:30:00Z',
    taskType: 'typescript-error',
    complexity: 6,
    description: 'Fix type mismatch',
    humanTimeMinutes: 45,
    humanCostUSD: 112.50,
    agentPattern: 'evaluator-optimizer',
    agentTimeMinutes: 8,
    agentCostUSD: 2.40,
    success: true,
    qualityScore: 92
  }
];

// 2. Generate report
const reporter = new BacktestReporter();
const report = reporter.generateReport(cases, 40); // 40 dev hours

// 3. Get outputs
const markdown = reporter.generateMarkdownReport(report);
const json = reporter.generateJSONReport(report);
const summary = reporter.generateExecutiveSummary(report);
```

## Agent Patterns

| Pattern | Use Case | Strengths |
|---------|----------|-----------|
| `evaluator-optimizer` | Self-improving tasks | Quality feedback loops |
| `router` | Model selection | Cost optimization |
| `orchestrator` | Complex tasks | Parallel execution |
| `prompt-cache` | Repetitive tasks | Fast execution |

## Task Types

```typescript
type TaskType =
  | 'typescript-error'
  | 'react-component'
  | 'performance'
  | 'database-query'
  | 'test-failure'
  | 'api-design'
  | 'refactoring'
  | 'debugging'
  | 'code-review'
  | 'architecture'
  | 'general';
```

## Key Metrics

```typescript
report.summary.successRate          // % successful
report.summary.avgQualityScore      // 0-100
report.summary.avgSpeedup           // vs human
report.summary.totalCostSavingsUSD  // $$$
report.summary.annualizedROI        // %
report.summary.breakEvenCases       // cases to ROI
```

## Pattern Analysis

```typescript
// Access pattern metrics
const optimizerMetrics = report.patternAnalysis['evaluator-optimizer'];
console.log(optimizerMetrics.successRate);
console.log(optimizerMetrics.avgQualityScore);
console.log(optimizerMetrics.totalCostSavings);

// Router-specific
const routerMetrics = report.patternAnalysis['router'];
console.log(routerMetrics.routingAccuracy); // % accurate routes
```

## Chart Data

```typescript
// Bar chart - Success rate by pattern
report.charts.successRateByPattern.data
// → [{ label: 'Router', value: 88.5 }, ...]

// Line chart - Cost savings over time
report.charts.costSavingsOverTime.series[0].data
// → [{ x: '2025-W01', y: 450.00 }, ...]

// Histogram - Quality distribution
report.charts.qualityDistribution.bins
// → [{ range: '80-100', count: 18 }, ...]

// Pie chart - Pattern usage
report.charts.patternUsage.data
// → [{ label: 'Router', value: 8, percentage: 32 }, ...]
```

## ROI Formulas

```typescript
// Development cost
developmentCost = hours × $150/hour

// Savings per case
caseSavings = (humanCost - agentCost) if success else 0

// Annualized ROI
estimatedAnnualCases = historicalCases × 12
savingsPerCase = totalSavings / historicalCases
annualSavings = savingsPerCase × estimatedAnnualCases
roi = ((annualSavings - developmentCost) / developmentCost) × 100

// Break-even
breakEvenCases = developmentCost / averageSavingsPerCase
```

## Output Formats

### Markdown
```typescript
const md = reporter.generateMarkdownReport(report);
fs.writeFileSync('report.md', md);
// → Full report with tables and charts
```

### JSON
```typescript
const json = reporter.generateJSONReport(report);
fs.writeFileSync('report.json', json);
// → Machine-readable data
```

### Executive Summary
```typescript
const summary = reporter.generateExecutiveSummary(report);
console.log(summary);
// → Concise text format
```

## Recharts Integration

```typescript
import { BarChart, Bar, XAxis, YAxis } from 'recharts';

<BarChart data={report.charts.successRateByPattern.data}>
  <XAxis dataKey="label" />
  <YAxis domain={[0, 100]} />
  <Bar dataKey="value" fill="#10b981" />
</BarChart>
```

## Quality Gates (CI/CD)

```typescript
const report = reporter.generateReport(cases, DEV_HOURS);

// Check thresholds
if (report.summary.successRate < 80) {
  console.error('❌ Success rate below 80%');
  process.exit(1);
}

if (report.summary.avgQualityScore < 75) {
  console.error('❌ Quality score below 75');
  process.exit(1);
}

console.log('✅ Quality gates passed');
```

## Recommendations

```typescript
// Auto-generated recommendations
report.recommendations.forEach((rec, i) => {
  console.log(`${i + 1}. ${rec}`);
});

// Example recommendations:
// - "EXCELLENT: Success rate of 88.0% exceeds target"
// - "STRONG ROI: 487% annualized ROI"
// - "Best performing pattern: orchestrator"
```

## Target Metrics

| Metric | Target | Excellent | Critical |
|--------|--------|-----------|----------|
| Success Rate | >80% | >90% | <70% |
| Quality | >75 | >85 | <65 |
| Speedup | >3x | >5x | <2x |
| ROI | >200% | >400% | <100% |

## Common Patterns

### Weekly Report
```typescript
const cases = await fetchLastWeekCases();
const report = reporter.generateReport(cases, TOTAL_DEV_HOURS);
await postToSlack(reporter.generateExecutiveSummary(report));
```

### Dashboard
```typescript
const { data: report } = useQuery({
  queryKey: ['backtest-report'],
  queryFn: async () => {
    const cases = await fetchLatestCases();
    return reporter.generateReport(cases, DEV_HOURS);
  },
  refetchInterval: 60000
});
```

### Email
```typescript
await sendEmail({
  to: 'stakeholders@company.com',
  subject: 'Agent Report - January 2025',
  body: reporter.generateExecutiveSummary(report)
});
```

## Troubleshooting

### Low Success Rate
- Review `report.patternAnalysis[pattern].failureReasons`
- Check task complexity distribution
- Improve error handling in agents

### Low Quality
- Add evaluator-optimizer pattern
- Enhance validation
- Get code review feedback

### Poor ROI
- Reduce development time (reuse patterns)
- Lower agent costs (caching, cheaper models)
- Increase case volume

### Low Speedup
- Optimize agent execution
- Use faster models
- Implement prompt caching
- Compare to junior dev, not senior

## Full Example

```typescript
import { BacktestReporter, BacktestCase } from '@agent-core';
import fs from 'fs';

async function generateBacktestReport() {
  // Load cases from database
  const cases: BacktestCase[] = await loadCasesFromDB();

  // Generate report
  const reporter = new BacktestReporter();
  const report = reporter.generateReport(cases, 40);

  // Save all formats
  fs.writeFileSync(
    'backtest-report.md',
    reporter.generateMarkdownReport(report)
  );

  fs.writeFileSync(
    'backtest-report.json',
    reporter.generateJSONReport(report)
  );

  // Print summary
  console.log(reporter.generateExecutiveSummary(report));

  // Check gates
  if (report.summary.successRate < 80) {
    throw new Error('Success rate below threshold');
  }

  return report;
}
```

## Files

- `src/BacktestReporter.ts` - Main implementation
- `docs/backtest-reporting.md` - Full documentation
- `docs/chart-integration.md` - Visualization examples
- `examples/backtest-example.ts` - Working example
- `README-BACKTEST.md` - Complete guide

## Links

- [Full Documentation](./backtest-reporting.md)
- [Chart Examples](./chart-integration.md)
- [Sample Report](../examples/sample-backtest-report.md)
- [Run Example](../examples/backtest-example.ts)
