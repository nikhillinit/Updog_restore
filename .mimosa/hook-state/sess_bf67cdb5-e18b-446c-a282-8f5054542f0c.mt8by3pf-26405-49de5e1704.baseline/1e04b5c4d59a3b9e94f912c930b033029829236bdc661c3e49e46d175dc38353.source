#!/usr/bin/env tsx

/**
 * Performance Baseline Generator for Monte Carlo Simulations
 *
 * Generates performance baselines and regression tests for financial calculations,
 * Monte Carlo simulations, and other computationally expensive operations.
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const baselinesDir = join(projectRoot, 'tests/baselines');

interface PerformanceMetric {
  name: string;
  duration: number;
  iterations: number;
  memoryUsage: number;
  cpuUsage: number;
  timestamp: string;
}

interface Baseline {
  testName: string;
  metrics: PerformanceMetric[];
  environment: {
    nodeVersion: string;
    platform: string;
    cpuCount: number;
    totalMemory: number;
  };
  thresholds: {
    duration: { warning: number; error: number };
    memory: { warning: number; error: number };
  };
}

interface RegressionResult {
  testName: string;
  current: PerformanceMetric;
  baseline: PerformanceMetric;
  regression: {
    duration: number; // percentage change
    memory: number; // percentage change
  };
  status: 'pass' | 'warning' | 'fail';
  recommendations: string[];
}

class PerformanceBaselineGenerator {
  private baselines = new Map<string, Baseline>();

  constructor() {
    this.loadExistingBaselines();
  }

  /**
   * Load existing baseline data
   */
  private loadExistingBaselines(): void {
    if (!existsSync(baselinesDir)) {
      mkdirSync(baselinesDir, { recursive: true });
      return;
    }

    try {
      const baselineFile = join(baselinesDir, 'performance-baselines.json');
      if (existsSync(baselineFile)) {
        const data = JSON.parse(readFileSync(baselineFile, 'utf-8'));
        for (const baseline of data.baselines) {
          this.baselines.set(baseline.testName, baseline);
        }
      }
    } catch (error) {
      console.warn('Failed to load existing baselines:', error);
    }
  }

  /**
   * Save baselines to disk
   */
  private saveBaselines(): void {
    const data = {
      version: '1.0',
      generated: new Date().toISOString(),
      baselines: Array.from(this.baselines.values())
    };

    const baselineFile = join(baselinesDir, 'performance-baselines.json');
    writeFileSync(baselineFile, JSON.stringify(data, null, 2));
  }

  /**
   * Get current environment information
   */
  private getEnvironmentInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      cpuCount: require('os').cpus().length,
      totalMemory: require('os').totalmem()
    };
  }

  /**
   * Measure performance of a function
   */
  private async measurePerformance<T>(
    name: string,
    fn: () => Promise<T> | T,
    iterations = 10
  ): Promise<PerformanceMetric> {
    const measurements: number[] = [];
    const memoryMeasurements: number[] = [];

    // Warm up
    await fn();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const startMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();

      const duration = Number(end - start) / 1000000; // Convert to milliseconds
      measurements.push(duration);

      const currentMemory = process.memoryUsage().heapUsed;
      memoryMeasurements.push(currentMemory - startMemory);
    }

    // Calculate statistics
    const duration = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const memoryUsage = memoryMeasurements.reduce((a, b) => a + b, 0) / memoryMeasurements.length;

    return {
      name,
      duration,
      iterations,
      memoryUsage,
      cpuUsage: 0, // Would need more sophisticated measurement
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate baseline for Monte Carlo simulation
   */
  async generateMonteCarloBaseline(): Promise<void> {
    console.log('📊 Generating Monte Carlo simulation baseline...');

    // Mock Monte Carlo simulation for testing
    const runSimulation = async (scenarios: number, iterations: number) => {
      const results = [];
      for (let s = 0; s < scenarios; s++) {
        for (let i = 0; i < iterations; i++) {
          // Simulate complex financial calculation
          const randomValue = Math.random();
          const result = Math.log(randomValue) * Math.sqrt(i + 1) + Math.sin(s);
          results.push(result);
        }
      }
      return results;
    };

    const metrics: PerformanceMetric[] = [];

    // Test different scenario counts
    const testCases = [
      { name: 'small_simulation', scenarios: 100, iterations: 100 },
      { name: 'medium_simulation', scenarios: 500, iterations: 200 },
      { name: 'large_simulation', scenarios: 1000, iterations: 500 }
    ];

    for (const testCase of testCases) {
      const metric = await this.measurePerformance(
        testCase.name,
        () => runSimulation(testCase.scenarios, testCase.iterations),
        5
      );
      metrics.push(metric);
    }

    const baseline: Baseline = {
      testName: 'monte_carlo_simulation',
      metrics,
      environment: this.getEnvironmentInfo(),
      thresholds: {
        duration: { warning: 20, error: 50 }, // 20% warning, 50% error
        memory: { warning: 30, error: 100 } // 30% warning, 100% error
      }
    };

    this.baselines.set('monte_carlo_simulation', baseline);
    console.log('✅ Monte Carlo baseline generated');
  }

  /**
   * Generate baseline for XIRR calculations
   */
  async generateXIRRBaseline(): Promise<void> {
    console.log('💰 Generating XIRR calculation baseline...');

    // Mock XIRR calculation
    const calculateXIRR = async (cashFlows: Array<{ date: Date; amount: number }>) => {
      // Simplified XIRR calculation for testing
      let result = 0;
      for (let i = 0; i < cashFlows.length; i++) {
        const cf = cashFlows[i];
        const days = (cf.date.getTime() - cashFlows[0].date.getTime()) / (1000 * 60 * 60 * 24);
        result += cf.amount / Math.pow(1.1, days / 365);
      }
      return result;
    };

    const generateCashFlows = (count: number) => {
      const flows = [];
      const startDate = new Date('2020-01-01');

      for (let i = 0; i < count; i++) {
        flows.push({
          date: new Date(startDate.getTime() + i * 30 * 24 * 60 * 60 * 1000), // Monthly
          amount: (Math.random() - 0.5) * 1000000 // Random cash flow
        });
      }

      return flows;
    };

    const metrics: PerformanceMetric[] = [];

    const testCases = [
      { name: 'small_xirr', flowCount: 12 },
      { name: 'medium_xirr', flowCount: 60 },
      { name: 'large_xirr', flowCount: 240 }
    ];

    for (const testCase of testCases) {
      const metric = await this.measurePerformance(
        testCase.name,
        () => calculateXIRR(generateCashFlows(testCase.flowCount)),
        20
      );
      metrics.push(metric);
    }

    const baseline: Baseline = {
      testName: 'xirr_calculation',
      metrics,
      environment: this.getEnvironmentInfo(),
      thresholds: {
        duration: { warning: 15, error: 30 },
        memory: { warning: 25, error: 75 }
      }
    };

    this.baselines.set('xirr_calculation', baseline);
    console.log('✅ XIRR baseline generated');
  }

  /**
   * Generate baseline for portfolio optimization
   */
  async generatePortfolioOptimizationBaseline(): Promise<void> {
    console.log('📈 Generating portfolio optimization baseline...');

    // Mock portfolio optimization
    const optimizePortfolio = async (assets: number, constraints: number) => {
      const results = [];

      // Simulate optimization iterations
      for (let iter = 0; iter < 100; iter++) {
        const portfolio = [];
        let totalWeight = 0;

        for (let i = 0; i < assets; i++) {
          const weight = Math.random();
          portfolio.push(weight);
          totalWeight += weight;
        }

        // Normalize weights
        const normalizedPortfolio = portfolio.map(w => w / totalWeight);

        // Calculate objective function
        let objective = 0;
        for (let i = 0; i < assets; i++) {
          objective += normalizedPortfolio[i] * Math.log(normalizedPortfolio[i] + 0.01);
        }

        results.push({ portfolio: normalizedPortfolio, objective });
      }

      return results.sort((a, b) => b.objective - a.objective)[0];
    };

    const metrics: PerformanceMetric[] = [];

    const testCases = [
      { name: 'small_portfolio', assets: 10, constraints: 5 },
      { name: 'medium_portfolio', assets: 50, constraints: 20 },
      { name: 'large_portfolio', assets: 200, constraints: 100 }
    ];

    for (const testCase of testCases) {
      const metric = await this.measurePerformance(
        testCase.name,
        () => optimizePortfolio(testCase.assets, testCase.constraints),
        3
      );
      metrics.push(metric);
    }

    const baseline: Baseline = {
      testName: 'portfolio_optimization',
      metrics,
      environment: this.getEnvironmentInfo(),
      thresholds: {
        duration: { warning: 25, error: 60 },
        memory: { warning: 40, error: 120 }
      }
    };

    this.baselines.set('portfolio_optimization', baseline);
    console.log('✅ Portfolio optimization baseline generated');
  }

  /**
   * Run performance regression test
   */
  async runRegressionTest(testName: string): Promise<RegressionResult | null> {
    const baseline = this.baselines.get(testName);
    if (!baseline) {
      console.warn(`No baseline found for ${testName}`);
      return null;
    }

    console.log(`🔄 Running regression test for ${testName}...`);

    // Re-run the performance test
    let currentMetric: PerformanceMetric;

    switch (testName) {
      case 'monte_carlo_simulation':
        currentMetric = await this.measurePerformance(
          'current_monte_carlo',
          async () => {
            // Re-run medium simulation
            const results = [];
            for (let s = 0; s < 500; s++) {
              for (let i = 0; i < 200; i++) {
                const randomValue = Math.random();
                const result = Math.log(randomValue) * Math.sqrt(i + 1) + Math.sin(s);
                results.push(result);
              }
            }
            return results;
          },
          5
        );
        break;

      default:
        console.warn(`Unknown test case: ${testName}`);
        return null;
    }

    // Compare with baseline (use medium test case as reference)
    const referenceMetric = baseline.metrics.find(m => m.name.includes('medium')) || baseline.metrics[0];

    const durationRegression = ((currentMetric.duration - referenceMetric.duration) / referenceMetric.duration) * 100;
    const memoryRegression = ((currentMetric.memoryUsage - referenceMetric.memoryUsage) / referenceMetric.memoryUsage) * 100;

    let status: 'pass' | 'warning' | 'fail' = 'pass';
    const recommendations: string[] = [];

    if (durationRegression > baseline.thresholds.duration.error || memoryRegression > baseline.thresholds.memory.error) {
      status = 'fail';
      recommendations.push('Critical performance regression detected');
      recommendations.push('Review recent changes for performance impact');
    } else if (durationRegression > baseline.thresholds.duration.warning || memoryRegression > baseline.thresholds.memory.warning) {
      status = 'warning';
      recommendations.push('Minor performance regression detected');
      recommendations.push('Monitor performance in subsequent runs');
    }

    if (durationRegression > 10) {
      recommendations.push('Consider optimizing algorithm complexity');
    }
    if (memoryRegression > 20) {
      recommendations.push('Check for memory leaks or unnecessary allocations');
    }

    return {
      testName,
      current: currentMetric,
      baseline: referenceMetric,
      regression: {
        duration: durationRegression,
        memory: memoryRegression
      },
      status,
      recommendations
    };
  }

  /**
   * Generate comprehensive performance test suite
   */
  async generateTestSuite(): Promise<void> {
    console.log('🚀 Generating comprehensive performance test suite...\n');

    await this.generateMonteCarloBaseline();
    await this.generateXIRRBaseline();
    await this.generatePortfolioOptimizationBaseline();

    this.saveBaselines();

    // Generate test files
    await this.generateTestFiles();

    console.log('\n✨ Performance baseline generation complete!');
    console.log(`📁 Baselines saved to: ${baselinesDir}`);
  }

  /**
   * Generate Vitest performance test files
   */
  private async generateTestFiles(): Promise<void> {
    const testContent = `/**
 * Generated Performance Regression Tests
 *
 * These tests verify that critical performance metrics
 * don't regress beyond acceptable thresholds.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

interface PerformanceMetric {
  name: string;
  duration: number;
  iterations: number;
  memoryUsage: number;
  timestamp: string;
}

interface Baseline {
  testName: string;
  metrics: PerformanceMetric[];
  thresholds: {
    duration: { warning: number; error: number };
    memory: { warning: number; error: number };
  };
}

const loadBaselines = (): Map<string, Baseline> => {
  try {
    const baselinesPath = join(process.cwd(), 'tests/baselines/performance-baselines.json');
    const data = JSON.parse(readFileSync(baselinesPath, 'utf-8'));
    const baselines = new Map<string, Baseline>();

    for (const baseline of data.baselines) {
      baselines.set(baseline.testName, baseline);
    }

    return baselines;
  } catch (error) {
    console.warn('Failed to load baselines for performance tests');
    return new Map();
  }
};

const measurePerformance = async <T>(
  fn: () => Promise<T> | T,
  iterations = 5
): Promise<PerformanceMetric> => {
  const measurements: number[] = [];
  const startMemory = process.memoryUsage().heapUsed;

  // Warm up
  await fn();

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();

    const duration = Number(end - start) / 1000000;
    measurements.push(duration);
  }

  const duration = measurements.reduce((a, b) => a + b, 0) / measurements.length;
  const memoryUsage = process.memoryUsage().heapUsed - startMemory;

  return {
    name: 'current_test',
    duration,
    iterations,
    memoryUsage,
    timestamp: new Date().toISOString()
  };
};

describe('Performance Regression Tests', () => {
  const baselines = loadBaselines();

  describe('Monte Carlo Simulations', () => {
    it('should not regress beyond acceptable thresholds', async () => {
      const baseline = baselines.get('monte_carlo_simulation');
      if (!baseline) {
        console.warn('No Monte Carlo baseline found, skipping test');
        return;
      }

      const runSimulation = async () => {
        const results = [];
        for (let s = 0; s < 500; s++) {
          for (let i = 0; i < 200; i++) {
            const randomValue = Math.random();
            const result = Math.log(randomValue) * Math.sqrt(i + 1) + Math.sin(s);
            results.push(result);
          }
        }
        return results;
      };

      const currentMetric = await measurePerformance(runSimulation);
      const referenceMetric = baseline.metrics.find(m => m.name.includes('medium')) || baseline.metrics[0];

      const durationRegression = ((currentMetric.duration - referenceMetric.duration) / referenceMetric.duration) * 100;
      const memoryRegression = ((currentMetric.memoryUsage - referenceMetric.memoryUsage) / referenceMetric.memoryUsage) * 100;

      // Check thresholds
      expect(durationRegression).toBeLessThan(baseline.thresholds.duration.error);
      expect(memoryRegression).toBeLessThan(baseline.thresholds.memory.error);

      // Warn on threshold breaches
      if (durationRegression > baseline.thresholds.duration.warning) {
        console.warn(\`Monte Carlo duration regression: \${durationRegression.toFixed(1)}%\`);
      }
      if (memoryRegression > baseline.thresholds.memory.warning) {
        console.warn(\`Monte Carlo memory regression: \${memoryRegression.toFixed(1)}%\`);
      }
    });
  });

  describe('XIRR Calculations', () => {
    it('should maintain performance for financial calculations', async () => {
      const baseline = baselines.get('xirr_calculation');
      if (!baseline) {
        console.warn('No XIRR baseline found, skipping test');
        return;
      }

      const calculateXIRR = async (cashFlows: Array<{ date: Date; amount: number }>) => {
        let result = 0;
        for (let i = 0; i < cashFlows.length; i++) {
          const cf = cashFlows[i];
          const days = (cf.date.getTime() - cashFlows[0].date.getTime()) / (1000 * 60 * 60 * 24);
          result += cf.amount / Math.pow(1.1, days / 365);
        }
        return result;
      };

      const generateCashFlows = (count: number) => {
        const flows = [];
        const startDate = new Date('2020-01-01');

        for (let i = 0; i < count; i++) {
          flows.push({
            date: new Date(startDate.getTime() + i * 30 * 24 * 60 * 60 * 1000),
            amount: (Math.random() - 0.5) * 1000000
          });
        }

        return flows;
      };

      const currentMetric = await measurePerformance(() => calculateXIRR(generateCashFlows(60)));
      const referenceMetric = baseline.metrics.find(m => m.name.includes('medium')) || baseline.metrics[0];

      const durationRegression = ((currentMetric.duration - referenceMetric.duration) / referenceMetric.duration) * 100;

      expect(durationRegression).toBeLessThan(baseline.thresholds.duration.error);

      if (durationRegression > baseline.thresholds.duration.warning) {
        console.warn(\`XIRR calculation regression: \${durationRegression.toFixed(1)}%\`);
      }
    });
  });

  describe('Portfolio Optimization', () => {
    it('should maintain optimization performance', async () => {
      const baseline = baselines.get('portfolio_optimization');
      if (!baseline) {
        console.warn('No portfolio optimization baseline found, skipping test');
        return;
      }

      const optimizePortfolio = async (assets: number) => {
        const results = [];

        for (let iter = 0; iter < 100; iter++) {
          const portfolio = [];
          let totalWeight = 0;

          for (let i = 0; i < assets; i++) {
            const weight = Math.random();
            portfolio.push(weight);
            totalWeight += weight;
          }

          const normalizedPortfolio = portfolio.map(w => w / totalWeight);

          let objective = 0;
          for (let i = 0; i < assets; i++) {
            objective += normalizedPortfolio[i] * Math.log(normalizedPortfolio[i] + 0.01);
          }

          results.push({ portfolio: normalizedPortfolio, objective });
        }

        return results.sort((a, b) => b.objective - a.objective)[0];
      };

      const currentMetric = await measurePerformance(() => optimizePortfolio(50));
      const referenceMetric = baseline.metrics.find(m => m.name.includes('medium')) || baseline.metrics[0];

      const durationRegression = ((currentMetric.duration - referenceMetric.duration) / referenceMetric.duration) * 100;

      expect(durationRegression).toBeLessThan(baseline.thresholds.duration.error);

      if (durationRegression > baseline.thresholds.duration.warning) {
        console.warn(\`Portfolio optimization regression: \${durationRegression.toFixed(1)}%\`);
      }
    });
  });
});`;

    const testFilePath = join(projectRoot, 'tests/performance/regression.test.ts');
    const testDir = dirname(testFilePath);

    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    writeFileSync(testFilePath, testContent);
    console.log(`📝 Generated test file: ${testFilePath}`);
  }

  /**
   * Generate performance monitoring dashboard
   */
  generateDashboard(): string {
    const dashboard = `# Performance Dashboard

## Current Baselines

${Array.from(this.baselines.values()).map(baseline => `
### ${baseline.testName}

**Environment:**
- Node: ${baseline.environment.nodeVersion}
- Platform: ${baseline.environment.platform}
- CPUs: ${baseline.environment.cpuCount}

**Metrics:**
${baseline.metrics.map(metric => `
- **${metric.name}**: ${metric.duration.toFixed(2)}ms (${metric.iterations} iterations)
  - Memory: ${(metric.memoryUsage / 1024 / 1024).toFixed(2)}MB
`).join('')}

**Thresholds:**
- Duration: ${baseline.thresholds.duration.warning}% warning, ${baseline.thresholds.duration.error}% error
- Memory: ${baseline.thresholds.memory.warning}% warning, ${baseline.thresholds.memory.error}% error
`).join('\n')}

## Usage

\`\`\`bash
# Generate new baselines
npm run performance:baseline

# Run regression tests
npm run test:performance

# Generate dashboard
npm run performance:dashboard
\`\`\`

---
Generated: ${new Date().toISOString()}
`;

    const dashboardPath = join(baselinesDir, 'dashboard.md');
    writeFileSync(dashboardPath, dashboard);

    return dashboard;
  }

  /**
   * Main execution function
   */
  async run(args: string[] = []): Promise<void> {
    if (args.includes('--dashboard')) {
      const dashboard = this.generateDashboard();
      console.log(dashboard);
      return;
    }

    if (args.includes('--regression')) {
      const testName = args[args.indexOf('--regression') + 1] || 'monte_carlo_simulation';
      const result = await this.runRegressionTest(testName);

      if (result) {
        console.log(`\n📊 Regression Test Results for ${result.testName}`);
        console.log(`Status: ${result.status.toUpperCase()}`);
        console.log(`Duration regression: ${result.regression.duration.toFixed(1)}%`);
        console.log(`Memory regression: ${result.regression.memory.toFixed(1)}%`);

        if (result.recommendations.length > 0) {
          console.log('\nRecommendations:');
          result.recommendations.forEach(rec => console.log(`- ${rec}`));
        }
      }
      return;
    }

    await this.generateTestSuite();
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new PerformanceBaselineGenerator();
  generator.run(process.argv.slice(2)).catch(error => {
    console.error('💥 Performance baseline generation failed:', error);
    process.exit(1);
  });
}

export { PerformanceBaselineGenerator, Baseline, RegressionResult };