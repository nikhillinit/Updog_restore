/**
 * BacktestReporter: Comprehensive reporting system for agent backtest results
 *
 * Generates multi-format reports showing:
 * - ROI and cost savings
 * - Pattern-by-pattern performance
 * - Success rates and quality metrics
 * - Time comparisons vs human developers
 * - Failure analysis
 *
 * Output formats: Markdown, JSON, Executive Summary, Chart Data
 */

import type { AIModel, TaskType } from './Router';

// ============================================================================
// Core Types
// ============================================================================

export interface BacktestCase {
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
  qualityScore: number; // 0-100
  failureReason?: string;

  // Router-specific
  routedModel?: AIModel;
  routingAccurate?: boolean;

  // Metadata
  tags?: string[];
}

export type AgentPattern =
  | 'evaluator-optimizer'
  | 'router'
  | 'orchestrator'
  | 'prompt-cache';

export interface PatternMetrics {
  pattern: AgentPattern;
  totalCases: number;
  successCount: number;
  successRate: number;

  avgQualityScore: number;
  avgTimeMinutes: number;
  avgCostUSD: number;

  avgSpeedup: number; // vs human
  totalCostSavings: number;
  totalTimeSavingsMinutes: number;

  failureReasons: Record<string, number>;

  // Router-specific
  routingAccuracy?: number;
}

export interface BacktestSummary {
  totalCases: number;
  successRate: number;
  avgQualityScore: number;
  avgSpeedup: number;
  totalCostSavingsUSD: number;
  totalTimeSavingsHours: number;

  // ROI calculations
  developmentTimeHours: number;
  developmentCostUSD: number;
  annualizedROI: number; // percentage
  breakEvenCases: number;
}

export interface BacktestReport {
  metadata: {
    generatedAt: string;
    reportVersion: string;
    totalCases: number;
    dateRange: {
      start: string;
      end: string;
    };
  };

  summary: BacktestSummary;
  patternAnalysis: Record<AgentPattern, PatternMetrics>;

  caseDetails: BacktestCase[];
  recommendations: string[];

  charts: ChartCollection;
}

export interface ChartCollection {
  successRateByPattern: BarChartData;
  costSavingsOverTime: LineChartData;
  qualityDistribution: HistogramData;
  routerAccuracyByTaskType: PieChartData;
  speedupComparison: BarChartData;
  patternUsage: PieChartData;
}

export interface BarChartData {
  type: 'bar';
  title: string;
  xAxis: string;
  yAxis: string;
  data: Array<{ label: string; value: number }>;
}

export interface LineChartData {
  type: 'line';
  title: string;
  xAxis: string;
  yAxis: string;
  series: Array<{
    name: string;
    data: Array<{ x: string | number; y: number }>;
  }>;
}

export interface HistogramData {
  type: 'histogram';
  title: string;
  xAxis: string;
  yAxis: string;
  bins: Array<{ range: string; count: number }>;
}

export interface PieChartData {
  type: 'pie';
  title: string;
  data: Array<{ label: string; value: number; percentage: number }>;
}

// ============================================================================
// BacktestReporter Class
// ============================================================================

export class BacktestReporter {
  private readonly REPORT_VERSION = '1.0.0';

  // ROI calculation constants
  private readonly HUMAN_DEV_RATE_USD_PER_HOUR = 150; // Senior dev rate
  private readonly ANNUAL_WORKING_HOURS = 2080;
  private readonly WEEKS_PER_YEAR = 52;

  /**
   * Generate comprehensive backtest report
   */
  generateReport(
    cases: BacktestCase[],
    developmentTimeHours: number
  ): BacktestReport {
    const summary = this.calculateSummary(cases, developmentTimeHours);
    const patternAnalysis = this.analyzePatterns(cases);
    const recommendations = this.generateRecommendations(summary, patternAnalysis);
    const charts = this.generateCharts(cases, patternAnalysis);

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        reportVersion: this.REPORT_VERSION,
        totalCases: cases.length,
        dateRange: this.getDateRange(cases)
      },
      summary,
      patternAnalysis,
      caseDetails: cases.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
      recommendations,
      charts
    };
  }

  /**
   * Calculate executive summary metrics
   */
  private calculateSummary(
    cases: BacktestCase[],
    developmentTimeHours: number
  ): BacktestSummary {
    const successfulCases = cases.filter(c => c.success);
    const totalCostSavings = cases.reduce((sum, c) =>
      sum + (c.success ? (c.humanCostUSD - c.agentCostUSD) : 0), 0
    );
    const totalTimeSavings = cases.reduce((sum, c) =>
      sum + (c.success ? (c.humanTimeMinutes - c.agentTimeMinutes) : 0), 0
    );

    const avgQuality = successfulCases.length > 0
      ? successfulCases.reduce((sum, c) => sum + c.qualityScore, 0) / successfulCases.length
      : 0;

    const avgSpeedup = successfulCases.length > 0
      ? successfulCases.reduce((sum, c) =>
          sum + (c.humanTimeMinutes / Math.max(c.agentTimeMinutes, 0.1)), 0
        ) / successfulCases.length
      : 1;

    // ROI calculation
    const developmentCost = developmentTimeHours * this.HUMAN_DEV_RATE_USD_PER_HOUR;
    const annualizedROI = this.calculateAnnualizedROI(
      totalCostSavings,
      developmentCost,
      cases.length
    );
    const breakEvenCases = Math.ceil(developmentCost / (totalCostSavings / Math.max(cases.length, 1)));

    return {
      totalCases: cases.length,
      successRate: cases.length > 0 ? (successfulCases.length / cases.length) * 100 : 0,
      avgQualityScore: avgQuality,
      avgSpeedup,
      totalCostSavingsUSD: totalCostSavings,
      totalTimeSavingsHours: totalTimeSavings / 60,
      developmentTimeHours,
      developmentCostUSD: developmentCost,
      annualizedROI,
      breakEvenCases
    };
  }

  /**
   * Calculate annualized ROI percentage
   */
  private calculateAnnualizedROI(
    totalSavings: number,
    developmentCost: number,
    historicalCases: number
  ): number {
    // Estimate annual case volume (assuming historical cases represent some time period)
    // Conservative estimate: historical cases represent 1 month of work
    const monthsOfData = 1;
    const estimatedAnnualCases = historicalCases * (12 / monthsOfData);
    const savingsPerCase = totalSavings / Math.max(historicalCases, 1);
    const estimatedAnnualSavings = savingsPerCase * estimatedAnnualCases;

    // ROI = (Net Profit / Investment) * 100
    const netProfit = estimatedAnnualSavings - developmentCost;
    const roi = (netProfit / developmentCost) * 100;

    return roi;
  }

  /**
   * Analyze patterns individually
   */
  private analyzePatterns(cases: BacktestCase[]): Record<AgentPattern, PatternMetrics> {
    const patterns: AgentPattern[] = [
      'evaluator-optimizer',
      'router',
      'orchestrator',
      'prompt-cache'
    ];

    const analysis: Record<AgentPattern, PatternMetrics> = {} as any;

    for (const pattern of patterns) {
      const patternCases = cases.filter(c => c.agentPattern === pattern);
      analysis[pattern] = this.calculatePatternMetrics(pattern, patternCases);
    }

    return analysis;
  }

  /**
   * Calculate metrics for a specific pattern
   */
  private calculatePatternMetrics(
    pattern: AgentPattern,
    cases: BacktestCase[]
  ): PatternMetrics {
    const successful = cases.filter(c => c.success);

    const totalCostSavings = cases.reduce((sum, c) =>
      sum + (c.success ? (c.humanCostUSD - c.agentCostUSD) : 0), 0
    );

    const totalTimeSavings = cases.reduce((sum, c) =>
      sum + (c.success ? (c.humanTimeMinutes - c.agentTimeMinutes) : 0), 0
    );

    const avgQuality = successful.length > 0
      ? successful.reduce((sum, c) => sum + c.qualityScore, 0) / successful.length
      : 0;

    const avgTime = cases.length > 0
      ? cases.reduce((sum, c) => sum + c.agentTimeMinutes, 0) / cases.length
      : 0;

    const avgCost = cases.length > 0
      ? cases.reduce((sum, c) => sum + c.agentCostUSD, 0) / cases.length
      : 0;

    const avgSpeedup = successful.length > 0
      ? successful.reduce((sum, c) =>
          sum + (c.humanTimeMinutes / Math.max(c.agentTimeMinutes, 0.1)), 0
        ) / successful.length
      : 1;

    // Failure analysis
    const failureReasons: Record<string, number> = {};
    cases.filter(c => !c.success).forEach(c => {
      const reason = c.failureReason || 'Unknown';
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    });

    // Router-specific metrics
    let routingAccuracy: number | undefined;
    if (pattern === 'router') {
      const routedCases = cases.filter(c => c.routingAccurate !== undefined);
      if (routedCases.length > 0) {
        const accurateRoutes = routedCases.filter(c => c.routingAccurate).length;
        routingAccuracy = (accurateRoutes / routedCases.length) * 100;
      }
    }

    return {
      pattern,
      totalCases: cases.length,
      successCount: successful.length,
      successRate: cases.length > 0 ? (successful.length / cases.length) * 100 : 0,
      avgQualityScore: avgQuality,
      avgTimeMinutes: avgTime,
      avgCostUSD: avgCost,
      avgSpeedup,
      totalCostSavings,
      totalTimeSavingsMinutes: totalTimeSavings,
      failureReasons,
      routingAccuracy
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    summary: BacktestSummary,
    patterns: Record<AgentPattern, PatternMetrics>
  ): string[] {
    const recommendations: string[] = [];

    // Overall success rate
    if (summary.successRate < 70) {
      recommendations.push(
        `CRITICAL: Overall success rate is ${summary.successRate.toFixed(1)}%. ` +
        `Target should be >80%. Review failure patterns and improve agent robustness.`
      );
    } else if (summary.successRate >= 90) {
      recommendations.push(
        `EXCELLENT: Success rate of ${summary.successRate.toFixed(1)}% exceeds target. ` +
        `Consider expanding to more complex use cases.`
      );
    }

    // Quality scores
    if (summary.avgQualityScore < 70) {
      recommendations.push(
        `Quality scores averaging ${summary.avgQualityScore.toFixed(1)} need improvement. ` +
        `Consider adding evaluator-optimizer pattern or enhancing prompts.`
      );
    }

    // ROI analysis
    if (summary.annualizedROI > 200) {
      recommendations.push(
        `STRONG ROI: ${summary.annualizedROI.toFixed(0)}% annualized ROI. ` +
        `Break-even after ${summary.breakEvenCases} cases. Ready for production deployment.`
      );
    } else if (summary.annualizedROI < 100) {
      recommendations.push(
        `ROI of ${summary.annualizedROI.toFixed(0)}% is below target. ` +
        `Focus on reducing agent costs or increasing case volume.`
      );
    }

    // Pattern-specific recommendations
    const bestPattern = Object.entries(patterns)
      .filter(([_, metrics]) => metrics.totalCases > 0)
      .sort((a, b) => b[1].successRate - a[1].successRate)[0];

    if (bestPattern) {
      recommendations.push(
        `Best performing pattern: ${bestPattern[0]} with ${bestPattern[1].successRate.toFixed(1)}% success rate. ` +
        `Consider using this pattern more frequently.`
      );
    }

    // Router accuracy
    const routerMetrics = patterns['router'];
    if (routerMetrics.routingAccuracy !== undefined && routerMetrics.routingAccuracy < 80) {
      recommendations.push(
        `Router accuracy is ${routerMetrics.routingAccuracy.toFixed(1)}%. ` +
        `Improve routing logic or add more training examples.`
      );
    }

    // Speed improvements
    if (summary.avgSpeedup < 2) {
      recommendations.push(
        `Average speedup of ${summary.avgSpeedup.toFixed(1)}x is modest. ` +
        `Look for opportunities to optimize agent execution time.`
      );
    } else if (summary.avgSpeedup > 5) {
      recommendations.push(
        `Outstanding ${summary.avgSpeedup.toFixed(1)}x average speedup! ` +
        `Document this efficiency gain for stakeholder communication.`
      );
    }

    return recommendations;
  }

  /**
   * Generate chart data for visualizations
   */
  private generateCharts(
    cases: BacktestCase[],
    patterns: Record<AgentPattern, PatternMetrics>
  ): ChartCollection {
    return {
      successRateByPattern: this.createSuccessRateChart(patterns),
      costSavingsOverTime: this.createCostSavingsChart(cases),
      qualityDistribution: this.createQualityDistributionChart(cases),
      routerAccuracyByTaskType: this.createRouterAccuracyChart(cases),
      speedupComparison: this.createSpeedupChart(patterns),
      patternUsage: this.createPatternUsageChart(patterns)
    };
  }

  private createSuccessRateChart(patterns: Record<AgentPattern, PatternMetrics>): BarChartData {
    return {
      type: 'bar',
      title: 'Success Rate by Agent Pattern',
      xAxis: 'Pattern',
      yAxis: 'Success Rate (%)',
      data: Object.entries(patterns)
        .filter(([_, metrics]) => metrics.totalCases > 0)
        .map(([pattern, metrics]) => ({
          label: this.formatPatternName(pattern as AgentPattern),
          value: metrics.successRate
        }))
    };
  }

  private createCostSavingsChart(cases: BacktestCase[]): LineChartData {
    // Group cases by week
    const weeklyData: Record<string, number> = {};
    let cumulativeSavings = 0;

    cases
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach(c => {
        const week = this.getWeekKey(new Date(c.timestamp));
        const savings = c.success ? (c.humanCostUSD - c.agentCostUSD) : 0;
        cumulativeSavings += savings;
        weeklyData[week] = cumulativeSavings;
      });

    return {
      type: 'line',
      title: 'Cumulative Cost Savings Over Time',
      xAxis: 'Week',
      yAxis: 'Cost Savings (USD)',
      series: [{
        name: 'Cumulative Savings',
        data: Object.entries(weeklyData).map(([week, savings]) => ({
          x: week,
          y: savings
        }))
      }]
    };
  }

  private createQualityDistributionChart(cases: BacktestCase[]): HistogramData {
    const bins = [
      { range: '0-20', min: 0, max: 20, count: 0 },
      { range: '20-40', min: 20, max: 40, count: 0 },
      { range: '40-60', min: 40, max: 60, count: 0 },
      { range: '60-80', min: 60, max: 80, count: 0 },
      { range: '80-100', min: 80, max: 100, count: 0 }
    ];

    cases.filter(c => c.success).forEach(c => {
      const bin = bins.find(b => c.qualityScore >= b.min && c.qualityScore <= b.max);
      if (bin) bin.count++;
    });

    return {
      type: 'histogram',
      title: 'Quality Score Distribution',
      xAxis: 'Quality Score Range',
      yAxis: 'Number of Cases',
      bins: bins.map(b => ({ range: b.range, count: b.count }))
    };
  }

  private createRouterAccuracyChart(cases: BacktestCase[]): PieChartData {
    const routerCases = cases.filter(c =>
      c.agentPattern === 'router' && c.routedModel !== undefined
    );

    const taskTypeAccuracy: Record<TaskType, { total: number; accurate: number }> = {} as any;

    routerCases.forEach(c => {
      if (!taskTypeAccuracy[c.taskType]) {
        taskTypeAccuracy[c.taskType] = { total: 0, accurate: 0 };
      }
      taskTypeAccuracy[c.taskType].total++;
      if (c.routingAccurate) {
        taskTypeAccuracy[c.taskType].accurate++;
      }
    });

    const total = Object.values(taskTypeAccuracy).reduce((sum, v) => sum + v.total, 0);

    return {
      type: 'pie',
      title: 'Router Accuracy by Task Type',
      data: Object.entries(taskTypeAccuracy).map(([type, stats]) => ({
        label: type,
        value: stats.total,
        percentage: total > 0 ? (stats.accurate / stats.total) * 100 : 0
      }))
    };
  }

  private createSpeedupChart(patterns: Record<AgentPattern, PatternMetrics>): BarChartData {
    return {
      type: 'bar',
      title: 'Average Speedup vs Human Developer',
      xAxis: 'Pattern',
      yAxis: 'Speedup Factor (x)',
      data: Object.entries(patterns)
        .filter(([_, metrics]) => metrics.totalCases > 0)
        .map(([pattern, metrics]) => ({
          label: this.formatPatternName(pattern as AgentPattern),
          value: metrics.avgSpeedup
        }))
    };
  }

  private createPatternUsageChart(patterns: Record<AgentPattern, PatternMetrics>): PieChartData {
    const total = Object.values(patterns).reduce((sum, p) => sum + p.totalCases, 0);

    return {
      type: 'pie',
      title: 'Pattern Usage Distribution',
      data: Object.entries(patterns)
        .filter(([_, metrics]) => metrics.totalCases > 0)
        .map(([pattern, metrics]) => ({
          label: this.formatPatternName(pattern as AgentPattern),
          value: metrics.totalCases,
          percentage: total > 0 ? (metrics.totalCases / total) * 100 : 0
        }))
    };
  }

  /**
   * Generate Markdown report
   */
  generateMarkdownReport(report: BacktestReport): string {
    const md: string[] = [];

    // Header
    md.push('# Agent Backtest Report\n');
    md.push(`Generated: ${new Date(report.metadata.generatedAt).toLocaleString()}\n`);
    md.push(`Report Version: ${report.metadata.reportVersion}\n`);
    md.push(`Total Cases: ${report.metadata.totalCases}\n`);
    md.push(`\n---\n`);

    // Executive Summary
    md.push('## Executive Summary\n');
    md.push('### Key Metrics\n');
    md.push(`- **Success Rate**: ${report.summary.successRate.toFixed(1)}%`);
    md.push(`- **Average Quality Score**: ${report.summary.avgQualityScore.toFixed(1)}/100`);
    md.push(`- **Average Speedup**: ${report.summary.avgSpeedup.toFixed(1)}x faster than human`);
    md.push(`- **Total Cost Savings**: $${report.summary.totalCostSavingsUSD.toFixed(2)}`);
    md.push(`- **Total Time Savings**: ${report.summary.totalTimeSavingsHours.toFixed(1)} hours\n`);

    md.push('### ROI Analysis\n');
    md.push(`- **Development Investment**: ${report.summary.developmentTimeHours} hours ($${report.summary.developmentCostUSD.toFixed(2)})`);
    md.push(`- **Annualized ROI**: ${report.summary.annualizedROI.toFixed(0)}%`);
    md.push(`- **Break-Even Point**: ${report.summary.breakEvenCases} cases`);

    const breakEvenStatus = report.summary.totalCases >= report.summary.breakEvenCases
      ? '✅ Already profitable!'
      : `⏳ ${report.summary.breakEvenCases - report.summary.totalCases} more cases to break-even`;
    md.push(`- **Status**: ${breakEvenStatus}\n`);

    // Pattern Analysis
    md.push('## Pattern Analysis\n');

    for (const [patternKey, metrics] of Object.entries(report.patternAnalysis)) {
      if (metrics.totalCases === 0) continue;

      const pattern = patternKey as AgentPattern;
      md.push(`### ${this.formatPatternName(pattern)}\n`);
      md.push(`- **Cases**: ${metrics.totalCases}`);
      md.push(`- **Success Rate**: ${metrics.successRate.toFixed(1)}%`);
      md.push(`- **Avg Quality**: ${metrics.avgQualityScore.toFixed(1)}/100`);
      md.push(`- **Avg Speedup**: ${metrics.avgSpeedup.toFixed(1)}x`);
      md.push(`- **Cost Savings**: $${metrics.totalCostSavings.toFixed(2)}`);
      md.push(`- **Time Savings**: ${(metrics.totalTimeSavingsMinutes / 60).toFixed(1)} hours`);

      if (metrics.routingAccuracy !== undefined) {
        md.push(`- **Routing Accuracy**: ${metrics.routingAccuracy.toFixed(1)}%`);
      }

      if (Object.keys(metrics.failureReasons).length > 0) {
        md.push('\n**Failure Analysis**:');
        for (const [reason, count] of Object.entries(metrics.failureReasons)) {
          md.push(`  - ${reason}: ${count} cases`);
        }
      }
      md.push('');
    }

    // Recommendations
    md.push('## Recommendations\n');
    report.recommendations.forEach((rec, i) => {
      md.push(`${i + 1}. ${rec}\n`);
    });

    // Case Details Summary
    md.push('## Case Details Summary\n');
    md.push('| ID | Task Type | Pattern | Success | Quality | Speedup | Savings |');
    md.push('|-----|-----------|---------|---------|---------|---------|---------|');

    report.caseDetails.slice(0, 20).forEach(c => {
      const speedup = c.success ? (c.humanTimeMinutes / Math.max(c.agentTimeMinutes, 0.1)).toFixed(1) : 'N/A';
      const savings = c.success ? `$${(c.humanCostUSD - c.agentCostUSD).toFixed(2)}` : '$0.00';

      md.push(
        `| ${c.id.substring(0, 8)} | ${c.taskType} | ${c.agentPattern} | ` +
        `${c.success ? '✅' : '❌'} | ${c.qualityScore.toFixed(0)} | ${speedup}x | ${savings} |`
      );
    });

    if (report.caseDetails.length > 20) {
      md.push(`\n*Showing 20 of ${report.caseDetails.length} cases*`);
    }

    // Charts Section
    md.push('\n## Visualizations\n');
    md.push('### Success Rate by Pattern\n');
    md.push('```');
    report.charts.successRateByPattern.data.forEach(d => {
      const bar = '█'.repeat(Math.round(d.value / 5));
      md.push(`${d.label.padEnd(20)} ${bar} ${d.value.toFixed(1)}%`);
    });
    md.push('```\n');

    md.push('### Pattern Usage\n');
    md.push('```');
    report.charts.patternUsage.data.forEach(d => {
      const bar = '█'.repeat(Math.round(d.percentage / 5));
      md.push(`${d.label.padEnd(20)} ${bar} ${d.value} cases (${d.percentage.toFixed(1)}%)`);
    });
    md.push('```\n');

    // Footer
    md.push('---\n');
    md.push(`*Generated by BacktestReporter v${  report.metadata.reportVersion  }*\n`);

    return md.join('\n');
  }

  /**
   * Generate JSON report
   */
  generateJSONReport(report: BacktestReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate executive summary text
   */
  generateExecutiveSummary(report: BacktestReport): string {
    const summary: string[] = [];

    summary.push('='.repeat(70));
    summary.push('AGENT BACKTEST - EXECUTIVE SUMMARY');
    summary.push('='.repeat(70));
    summary.push('');

    summary.push('BUSINESS IMPACT:');
    summary.push(`  Total Cost Savings:     $${report.summary.totalCostSavingsUSD.toFixed(2)}`);
    summary.push(`  Time Savings:           ${report.summary.totalTimeSavingsHours.toFixed(1)} hours`);
    summary.push(`  ROI (Annualized):       ${report.summary.annualizedROI.toFixed(0)}%`);
    summary.push('');

    summary.push('PERFORMANCE:');
    summary.push(`  Success Rate:           ${report.summary.successRate.toFixed(1)}%`);
    summary.push(`  Quality Score:          ${report.summary.avgQualityScore.toFixed(1)}/100`);
    summary.push(`  Speed vs Human:         ${report.summary.avgSpeedup.toFixed(1)}x faster`);
    summary.push('');

    summary.push('INVESTMENT:');
    summary.push(`  Development Time:       ${report.summary.developmentTimeHours} hours`);
    summary.push(`  Development Cost:       $${report.summary.developmentCostUSD.toFixed(2)}`);
    summary.push(`  Break-Even Point:       ${report.summary.breakEvenCases} cases`);
    summary.push(`  Cases Completed:        ${report.summary.totalCases} cases`);

    const profitStatus = report.summary.totalCases >= report.summary.breakEvenCases
      ? 'PROFITABLE ✓'
      : `${report.summary.breakEvenCases - report.summary.totalCases} cases to break-even`;
    summary.push(`  Status:                 ${profitStatus}`);
    summary.push('');

    summary.push('PATTERN PERFORMANCE:');
    for (const [patternKey, metrics] of Object.entries(report.patternAnalysis)) {
      if (metrics.totalCases === 0) continue;
      const name = this.formatPatternName(patternKey as AgentPattern);
      summary.push(`  ${name.padEnd(22)} ${metrics.successRate.toFixed(1)}% success, ${metrics.avgSpeedup.toFixed(1)}x speedup`);
    }
    summary.push('');

    summary.push('TOP RECOMMENDATIONS:');
    report.recommendations.slice(0, 3).forEach((rec, i) => {
      const wrapped = this.wrapText(rec, 65, '    ');
      summary.push(`  ${i + 1}. ${wrapped}`);
    });
    summary.push('');

    summary.push('='.repeat(70));
    summary.push(`Generated: ${new Date(report.metadata.generatedAt).toLocaleString()}`);
    summary.push('='.repeat(70));

    return summary.join('\n');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private getDateRange(cases: BacktestCase[]): { start: string; end: string } {
    if (cases.length === 0) {
      return { start: new Date().toISOString(), end: new Date().toISOString() };
    }

    const dates = cases.map(c => new Date(c.timestamp).getTime());
    return {
      start: new Date(Math.min(...dates)).toISOString(),
      end: new Date(Math.max(...dates)).toISOString()
    };
  }

  private getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private formatPatternName(pattern: AgentPattern): string {
    const names: Record<AgentPattern, string> = {
      'evaluator-optimizer': 'Evaluator-Optimizer',
      'router': 'Router',
      'orchestrator': 'Orchestrator',
      'prompt-cache': 'Prompt Cache'
    };
    return names[pattern];
  }

  private wrapText(text: string, maxWidth: number, indent = ''): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + word).length > maxWidth) {
        lines.push(currentLine.trim());
        currentLine = `${indent + word  } `;
      } else {
        currentLine += `${word  } `;
      }
    });

    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }

    return lines.join('\n');
  }
}
