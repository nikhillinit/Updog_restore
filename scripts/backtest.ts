#!/usr/bin/env ts-node

/**
 * Reserve Allocation Backtest CLI
 * Historical validation of ML vs Rules engines
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FeatureFlaggedReserveEngine } from '../server/core/reserves/adapter.js';
import { DeterministicReserveEngine } from '../client/src/core/reserves/DeterministicReserveEngine.js';
import { ConstrainedReserveEngine } from '../client/src/core/reserves/ConstrainedReserveEngine.js';
import { MlClient } from '../server/core/reserves/mlClient.js';
import { MarketScoreComputer } from '../server/core/market/score.js';
import { db } from '../server/db/client.js';
import { marketIndicators, pacingScores } from '../server/db/schema/market.js';
import { reserveDecisions } from '../server/db/schema/reserves.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import { logger } from '../server/lib/logger.js';

interface BacktestConfig {
  from: string;
  to: string;
  engines: Array<'rules' | 'ml' | 'hybrid'>;
  fundId?: string;
  companiesFile?: string;
  realizedFile?: string;
  period: 'quarter' | 'month';
  seed: number;
  outputFile?: string;
  verbose: boolean;
}

interface Company {
  id: string;
  fundId: string;
  name: string;
  stage: string;
  sector?: string;
  checkSize: number;
  invested: number;
  ownership: number;
  entryDate: string;
  exitMoic?: number;
}

interface RealizedUsage {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  actualReserveUsed: number;
  outcome?: 'success' | 'failure' | 'partial';
}

interface BacktestResult {
  summary: {
    totalPeriods: number;
    totalCompanies: number;
    engineResults: Record<string, EngineMetrics>;
  };
  detailedResults: Array<{
    period: string;
    company: Company;
    engine: string;
    prediction: number;
    actual: number;
    error: number;
    percentError: number;
    latencyMs: number;
  }>;
  recommendations: string[];
}

interface EngineMetrics {
  totalPredictions: number;
  shortfallRate: number;
  overReserveRate: number;
  rmse: number;
  mae: number;
  mape: number;
  irrDeltaBps?: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
}

export class BacktestRunner {
  private marketScorer = new MarketScoreComputer();
  
  constructor(private config: BacktestConfig) {}

  async run(): Promise<BacktestResult> {
    logger.info('Starting reserve allocation backtest', { config: this.config });

    // Load data
    const companies = await this.loadCompanies();
    const realizedUsage = await this.loadRealizedUsage();
    const periods = this.enumeratePeriods();

    logger.info('Loaded data', {
      companies: companies.length,
      periods: periods.length,
      realizedUsage: realizedUsage.length,
    });

    // Initialize engines
    const engines = await this.initializeEngines();

    // Run backtest for each engine
    const results: BacktestResult = {
      summary: {
        totalPeriods: periods.length,
        totalCompanies: companies.length,
        engineResults: {},
      },
      detailedResults: [],
      recommendations: [],
    };

    for (const engineType of this.config.engines) {
      logger.info(`Running backtest for ${engineType} engine`);
      
      const engineResults = await this.runEngineBacktest(
        engineType,
        companies,
        realizedUsage,
        periods,
        engines[engineType]
      );

      results.summary.engineResults[engineType] = this.computeMetrics(engineResults);
      results.detailedResults.push(...engineResults);
    }

    // Generate recommendations
    results.recommendations = this.generateRecommendations(results.summary.engineResults);

    if (this.config.outputFile) {
      await this.saveResults(results);
    }

    return results;
  }

  private async loadCompanies(): Promise<Company[]> {
    if (this.config.companiesFile) {
      const content = await fs.readFile(this.config.companiesFile, 'utf-8');
      return this.parseCsv(content).map(row => ({
        id: row.id,
        fundId: row.fundId,
        name: row.name,
        stage: row.stage,
        sector: row.sector,
        checkSize: parseFloat(row.checkSize),
        invested: parseFloat(row.invested),
        ownership: parseFloat(row.ownership),
        entryDate: row.entryDate,
        exitMoic: row.exitMoic ? parseFloat(row.exitMoic) : undefined,
      }));
    }

    // Generate synthetic companies for testing
    return [
      {
        id: 'company-1',
        fundId: this.config.fundId || 'fund-1',
        name: 'TechCorp Alpha',
        stage: 'series_a',
        sector: 'enterprise_saas',
        checkSize: 2000000,
        invested: 1500000,
        ownership: 0.15,
        entryDate: '2022-01-15',
        exitMoic: 3.2,
      },
      {
        id: 'company-2',
        fundId: this.config.fundId || 'fund-1',
        name: 'FinTech Beta',
        stage: 'seed',
        sector: 'fintech',
        checkSize: 1000000,
        invested: 800000,
        ownership: 0.12,
        entryDate: '2022-03-20',
        exitMoic: 2.8,
      },
    ];
  }

  private async loadRealizedUsage(): Promise<RealizedUsage[]> {
    if (this.config.realizedFile) {
      const content = await fs.readFile(this.config.realizedFile, 'utf-8');
      return this.parseCsv(content).map(row => ({
        companyId: row.companyId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        actualReserveUsed: parseFloat(row.actualReserveUsed),
        outcome: row.outcome as 'success' | 'failure' | 'partial',
      }));
    }

    // Generate synthetic realized usage
    return [
      {
        companyId: 'company-1',
        periodStart: '2022-04-01',
        periodEnd: '2022-06-30',
        actualReserveUsed: 750000,
        outcome: 'success',
      },
      {
        companyId: 'company-2',
        periodStart: '2022-07-01',
        periodEnd: '2022-09-30',
        actualReserveUsed: 400000,
        outcome: 'partial',
      },
    ];
  }

  private enumeratePeriods(): Array<{ start: string; end: string }> {
    const periods: Array<{ start: string; end: string }> = [];
    const start = new Date(this.config.from);
    const end = new Date(this.config.to);
    
    let current = new Date(start);
    
    while (current <= end) {
      const periodStart = new Date(current);
      const periodEnd = new Date(current);
      
      if (this.config.period === 'quarter') {
        // Set to end of quarter
        const quarter = Math.floor(periodStart.getMonth() / 3);
        periodEnd.setMonth(quarter * 3 + 2, 0);
        periodEnd.setDate(31);
        current.setMonth(current.getMonth() + 3);
      } else {
        // End of month
        periodEnd.setMonth(periodEnd.getMonth() + 1, 0);
        current.setMonth(current.getMonth() + 1);
      }
      
      periods.push({
        start: periodStart.toISOString().split('T')[0],
        end: periodEnd.toISOString().split('T')[0],
      });
    }
    
    return periods;
  }

  private async initializeEngines(): Promise<Record<string, FeatureFlaggedReserveEngine>> {
    const deterministicEngine = new DeterministicReserveEngine();
    const constrainedEngine = new ConstrainedReserveEngine();
    const mlClient = new MlClient({
      baseUrl: process.env.ML_RESERVE_URL || 'http://localhost:8088',
      timeoutMs: 5000, // Longer timeout for backtesting
    });

    return {
      rules: new FeatureFlaggedReserveEngine(
        deterministicEngine,
        constrainedEngine,
        mlClient,
        {
          useMl: false,
          mode: 'rules',
          mlWeight: 0,
          enableABTest: false,
          abTestPercentage: 0,
          fallbackOnError: true,
          logAllDecisions: false, // Disable logging during backtest
        }
      ),
      ml: new FeatureFlaggedReserveEngine(
        deterministicEngine,
        constrainedEngine,
        mlClient,
        {
          useMl: true,
          mode: 'ml',
          mlWeight: 1,
          enableABTest: false,
          abTestPercentage: 100,
          fallbackOnError: true,
          logAllDecisions: false,
        }
      ),
      hybrid: new FeatureFlaggedReserveEngine(
        deterministicEngine,
        constrainedEngine,
        mlClient,
        {
          useMl: true,
          mode: 'hybrid',
          mlWeight: 0.7,
          enableABTest: false,
          abTestPercentage: 100,
          fallbackOnError: true,
          logAllDecisions: false,
        }
      ),
    };
  }

  private async runEngineBacktest(
    engineType: string,
    companies: Company[],
    realizedUsage: RealizedUsage[],
    periods: Array<{ start: string; end: string }>,
    engine: FeatureFlaggedReserveEngine
  ): Promise<Array<any>> {
    const results: Array<any> = [];

    for (const period of periods) {
      // Get market conditions for this period
      const market = await this.getMarketConditions(period.start);

      for (const company of companies) {
        // Find realized usage for this company and period
        const realized = realizedUsage.find(
          r => r.companyId === company.id && 
               r.periodStart === period.start &&
               r.periodEnd === period.end
        );

        if (!realized) continue; // Skip if no realized data

        try {
          const decision = await engine.compute(
            {
              id: company.id,
              fundId: company.fundId,
              name: company.name,
              stage: company.stage as any,
              sector: company.sector,
              checkSize: company.checkSize,
              invested: company.invested,
              ownership: company.ownership,
              exitMoic: company.exitMoic,
              entryDate: company.entryDate,
            },
            market,
            {
              periodStart: period.start,
              periodEnd: period.end,
              explainPrediction: false, // Skip explanation for performance
            }
          );

          const prediction = decision.prediction.recommendedReserve;
          const actual = realized.actualReserveUsed;
          const error = prediction - actual;
          const percentError = actual > 0 ? (error / actual) * 100 : 0;

          results.push({
            period: period.start,
            company,
            engine: engineType,
            prediction,
            actual,
            error,
            percentError,
            latencyMs: decision.latencyMs || 0,
            outcome: realized.outcome,
          });

        } catch (error) {
          logger.warn('Backtest prediction failed', {
            company: company.id,
            period: period.start,
            engine: engineType,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return results;
  }

  private async getMarketConditions(asOfDate: string): Promise<any> {
    try {
      // Try to get historical market data from database
      const indicators = await db
        .select()
        .from(marketIndicators)
        .where(eq(marketIndicators.asOfDate, asOfDate))
        .limit(1);

      if (indicators.length > 0) {
        const indicator = indicators[0];
        const scoreResult = this.marketScorer.computeMarketScore({
          vix: indicator.vix ? parseFloat(indicator.vix.toString()) : undefined,
          fedFundsRate: indicator.fedFundsRate ? parseFloat(indicator.fedFundsRate.toString()) : undefined,
          ust10yYield: indicator.ust10yYield ? parseFloat(indicator.ust10yYield.toString()) : undefined,
          ipoCount30d: indicator.ipoCount30d || undefined,
          creditSpreadBaa: indicator.creditSpreadBaa ? parseFloat(indicator.creditSpreadBaa.toString()) : undefined,
        });

        return {
          asOfDate,
          marketScore: scoreResult.score,
          vix: indicator.vix ? parseFloat(indicator.vix.toString()) : undefined,
          fedFundsRate: indicator.fedFundsRate ? parseFloat(indicator.fedFundsRate.toString()) : undefined,
          ust10yYield: indicator.ust10yYield ? parseFloat(indicator.ust10yYield.toString()) : undefined,
          ipoCount30d: indicator.ipoCount30d || undefined,
          creditSpreadBaa: indicator.creditSpreadBaa ? parseFloat(indicator.creditSpreadBaa.toString()) : undefined,
        };
      }
    } catch (error) {
      logger.warn('Failed to fetch historical market data', { asOfDate, error });
    }

    // Fallback to synthetic market conditions
    const baseDate = new Date(asOfDate);
    const dayOfYear = Math.floor((baseDate.getTime() - new Date(baseDate.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    
    // Generate somewhat realistic synthetic data with seasonality
    const vix = 20 + Math.sin(dayOfYear / 365 * 2 * Math.PI) * 5 + (Math.random() - 0.5) * 10;
    const fedFunds = 2.5 + Math.sin(dayOfYear / 365 * 2 * Math.PI) * 1.5;
    
    const scoreResult = this.marketScorer.computeMarketScore({
      vix: Math.max(10, Math.min(40, vix)),
      fedFundsRate: Math.max(0, Math.min(6, fedFunds)),
      ust10yYield: 3.0 + (Math.random() - 0.5) * 2,
      ipoCount30d: Math.floor(20 + Math.random() * 40),
      creditSpreadBaa: 1.8 + (Math.random() - 0.5) * 1.2,
    });

    return {
      asOfDate,
      marketScore: scoreResult.score,
      vix: scoreResult.components.vix,
      fedFundsRate: scoreResult.components.fedFundsRate,
      ust10yYield: scoreResult.components.ust10yYield,
      ipoCount30d: scoreResult.components.ipoCount30d,
      creditSpreadBaa: scoreResult.components.creditSpreadBaa,
    };
  }

  private computeMetrics(results: Array<any>): EngineMetrics {
    if (results.length === 0) {
      return {
        totalPredictions: 0,
        shortfallRate: 0,
        overReserveRate: 0,
        rmse: 0,
        mae: 0,
        mape: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        errorRate: 0,
      };
    }

    const errors = results.map(r => r.error);
    const absErrors = errors.map(e => Math.abs(e));
    const percentErrors = results.map(r => Math.abs(r.percentError));
    const latencies = results.map(r => r.latencyMs);

    // Sort for percentiles
    const sortedLatencies = [...latencies].sort((a, b) => a - b);

    const shortfalls = results.filter(r => r.error < 0).length;
    const overReserves = results.filter(r => r.error > r.actual * 0.25).length;

    const mse = errors.reduce((sum, e) => sum + e * e, 0) / errors.length;
    const mae = absErrors.reduce((sum, e) => sum + e, 0) / absErrors.length;
    const mape = percentErrors.reduce((sum, e) => sum + e, 0) / percentErrors.length;

    return {
      totalPredictions: results.length,
      shortfallRate: (shortfalls / results.length) * 100,
      overReserveRate: (overReserves / results.length) * 100,
      rmse: Math.sqrt(mse),
      mae,
      mape,
      avgLatencyMs: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
      p50LatencyMs: sortedLatencies[Math.floor(sortedLatencies.length * 0.5)],
      p95LatencyMs: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)],
      errorRate: 0, // Would need error tracking
    };
  }

  private generateRecommendations(engineResults: Record<string, EngineMetrics>): string[] {
    const recommendations: string[] = [];
    
    const engines = Object.entries(engineResults);
    if (engines.length === 0) return recommendations;

    // Find best engine by RMSE
    const bestRmse = engines.reduce((best, [name, metrics]) => 
      metrics.rmse < best.metrics.rmse ? { name, metrics } : best
    );

    recommendations.push(`Best accuracy: ${bestRmse.name} (RMSE: ${bestRmse.metrics.rmse.toFixed(0)})`);

    // Check latency
    const bestLatency = engines.reduce((best, [name, metrics]) => 
      metrics.avgLatencyMs < best.metrics.avgLatencyMs ? { name, metrics } : best
    );

    if (bestLatency.name !== bestRmse.name) {
      recommendations.push(`Best latency: ${bestLatency.name} (${bestLatency.metrics.avgLatencyMs.toFixed(0)}ms avg)`);
    }

    // Risk recommendations
    engines.forEach(([name, metrics]) => {
      if (metrics.shortfallRate > 20) {
        recommendations.push(`⚠️  ${name} has high shortfall rate (${metrics.shortfallRate.toFixed(1)}%)`);
      }
      if (metrics.overReserveRate > 30) {
        recommendations.push(`💰 ${name} tends to over-allocate (${metrics.overReserveRate.toFixed(1)}%)`);
      }
    });

    return recommendations;
  }

  private parseCsv(content: string): Array<Record<string, string>> {
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, i) => {
        row[header] = values[i] || '';
      });
      return row;
    });
  }

  private async saveResults(results: BacktestResult): Promise<void> {
    await fs.writeFile(
      this.config.outputFile!,
      JSON.stringify(results, null, 2),
      'utf-8'
    );
    logger.info(`Backtest results saved to ${this.config.outputFile}`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      from: { type: 'string', default: '2022-01-01' },
      to: { type: 'string', default: '2025-06-30' },
      engine: { type: 'string', default: 'rules,ml' },
      fundId: { type: 'string' },
      companiesFile: { type: 'string' },
      realizedFile: { type: 'string' },
      period: { type: 'string', default: 'quarter' },
      seed: { type: 'string', default: '42' },
      out: { type: 'string' },
      verbose: { type: 'boolean', default: false },
    },
  });

  const config: BacktestConfig = {
    from: values.from!,
    to: values.to!,
    engines: (values.engine as string).split(',').map(e => e.trim()) as any[],
    fundId: values.fundId,
    companiesFile: values.companiesFile,
    realizedFile: values.realizedFile,
    period: values.period as 'quarter' | 'month',
    seed: parseInt(values.seed!),
    outputFile: values.out,
    verbose: values.verbose!,
  };

  console.log('🔬 Reserve Allocation Backtest');
  console.log('═'.repeat(50));
  console.log(`Period: ${config.from} to ${config.to}`);
  console.log(`Engines: ${config.engines.join(', ')}`);
  console.log(`Granularity: ${config.period}`);
  console.log('');

  const runner = new BacktestRunner(config);
  
  try {
    const results = await runner.run();
    
    console.log('📊 Results Summary');
    console.log('─'.repeat(50));
    console.log(`Total Periods: ${results.summary.totalPeriods}`);
    console.log(`Total Companies: ${results.summary.totalCompanies}`);
    console.log('');

    Object.entries(results.summary.engineResults).forEach(([engine, metrics]) => {
      console.log(`${engine.toUpperCase()} Engine:`);
      console.log(`  Predictions: ${metrics.totalPredictions}`);
      console.log(`  RMSE: ${metrics.rmse.toFixed(0)}`);
      console.log(`  MAE: ${metrics.mae.toFixed(0)}`);
      console.log(`  MAPE: ${metrics.mape.toFixed(1)}%`);
      console.log(`  Shortfall Rate: ${metrics.shortfallRate.toFixed(1)}%`);
      console.log(`  Over-Reserve Rate: ${metrics.overReserveRate.toFixed(1)}%`);
      console.log(`  Avg Latency: ${metrics.avgLatencyMs.toFixed(0)}ms`);
      console.log(`  P95 Latency: ${metrics.p95LatencyMs.toFixed(0)}ms`);
      console.log('');
    });

    if (results.recommendations.length > 0) {
      console.log('💡 Recommendations');
      console.log('─'.repeat(50));
      results.recommendations.forEach(rec => console.log(`  ${rec}`));
      console.log('');
    }

    console.log('✅ Backtest completed successfully');

  } catch (error) {
    console.error('❌ Backtest failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}