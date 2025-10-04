# Agent Backtest Reporting System

Comprehensive reporting and ROI analysis for AI agent pattern backtesting.

## Quick Start

```typescript
import { BacktestReporter, BacktestCase } from '@agent-core';

// 1. Create sample backtest cases
const cases: BacktestCase[] = [
  {
    id: 'bt-001',
    timestamp: '2025-01-15T10:30:00Z',
    taskType: 'typescript-error',
    complexity: 6,
    description: 'Fix type mismatch in ReserveEngine',
    humanTimeMinutes: 45,
    humanCostUSD: 112.50,
    agentPattern: 'evaluator-optimizer',
    agentTimeMinutes: 8,
    agentCostUSD: 2.40,
    success: true,
    qualityScore: 92
  }
  // ... more cases
];

// 2. Generate report
const reporter = new BacktestReporter();
const report = reporter.generateReport(cases, developmentTimeHours: 40);

// 3. Get outputs
const markdown = reporter.generateMarkdownReport(report);
const json = reporter.generateJSONReport(report);
const summary = reporter.generateExecutiveSummary(report);

console.log(summary);
```

## Features

### Multi-Format Reports

1. **Markdown Report** - Comprehensive documentation with tables and charts
2. **JSON Report** - Machine-readable data for API integration
3. **Executive Summary** - Concise text format for quick reviews
4. **Chart Data** - Ready-to-use data for visualization libraries

### Key Metrics

- **Success Rate**: % of successfully completed tasks
- **Quality Score**: 0-100 rating of output quality
- **Speedup Factor**: How much faster than human developers
- **Cost Savings**: Dollar amount saved vs human developers
- **ROI**: Annualized return on investment
- **Break-Even Analysis**: Cases needed to recover development costs

### Pattern Analysis

Evaluate 4 agent patterns:
- **Evaluator-Optimizer**: Self-improving with quality feedback
- **Router**: Intelligent AI model selection
- **Orchestrator**: Complex task decomposition
- **Prompt Cache**: Fast execution for similar tasks

### Visualizations

Pre-formatted chart data for:
- Success rate by pattern (bar chart)
- Cost savings over time (line chart)
- Quality score distribution (histogram)
- Router accuracy by task type (pie chart)
- Speedup comparison (bar chart)
- Pattern usage distribution (pie chart)

## Example Output

### Executive Summary

```
======================================================================
AGENT BACKTEST - EXECUTIVE SUMMARY
======================================================================

BUSINESS IMPACT:
  Total Cost Savings:     $2,450.75
  Time Savings:           18.5 hours
  ROI (Annualized):       487%

PERFORMANCE:
  Success Rate:           88.0%
  Quality Score:          89.2/100
  Speed vs Human:         4.8x faster

INVESTMENT:
  Development Time:       40 hours
  Development Cost:       $6,000.00
  Break-Even Point:       61 cases
  Status:                 36 cases to break-even
```

### Pattern Performance

```
PATTERN PERFORMANCE:
  Evaluator-Optimizer    85.7% success, 5.2x speedup
  Router                 87.5% success, 4.9x speedup
  Orchestrator           100.0% success, 4.5x speedup
  Prompt Cache           85.7% success, 5.8x speedup
```

## ROI Calculation

### Investment

```typescript
developmentCost = developmentTimeHours × $150/hour
// Example: 40 hours × $150 = $6,000
```

### Savings

```typescript
caseSavings = (humanCost - agentCost) for successful cases
totalSavings = sum of all caseSavings
```

### Annualized ROI

```typescript
// Estimate annual case volume
estimatedAnnualCases = historicalCases × 12

// Calculate ROI
savingsPerCase = totalSavings / historicalCases
estimatedAnnualSavings = savingsPerCase × estimatedAnnualCases
netProfit = estimatedAnnualSavings - developmentCost
annualizedROI = (netProfit / developmentCost) × 100
```

### Break-Even

```typescript
averageSavingsPerCase = totalSavings / totalCases
breakEvenCases = developmentCost / averageSavingsPerCase
```

## Chart Integration

### Recharts (React)

```typescript
import { BarChart, Bar, XAxis, YAxis } from 'recharts';

function SuccessRateChart({ report }) {
  const data = report.charts.successRateByPattern.data;

  return (
    <BarChart width={600} height={400} data={data}>
      <XAxis dataKey="label" />
      <YAxis domain={[0, 100]} />
      <Bar dataKey="value" fill="#10b981" />
    </BarChart>
  );
}
```

### Nivo (React)

```typescript
import { ResponsiveBar } from '@nivo/bar';

function NivoChart({ report }) {
  const data = report.charts.successRateByPattern.data.map(d => ({
    pattern: d.label,
    value: d.value
  }));

  return (
    <div style={{ height: 400 }}>
      <ResponsiveBar data={data} keys={['value']} indexBy="pattern" />
    </div>
  );
}
```

### Chart.js

```typescript
import { Bar } from 'react-chartjs-2';

function ChartJsBar({ report }) {
  const chartData = report.charts.successRateByPattern;

  const data = {
    labels: chartData.data.map(d => d.label),
    datasets: [{
      label: 'Success Rate (%)',
      data: chartData.data.map(d => d.value),
      backgroundColor: 'rgba(16, 185, 129, 0.5)'
    }]
  };

  return <Bar data={data} />;
}
```

## API Reference

### BacktestReporter

```typescript
class BacktestReporter {
  // Generate comprehensive report
  generateReport(
    cases: BacktestCase[],
    developmentTimeHours: number
  ): BacktestReport;

  // Output formats
  generateMarkdownReport(report: BacktestReport): string;
  generateJSONReport(report: BacktestReport): string;
  generateExecutiveSummary(report: BacktestReport): string;
}
```

### BacktestCase

```typescript
interface BacktestCase {
  id: string;
  timestamp: string;
  taskType: TaskType;
  complexity: number;
  description: string;

  // Human baseline
  humanTimeMinutes: number;
  humanCostUSD: number;

  // Agent execution
  agentPattern: AgentPattern;
  agentTimeMinutes: number;
  agentCostUSD: number;

  // Results
  success: boolean;
  qualityScore: number;
  failureReason?: string;

  // Router-specific
  routedModel?: AIModel;
  routingAccurate?: boolean;
}
```

### BacktestReport

```typescript
interface BacktestReport {
  metadata: {
    generatedAt: string;
    reportVersion: string;
    totalCases: number;
    dateRange: { start: string; end: string };
  };

  summary: BacktestSummary;
  patternAnalysis: Record<AgentPattern, PatternMetrics>;
  caseDetails: BacktestCase[];
  recommendations: string[];
  charts: ChartCollection;
}
```

## Examples

Run the example script:

```bash
cd packages/agent-core
npx tsx examples/backtest-example.ts
```

This will:
1. Generate 25 sample backtest cases
2. Create comprehensive report
3. Display all output formats
4. Show chart data samples
5. List recommendations

## Documentation

- [Full Documentation](./docs/backtest-reporting.md) - Complete guide
- [Chart Integration](./docs/chart-integration.md) - Visualization examples
- [Example Report](./examples/sample-backtest-report.md) - Sample markdown output
- [Example Summary](./examples/sample-executive-summary.txt) - Sample text output

## Use Cases

### Weekly Team Reviews

```typescript
// Generate weekly report
const lastWeekCases = await fetchCasesFromLastWeek();
const reporter = new BacktestReporter();
const report = reporter.generateReport(lastWeekCases, TOTAL_DEV_HOURS);

// Post to Slack
await postToSlack(reporter.generateExecutiveSummary(report));

// Save to S3
await saveToS3('reports/weekly/', reporter.generateMarkdownReport(report));
```

### Monthly Stakeholder Updates

```typescript
// Generate monthly report
const monthCases = await fetchCasesFromMonth();
const report = reporter.generateReport(monthCases, TOTAL_DEV_HOURS);

// Email to stakeholders
await sendEmail({
  to: 'stakeholders@company.com',
  subject: 'Agent Performance Report - January 2025',
  body: reporter.generateExecutiveSummary(report),
  attachments: [
    { filename: 'report.json', content: reporter.generateJSONReport(report) }
  ]
});
```

### CI/CD Quality Gates

```typescript
// In CI pipeline
const cases = await loadCasesFromDatabase();
const report = reporter.generateReport(cases, DEV_HOURS);

// Check quality gates
if (report.summary.successRate < 80) {
  console.error('Success rate below 80% threshold');
  process.exit(1);
}

if (report.summary.avgQualityScore < 75) {
  console.error('Quality score below 75 threshold');
  process.exit(1);
}

console.log('✅ Quality gates passed');
```

### Interactive Dashboard

```typescript
// React component
import { useQuery } from '@tanstack/react-query';

function BacktestDashboard() {
  const { data: report } = useQuery({
    queryKey: ['backtest-report'],
    queryFn: async () => {
      const cases = await fetchLatestCases();
      const reporter = new BacktestReporter();
      return reporter.generateReport(cases, DEV_HOURS);
    },
    refetchInterval: 60000 // Refresh every minute
  });

  if (!report) return <Loading />;

  return (
    <div>
      <MetricsCards summary={report.summary} />
      <ChartsGrid charts={report.charts} />
      <RecommendationsList recommendations={report.recommendations} />
      <CaseDetailsTable cases={report.caseDetails} />
    </div>
  );
}
```

## Best Practices

### Data Collection

1. **Accurate baselines** - Use realistic human time estimates
2. **Consistent pricing** - Use actual developer hourly rates
3. **Quality assessment** - Get objective quality scores from code review
4. **Failure tracking** - Document specific failure reasons
5. **Router validation** - Verify routing decisions were optimal

### Report Generation

1. **Regular cadence** - Generate weekly or monthly
2. **Trend analysis** - Compare reports over time
3. **Pattern evolution** - Track pattern improvements
4. **Stakeholder targeting** - Share appropriate format with each audience
5. **Action items** - Use recommendations to guide improvements

### ROI Optimization

1. **Reduce costs** - Optimize prompt caching, use efficient models
2. **Improve success rate** - Better error handling and validation
3. **Increase quality** - Add evaluator-optimizer loops
4. **Scale usage** - Apply agents to more use cases
5. **Streamline development** - Reuse patterns and components

## Troubleshooting

### Low Success Rate (<70%)

- Review failure reasons in pattern analysis
- Check if task complexity is too high
- Improve agent error handling
- Add retry logic and fallbacks
- Consider human-in-the-loop for complex cases

### Low Quality Scores (<75)

- Add evaluator-optimizer pattern
- Enhance validation and testing
- Improve prompt engineering
- Add quality gates in agent execution
- Get feedback from code reviews

### Poor ROI (<100%)

- Reduce development time (reuse patterns)
- Lower agent execution costs (caching, cheaper models)
- Increase case volume (apply to more tasks)
- Focus on high-value use cases
- Improve success rate to maximize savings

### Low Speedup (<2x)

- Optimize agent execution time
- Use faster AI models when appropriate
- Implement prompt caching
- Parallelize with orchestrator pattern
- Reduce human baseline (compare to junior dev, not senior)

## Contributing

Contributions welcome! Areas for improvement:

- [ ] PDF report generation
- [ ] HTML interactive reports
- [ ] Real-time streaming updates
- [ ] More chart types (scatter, heatmap)
- [ ] Pattern comparison A/B testing
- [ ] Cost optimization recommendations
- [ ] Forecasting and trend analysis
- [ ] Integration with monitoring tools

## License

MIT
