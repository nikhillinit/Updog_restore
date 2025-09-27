#!/usr/bin/env tsx

/**
 * Test Health Monitoring Dashboard
 *
 * Provides real-time monitoring and reporting of test suite health,
 * including failure patterns, performance trends, and automated recommendations.
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const dashboardDir = join(projectRoot, 'tests/dashboard');

interface TestMetrics {
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  failureCategories: Record<string, number>;
  slowestTests: Array<{
    name: string;
    duration: number;
    file: string;
  }>;
}

interface HealthReport {
  overall: 'healthy' | 'warning' | 'critical';
  score: number; // 0-100
  trends: {
    passRate: number; // percentage change
    duration: number; // percentage change
    coverage: number; // percentage change
  };
  recommendations: string[];
  alerts: string[];
}

interface TestTrend {
  date: string;
  passRate: number;
  avgDuration: number;
  totalTests: number;
  coverage: number;
}

class TestHealthDashboard {
  private metricsHistory: TestMetrics[] = [];
  private healthThresholds = {
    passRate: { healthy: 95, warning: 85 },
    duration: { healthy: 30000, warning: 60000 }, // milliseconds
    coverage: { healthy: 80, warning: 70 }
  };

  constructor() {
    this.loadHistoricalData();
    this.ensureDashboardDirectory();
  }

  /**
   * Ensure dashboard directory exists
   */
  private ensureDashboardDirectory(): void {
    if (!existsSync(dashboardDir)) {
      mkdirSync(dashboardDir, { recursive: true });
    }
  }

  /**
   * Load historical test metrics
   */
  private loadHistoricalData(): void {
    const historyFile = join(dashboardDir, 'test-metrics-history.json');

    if (existsSync(historyFile)) {
      try {
        const data = readFileSync(historyFile, 'utf-8');
        this.metricsHistory = JSON.parse(data);
      } catch (error) {
        console.warn('Failed to load historical test data:', error);
        this.metricsHistory = [];
      }
    }
  }

  /**
   * Save metrics to history
   */
  private saveMetrics(metrics: TestMetrics): void {
    this.metricsHistory.push(metrics);

    // Keep only last 100 entries
    if (this.metricsHistory.length > 100) {
      this.metricsHistory = this.metricsHistory.slice(-100);
    }

    const historyFile = join(dashboardDir, 'test-metrics-history.json');
    writeFileSync(historyFile, JSON.stringify(this.metricsHistory, null, 2));
  }

  /**
   * Run tests and collect metrics
   */
  async collectTestMetrics(): Promise<TestMetrics> {
    console.log('🔍 Collecting test metrics...');

    const startTime = Date.now();
    let testOutput = '';
    let failed = 0;
    let total = 0;
    let passed = 0;

    try {
      // Run tests with JSON reporter for easier parsing
      testOutput = execSync('npm run test:quick -- --reporter=json', {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 120000 // 2 minutes
      });
    } catch (error: any) {
      testOutput = error.stdout || error.stderr || '';
    }

    const duration = Date.now() - startTime;

    // Parse test results
    const metrics = this.parseTestOutput(testOutput, duration);

    // Collect coverage if available
    try {
      const coverageOutput = execSync('npm run test:coverage -- --reporter=json', {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 60000
      });

      metrics.coverage = this.parseCoverageOutput(coverageOutput);
    } catch (error) {
      console.warn('Coverage collection failed, skipping...');
    }

    this.saveMetrics(metrics);
    return metrics;
  }

  /**
   * Parse test output to extract metrics
   */
  private parseTestOutput(output: string, duration: number): TestMetrics {
    const metrics: TestMetrics = {
      timestamp: new Date().toISOString(),
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration,
      failureCategories: {},
      slowestTests: []
    };

    try {
      // Try to parse JSON output first
      const lines = output.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.includes('❯') && line.includes('.test.ts')) {
          metrics.total++;

          if (line.includes('✓')) {
            metrics.passed++;
          } else if (line.includes('❯') && (line.includes('failed') || line.includes('×'))) {
            metrics.failed++;

            // Categorize failure
            const category = this.categorizeFailure(line);
            metrics.failureCategories[category] = (metrics.failureCategories[category] || 0) + 1;
          }
        }

        // Extract slow tests
        const slowTestMatch = line.match(/(.+\.test\.ts).*(\d+)ms/);
        if (slowTestMatch) {
          const [, file, time] = slowTestMatch;
          const duration = parseInt(time);

          if (duration > 1000) { // Tests slower than 1 second
            metrics.slowestTests.push({
              name: file.split('/').pop() || file,
              duration,
              file
            });
          }
        }
      }

      // Sort slowest tests
      metrics.slowestTests.sort((a, b) => b.duration - a.duration);
      metrics.slowestTests = metrics.slowestTests.slice(0, 10); // Top 10

    } catch (error) {
      console.warn('Failed to parse test output:', error);

      // Fallback parsing
      const totalMatch = output.match(/(\d+) tests?/);
      const failedMatch = output.match(/(\d+) failed/);
      const passedMatch = output.match(/(\d+) passed/);

      if (totalMatch) metrics.total = parseInt(totalMatch[1]);
      if (failedMatch) metrics.failed = parseInt(failedMatch[1]);
      if (passedMatch) metrics.passed = parseInt(passedMatch[1]);
    }

    return metrics;
  }

  /**
   * Categorize test failure based on error message
   */
  private categorizeFailure(line: string): string {
    if (line.includes('db.execute is not a function')) return 'Database Connection';
    if (line.includes('Redis')) return 'Redis Connection';
    if (line.includes('timeout')) return 'Timeout';
    if (line.includes('XIRR') || line.includes('IRR')) return 'Financial Calculations';
    if (line.includes('Cannot find module')) return 'Import Resolution';
    if (line.includes('schema') || line.includes('validation')) return 'Schema Validation';
    return 'Other';
  }

  /**
   * Parse coverage output
   */
  private parseCoverageOutput(output: string): TestMetrics['coverage'] {
    try {
      // Simple coverage parsing - this would need to be adapted based on actual coverage format
      const linesMatch = output.match(/Lines\s+:\s+(\d+(?:\.\d+)?)%/);
      const functionsMatch = output.match(/Functions\s+:\s+(\d+(?:\.\d+)?)%/);
      const branchesMatch = output.match(/Branches\s+:\s+(\d+(?:\.\d+)?)%/);
      const statementsMatch = output.match(/Statements\s+:\s+(\d+(?:\.\d+)?)%/);

      return {
        lines: linesMatch ? parseFloat(linesMatch[1]) : 0,
        functions: functionsMatch ? parseFloat(functionsMatch[1]) : 0,
        branches: branchesMatch ? parseFloat(branchesMatch[1]) : 0,
        statements: statementsMatch ? parseFloat(statementsMatch[1]) : 0
      };
    } catch (error) {
      return { lines: 0, functions: 0, branches: 0, statements: 0 };
    }
  }

  /**
   * Generate health report based on current and historical metrics
   */
  generateHealthReport(currentMetrics: TestMetrics): HealthReport {
    const passRate = currentMetrics.total > 0 ? (currentMetrics.passed / currentMetrics.total) * 100 : 0;
    const coverage = currentMetrics.coverage ? currentMetrics.coverage.lines : 0;

    let overall: HealthReport['overall'] = 'healthy';
    let score = 100;

    const recommendations: string[] = [];
    const alerts: string[] = [];

    // Evaluate pass rate
    if (passRate < this.healthThresholds.passRate.warning) {
      overall = passRate < this.healthThresholds.passRate.healthy ? 'critical' : 'warning';
      score -= (100 - passRate);

      alerts.push(`Test pass rate is ${passRate.toFixed(1)}% (below ${this.healthThresholds.passRate.warning}% threshold)`);
      recommendations.push('Review and fix failing tests immediately');
      recommendations.push('Consider running test repair automation: npm run test:repair');
    }

    // Evaluate duration
    if (currentMetrics.duration > this.healthThresholds.duration.warning) {
      if (overall !== 'critical') {
        overall = currentMetrics.duration > this.healthThresholds.duration.healthy ? 'critical' : 'warning';
      }
      score -= 10;

      alerts.push(`Test duration is ${(currentMetrics.duration / 1000).toFixed(1)}s (above ${this.healthThresholds.duration.warning / 1000}s threshold)`);
      recommendations.push('Optimize slow tests or increase parallelization');
      recommendations.push('Use intelligent test selection: npm run test:smart');
    }

    // Evaluate coverage
    if (coverage < this.healthThresholds.coverage.warning) {
      if (overall === 'healthy') {
        overall = coverage < this.healthThresholds.coverage.healthy ? 'warning' : 'healthy';
      }
      score -= 5;

      alerts.push(`Test coverage is ${coverage.toFixed(1)}% (below ${this.healthThresholds.coverage.warning}% threshold)`);
      recommendations.push('Add tests for uncovered code paths');
    }

    // Calculate trends
    const trends = this.calculateTrends(currentMetrics);

    // Add trend-based recommendations
    if (trends.passRate < -5) {
      recommendations.push('Test reliability is declining - investigate recent failures');
    }
    if (trends.duration > 20) {
      recommendations.push('Test performance is degrading - profile slow tests');
    }

    // Failure pattern analysis
    const topFailureCategory = Object.entries(currentMetrics.failureCategories)
      .sort(([,a], [,b]) => b - a)[0];

    if (topFailureCategory && topFailureCategory[1] > 3) {
      alerts.push(`Multiple ${topFailureCategory[0]} failures detected (${topFailureCategory[1]} tests)`);

      switch (topFailureCategory[0]) {
        case 'Database Connection':
          recommendations.push('Fix database connection issues in test infrastructure');
          break;
        case 'Redis Connection':
          recommendations.push('Mock Redis connections or ensure Redis is available for tests');
          break;
        case 'Financial Calculations':
          recommendations.push('Review XIRR and other financial calculation implementations');
          break;
        case 'Import Resolution':
          recommendations.push('Check import paths and module resolution configuration');
          break;
      }
    }

    return {
      overall,
      score: Math.max(0, score),
      trends,
      recommendations,
      alerts
    };
  }

  /**
   * Calculate trends based on historical data
   */
  private calculateTrends(currentMetrics: TestMetrics): HealthReport['trends'] {
    const trends = { passRate: 0, duration: 0, coverage: 0 };

    if (this.metricsHistory.length < 2) {
      return trends;
    }

    const recent = this.metricsHistory.slice(-5); // Last 5 runs
    const older = this.metricsHistory.slice(-10, -5); // Previous 5 runs

    if (recent.length === 0 || older.length === 0) {
      return trends;
    }

    // Calculate average metrics for comparison
    const recentAvg = {
      passRate: recent.reduce((sum, m) => sum + (m.passed / m.total * 100), 0) / recent.length,
      duration: recent.reduce((sum, m) => sum + m.duration, 0) / recent.length,
      coverage: recent.reduce((sum, m) => sum + (m.coverage?.lines || 0), 0) / recent.length
    };

    const olderAvg = {
      passRate: older.reduce((sum, m) => sum + (m.passed / m.total * 100), 0) / older.length,
      duration: older.reduce((sum, m) => sum + m.duration, 0) / older.length,
      coverage: older.reduce((sum, m) => sum + (m.coverage?.lines || 0), 0) / older.length
    };

    // Calculate percentage changes
    trends.passRate = olderAvg.passRate > 0 ?
      ((recentAvg.passRate - olderAvg.passRate) / olderAvg.passRate) * 100 : 0;

    trends.duration = olderAvg.duration > 0 ?
      ((recentAvg.duration - olderAvg.duration) / olderAvg.duration) * 100 : 0;

    trends.coverage = olderAvg.coverage > 0 ?
      ((recentAvg.coverage - olderAvg.coverage) / olderAvg.coverage) * 100 : 0;

    return trends;
  }

  /**
   * Generate HTML dashboard
   */
  generateHTMLDashboard(metrics: TestMetrics, health: HealthReport): string {
    const passRate = metrics.total > 0 ? (metrics.passed / metrics.total) * 100 : 0;
    const coverage = metrics.coverage ? metrics.coverage.lines : 0;

    const statusColors = {
      healthy: '#10B981',
      warning: '#F59E0B',
      critical: '#EF4444'
    };

    const statusColor = statusColors[health.overall];

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Health Dashboard - Updog Fund Management</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
            color: #1e293b;
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 30px;
            border-left: 4px solid ${statusColor};
        }
        .status-badge {
            display: inline-block;
            background: ${statusColor};
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 12px;
            margin-left: 10px;
        }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card {
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #e2e8f0;
        }
        .metric:last-child { margin-bottom: 0; border-bottom: none; }
        .metric-value {
            font-size: 24px;
            font-weight: 700;
            color: #1e293b;
        }
        .metric-label {
            color: #64748b;
            font-size: 14px;
        }
        .trend {
            font-size: 12px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            margin-left: 8px;
        }
        .trend.positive { background: #dcfce7; color: #166534; }
        .trend.negative { background: #fee2e2; color: #dc2626; }
        .trend.neutral { background: #f1f5f9; color: #475569; }
        .progress-bar {
            width: 100%;
            height: 8px;
            background: #e2e8f0;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 8px;
        }
        .progress-fill {
            height: 100%;
            transition: width 0.3s ease;
        }
        .alerts { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .recommendations { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; }
        .alert, .recommendation {
            margin-bottom: 10px;
            padding: 8px 0;
            border-bottom: 1px solid rgba(0,0,0,0.1);
        }
        .alert:last-child, .recommendation:last-child { border-bottom: none; margin-bottom: 0; }
        .failure-categories {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 15px;
        }
        .category-chip {
            background: #f1f5f9;
            color: #475569;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .slow-tests {
            max-height: 200px;
            overflow-y: auto;
        }
        .slow-test {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .slow-test:last-child { border-bottom: none; }
        .test-name { font-family: monospace; font-size: 12px; color: #475569; }
        .test-duration { font-weight: 600; color: #dc2626; }
        .timestamp {
            color: #64748b;
            font-size: 14px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Test Health Dashboard</h1>
            <span class="status-badge">${health.overall}</span>
            <p>Overall Health Score: ${health.score}/100</p>
            <div class="timestamp">Last updated: ${new Date().toLocaleString()}</div>
        </div>

        <div class="grid">
            <div class="card">
                <h2>Test Results</h2>
                <div class="metric">
                    <div>
                        <div class="metric-label">Pass Rate</div>
                        <div class="metric-value">${passRate.toFixed(1)}%</div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${passRate}%; background: ${passRate >= 95 ? '#10B981' : passRate >= 85 ? '#F59E0B' : '#EF4444'};"></div>
                        </div>
                    </div>
                    <span class="trend ${health.trends.passRate >= 0 ? 'positive' : 'negative'}">
                        ${health.trends.passRate >= 0 ? '+' : ''}${health.trends.passRate.toFixed(1)}%
                    </span>
                </div>
                <div class="metric">
                    <div>
                        <div class="metric-label">Total Tests</div>
                        <div class="metric-value">${metrics.total}</div>
                    </div>
                </div>
                <div class="metric">
                    <div>
                        <div class="metric-label">Passed</div>
                        <div class="metric-value" style="color: #10B981;">${metrics.passed}</div>
                    </div>
                </div>
                <div class="metric">
                    <div>
                        <div class="metric-label">Failed</div>
                        <div class="metric-value" style="color: #EF4444;">${metrics.failed}</div>
                    </div>
                </div>
                <div class="metric">
                    <div>
                        <div class="metric-label">Duration</div>
                        <div class="metric-value">${(metrics.duration / 1000).toFixed(1)}s</div>
                    </div>
                    <span class="trend ${health.trends.duration <= 0 ? 'positive' : 'negative'}">
                        ${health.trends.duration >= 0 ? '+' : ''}${health.trends.duration.toFixed(1)}%
                    </span>
                </div>
            </div>

            <div class="card">
                <h2>Code Coverage</h2>
                <div class="metric">
                    <div>
                        <div class="metric-label">Lines</div>
                        <div class="metric-value">${coverage.toFixed(1)}%</div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${coverage}%; background: ${coverage >= 80 ? '#10B981' : coverage >= 70 ? '#F59E0B' : '#EF4444'};"></div>
                        </div>
                    </div>
                    <span class="trend ${health.trends.coverage >= 0 ? 'positive' : 'negative'}">
                        ${health.trends.coverage >= 0 ? '+' : ''}${health.trends.coverage.toFixed(1)}%
                    </span>
                </div>
                ${metrics.coverage ? `
                <div class="metric">
                    <div>
                        <div class="metric-label">Functions</div>
                        <div class="metric-value">${metrics.coverage.functions.toFixed(1)}%</div>
                    </div>
                </div>
                <div class="metric">
                    <div>
                        <div class="metric-label">Branches</div>
                        <div class="metric-value">${metrics.coverage.branches.toFixed(1)}%</div>
                    </div>
                </div>
                <div class="metric">
                    <div>
                        <div class="metric-label">Statements</div>
                        <div class="metric-value">${metrics.coverage.statements.toFixed(1)}%</div>
                    </div>
                </div>` : ''}
            </div>

            <div class="card">
                <h2>Failure Analysis</h2>
                <div class="failure-categories">
                    ${Object.entries(metrics.failureCategories).map(([category, count]) =>
                        `<div class="category-chip">${category}: ${count}</div>`
                    ).join('')}
                </div>
            </div>

            <div class="card">
                <h2>Slowest Tests</h2>
                <div class="slow-tests">
                    ${metrics.slowestTests.map(test => `
                        <div class="slow-test">
                            <div class="test-name">${test.name}</div>
                            <div class="test-duration">${test.duration}ms</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        ${health.alerts.length > 0 ? `
        <div class="alerts">
            <h3>🚨 Alerts</h3>
            ${health.alerts.map(alert => `<div class="alert">• ${alert}</div>`).join('')}
        </div>
        ` : ''}

        ${health.recommendations.length > 0 ? `
        <div class="recommendations">
            <h3>💡 Recommendations</h3>
            ${health.recommendations.map(rec => `<div class="recommendation">• ${rec}</div>`).join('')}
        </div>
        ` : ''}
    </div>
</body>
</html>`;
  }

  /**
   * Generate and save dashboard
   */
  async generateDashboard(): Promise<void> {
    console.log('📊 Generating test health dashboard...\n');

    const metrics = await this.collectTestMetrics();
    const health = this.generateHealthReport(metrics);

    // Generate HTML dashboard
    const htmlDashboard = this.generateHTMLDashboard(metrics, health);
    const dashboardPath = join(dashboardDir, 'index.html');
    writeFileSync(dashboardPath, htmlDashboard);

    // Generate JSON report for automation
    const jsonReport = {
      timestamp: metrics.timestamp,
      metrics,
      health,
      summary: {
        passRate: metrics.total > 0 ? (metrics.passed / metrics.total) * 100 : 0,
        duration: metrics.duration,
        coverage: metrics.coverage ? metrics.coverage.lines : 0,
        topFailureCategory: Object.entries(metrics.failureCategories)
          .sort(([,a], [,b]) => b - a)[0]?.[0] || 'None'
      }
    };

    const jsonPath = join(dashboardDir, 'health-report.json');
    writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

    // Console output
    console.log(`📊 Test Health Dashboard Generated`);
    console.log(`================================`);
    console.log(`Overall Status: ${health.overall.toUpperCase()}`);
    console.log(`Health Score: ${health.score}/100`);
    console.log(`Pass Rate: ${jsonReport.summary.passRate.toFixed(1)}%`);
    console.log(`Duration: ${(jsonReport.summary.duration / 1000).toFixed(1)}s`);
    console.log(`Coverage: ${jsonReport.summary.coverage.toFixed(1)}%`);

    if (health.alerts.length > 0) {
      console.log(`\n🚨 Alerts:`);
      health.alerts.forEach(alert => console.log(`  • ${alert}`));
    }

    if (health.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      health.recommendations.forEach(rec => console.log(`  • ${rec}`));
    }

    console.log(`\n📁 Dashboard saved to: ${dashboardPath}`);
    console.log(`📄 JSON report saved to: ${jsonPath}`);
  }

  /**
   * Watch mode - continuously monitor test health
   */
  async watchMode(): Promise<void> {
    console.log('👀 Starting test health monitoring...\n');

    const interval = 5 * 60 * 1000; // 5 minutes

    while (true) {
      try {
        await this.generateDashboard();
        console.log(`\n⏰ Next update in 5 minutes...\n`);
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        console.error('❌ Dashboard generation failed:', error);
        await new Promise(resolve => setTimeout(resolve, 30000)); // Retry in 30 seconds
      }
    }
  }

  /**
   * Main execution function
   */
  async run(args: string[] = []): Promise<void> {
    if (args.includes('--watch')) {
      await this.watchMode();
    } else {
      await this.generateDashboard();
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const dashboard = new TestHealthDashboard();
  dashboard.run(process.argv.slice(2)).catch(error => {
    console.error('💥 Test health dashboard failed:', error);
    process.exit(1);
  });
}

export { TestHealthDashboard, TestMetrics, HealthReport };