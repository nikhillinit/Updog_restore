/**
 * LiquidityEngine Test Suite
 * Comprehensive tests for cash flow analysis, liquidity forecasting, and stress testing
 */

import { describe, it, expect } from 'vitest';
import { LiquidityEngine } from '@/core/LiquidityEngine';
import type {
  CashTransaction,
  CashPosition,
  RecurringExpense,
  CashTransactionType
} from '@shared/types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createTransaction = (overrides: Partial<CashTransaction> = {}): CashTransaction => ({
  id: '1',
  fundId: 1,
  type: 'capital_call' as CashTransactionType,
  amount: 1000000,
  plannedDate: new Date('2024-01-15'),
  description: 'Test transaction',
  status: 'planned',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createCashPosition = (overrides: Partial<CashPosition> = {}): CashPosition => ({
  totalCash: 10000000,
  totalCommitted: 40000000,
  availableInvestment: 50000000,
  ...overrides,
});

const createRecurringExpense = (overrides: Partial<RecurringExpense> = {}): RecurringExpense => ({
  id: '1',
  fundId: 1,
  name: 'Management Fee',
  amount: 100000,
  frequency: 'monthly',
  category: 'management',
  startDate: new Date('2024-01-01'),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// =============================================================================
// INITIALIZATION TESTS
// =============================================================================

describe('LiquidityEngine - Initialization', () => {
  it('should initialize with fund ID and size', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    expect(engine).toBeDefined();
  });

  it('should initialize with different fund sizes', () => {
    const small = new LiquidityEngine('fund-small', 10000000);
    const large = new LiquidityEngine('fund-large', 500000000);

    expect(small).toBeDefined();
    expect(large).toBeDefined();
  });
});

// =============================================================================
// CASH FLOW ANALYSIS TESTS
// =============================================================================

describe('LiquidityEngine - Cash Flow Analysis', () => {
  it('should analyze cash transactions', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const transactions = [
      createTransaction({ amount: 5000000, type: 'capital_call' }),
      createTransaction({ amount: -2000000, type: 'investment' }),
      createTransaction({ amount: 3000000, type: 'distribution' }),
    ];

    const analysis = engine.analyzeCashFlows(transactions);

    expect(analysis).toBeDefined();
    expect(analysis.summary).toBeDefined();
  });

  it('should calculate total inflows correctly', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const transactions = [
      createTransaction({ amount: 5000000 }),
      createTransaction({ amount: 3000000 }),
      createTransaction({ amount: -2000000 }),
    ];

    const analysis = engine.analyzeCashFlows(transactions);

    expect(analysis.summary.totalInflows).toBe(8000000);
  });

  it('should calculate total outflows correctly', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const transactions = [
      createTransaction({ amount: -2000000 }),
      createTransaction({ amount: -1500000 }),
      createTransaction({ amount: 3000000 }),
    ];

    const analysis = engine.analyzeCashFlows(transactions);

    expect(analysis.summary.totalOutflows).toBe(3500000);
  });

  it('should calculate net cash flow', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const transactions = [
      createTransaction({ amount: 5000000 }),
      createTransaction({ amount: -2000000 }),
    ];

    const analysis = engine.analyzeCashFlows(transactions);

    expect(analysis.summary.netCashFlow).toBe(3000000);
  });

  it('should group transactions by type', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const transactions = [
      createTransaction({ type: 'capital_call', amount: 5000000 }),
      createTransaction({ type: 'capital_call', amount: 3000000 }),
      createTransaction({ type: 'investment', amount: -2000000 }),
    ];

    const analysis = engine.analyzeCashFlows(transactions);

    expect(analysis.byType['capital_call']).toBe(8000000);
    expect(analysis.byType['investment']).toBe(-2000000);
  });

  it('should group transactions by quarter', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const transactions = [
      createTransaction({ plannedDate: new Date('2024-01-15') }),
      createTransaction({ plannedDate: new Date('2024-02-20') }),
      createTransaction({ plannedDate: new Date('2024-05-10') }),
    ];

    const analysis = engine.analyzeCashFlows(transactions);

    expect(analysis.byQuarter).toBeDefined();
    expect(analysis.byQuarter.length).toBeGreaterThan(0);
  });

  it('should calculate running balances', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const transactions = [
      createTransaction({ amount: 5000000, plannedDate: new Date('2024-01-01') }),
      createTransaction({ amount: -2000000, plannedDate: new Date('2024-01-15') }),
      createTransaction({ amount: 3000000, plannedDate: new Date('2024-02-01') }),
    ];

    const analysis = engine.analyzeCashFlows(transactions);

    expect(analysis.runningBalances).toHaveLength(3);
    expect(analysis.runningBalances[0].balance).toBe(5000000);
    expect(analysis.runningBalances[1].balance).toBe(3000000);
    expect(analysis.runningBalances[2].balance).toBe(6000000);
  });
});

// =============================================================================
// LIQUIDITY FORECAST TESTS
// =============================================================================

describe('LiquidityEngine - Liquidity Forecast', () => {
  it('should generate liquidity forecast', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const transactions: CashTransaction[] = [];
    const expenses: RecurringExpense[] = [];

    const forecast = engine.generateLiquidityForecast(position, transactions, expenses, 12);

    expect(forecast).toBeDefined();
    expect(forecast.fundId).toBe('fund-1');
    expect(forecast.projectedCash).toBeDefined();
  });

  it('should project cash for specified months', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();

    const forecast = engine.generateLiquidityForecast(position, [], [], 6);

    const monthsDiff = (forecast.periodEnd.getTime() - forecast.periodStart.getTime()) / (1000 * 60 * 60 * 24 * 30);
    expect(monthsDiff).toBeCloseTo(6, 0);
  });

  it('should include multiple scenarios', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();

    const forecast = engine.generateLiquidityForecast(position, [], []);

    expect(forecast.scenarios).toBeDefined();
    expect(forecast.scenarios).toBeInstanceOf(Array);
    expect(forecast.scenarios.length).toBeGreaterThan(0);
  });

  it('should calculate minimum cash buffer', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();

    const forecast = engine.generateLiquidityForecast(position, [], []);

    expect(forecast.minimumCashBuffer).toBeGreaterThan(0);
  });

  it('should calculate liquidity ratio', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();

    const forecast = engine.generateLiquidityForecast(position, [], []);

    expect(forecast.liquidityRatio).toBeGreaterThan(0);
  });

  it('should calculate burn rate', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();

    const forecast = engine.generateLiquidityForecast(position, [], []);

    expect(forecast.burnRate).toBeGreaterThan(0);
  });

  it('should calculate runway months', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition({ totalCash: 10000000 });

    const forecast = engine.generateLiquidityForecast(position, [], []);

    expect(forecast.runwayMonths).toBeGreaterThan(0);
  });
});

// =============================================================================
// STRESS TEST TESTS
// =============================================================================

describe('LiquidityEngine - Stress Testing', () => {
  it('should run stress test scenarios', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const factors = {
      distributionDelay: 6,
      investmentAcceleration: 1.5,
      lpFundingDelay: 3,
      expenseIncrease: 0.2,
    };

    const result = engine.runStressTest(position, factors);

    expect(result).toBeDefined();
    expect(result.scenarios).toHaveLength(4);
  });

  it('should include delayed distributions scenario', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const factors = {
      distributionDelay: 6,
      investmentAcceleration: 1.0,
      lpFundingDelay: 0,
      expenseIncrease: 0,
    };

    const result = engine.runStressTest(position, factors);

    const delayedDistScenario = result.scenarios.find(s => s.name === 'Delayed Distributions');
    expect(delayedDistScenario).toBeDefined();
    expect(delayedDistScenario?.endingCash).toBeLessThan(position.totalCash);
  });

  it('should include accelerated investment scenario', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const factors = {
      distributionDelay: 0,
      investmentAcceleration: 2.0,
      lpFundingDelay: 0,
      expenseIncrease: 0,
    };

    const result = engine.runStressTest(position, factors);

    const accelScenario = result.scenarios.find(s => s.name === 'Accelerated Investment');
    expect(accelScenario).toBeDefined();
  });

  it('should include LP funding delay scenario', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const factors = {
      distributionDelay: 0,
      investmentAcceleration: 1.0,
      lpFundingDelay: 3,
      expenseIncrease: 0,
    };

    const result = engine.runStressTest(position, factors);

    const lpDelayScenario = result.scenarios.find(s => s.name === 'LP Funding Delays');
    expect(lpDelayScenario).toBeDefined();
  });

  it('should include market downturn scenario', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const factors = {
      distributionDelay: 6,
      investmentAcceleration: 1.5,
      lpFundingDelay: 3,
      expenseIncrease: 0.2,
    };

    const result = engine.runStressTest(position, factors);

    const downturnScenario = result.scenarios.find(s => s.name === 'Market Downturn');
    expect(downturnScenario).toBeDefined();
    expect(downturnScenario?.impactRating).toBe('high');
  });

  it('should identify worst case scenario', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const factors = {
      distributionDelay: 6,
      investmentAcceleration: 2.0,
      lpFundingDelay: 3,
      expenseIncrease: 0.2,
    };

    const result = engine.runStressTest(position, factors);

    expect(result.worstCase).toBeDefined();
    expect(result.worstCase.endingCash).toBeLessThanOrEqual(
      Math.max(...result.scenarios.map(s => s.endingCash))
    );
  });

  it('should assess overall risk level', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const factors = {
      distributionDelay: 6,
      investmentAcceleration: 1.5,
      lpFundingDelay: 3,
      expenseIncrease: 0.2,
    };

    const result = engine.runStressTest(position, factors);

    expect(result.riskLevel).toMatch(/^(low|medium|high)$/);
  });

  it('should provide risk recommendations', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition({ totalCash: 1000000 }); // Low cash
    const factors = {
      distributionDelay: 6,
      investmentAcceleration: 1.5,
      lpFundingDelay: 3,
      expenseIncrease: 0.2,
    };

    const result = engine.runStressTest(position, factors);

    expect(result.recommendations).toBeInstanceOf(Array);
  });
});

// =============================================================================
// CAPITAL CALL OPTIMIZATION TESTS
// =============================================================================

describe('LiquidityEngine - Capital Call Optimization', () => {
  it('should optimize capital call schedule', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition({ totalCash: 5000000, totalCommitted: 20000000 });
    const plannedInvestments = [
      {
        id: 'inv-1',
        description: 'Series A Investment',
        amount: 3000000,
        targetDate: new Date('2024-03-01'),
        priority: 1,
      },
      {
        id: 'inv-2',
        description: 'Follow-on',
        amount: 2000000,
        targetDate: new Date('2024-04-15'),
        priority: 2,
      },
    ];
    const constraints = {
      noticePeriodDays: 14,
      paymentPeriodDays: 30,
    };

    const schedule = engine.optimizeCapitalCallSchedule(position, plannedInvestments, constraints);

    expect(schedule).toBeDefined();
    expect(schedule.calls).toBeInstanceOf(Array);
  });

  it('should calculate optimal call amounts', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition({ totalCash: 1000000, totalCommitted: 20000000 });
    const plannedInvestments = [
      {
        id: 'inv-1',
        description: 'Large Investment',
        amount: 5000000,
        targetDate: new Date('2024-03-01'),
        priority: 1,
      },
    ];
    const constraints = {
      noticePeriodDays: 14,
      paymentPeriodDays: 30,
    };

    const schedule = engine.optimizeCapitalCallSchedule(position, plannedInvestments, constraints);

    expect(schedule.totalAmount).toBeGreaterThan(0);
    expect(schedule.totalAmount).toBeLessThanOrEqual(position.totalCommitted);
  });

  it('should respect notice and payment periods', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const targetDate = new Date('2024-06-01');
    const plannedInvestments = [
      {
        id: 'inv-1',
        description: 'Investment',
        amount: 3000000,
        targetDate,
        priority: 1,
      },
    ];
    const constraints = {
      noticePeriodDays: 14,
      paymentPeriodDays: 30,
    };

    const schedule = engine.optimizeCapitalCallSchedule(position, plannedInvestments, constraints);

    if (schedule.calls.length > 0) {
      const call = schedule.calls[0];
      expect(call.dueDate.getTime()).toBeLessThan(targetDate.getTime());
      expect(call.noticeDate.getTime()).toBeLessThan(call.dueDate.getTime());
    }
  });

  it('should calculate utilization rate', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition({ totalCommitted: 20000000 });
    const plannedInvestments = [
      {
        id: 'inv-1',
        description: 'Investment',
        amount: 8000000,
        targetDate: new Date('2024-03-01'),
        priority: 1,
      },
    ];
    const constraints = {
      noticePeriodDays: 14,
      paymentPeriodDays: 30,
    };

    const schedule = engine.optimizeCapitalCallSchedule(position, plannedInvestments, constraints);

    expect(schedule.utilizationRate).toBeGreaterThanOrEqual(0);
    expect(schedule.utilizationRate).toBeLessThanOrEqual(100);
  });

  it('should calculate schedule efficiency', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const plannedInvestments = [
      {
        id: 'inv-1',
        description: 'Investment',
        amount: 3000000,
        targetDate: new Date('2024-03-01'),
        priority: 1,
      },
    ];
    const constraints = {
      noticePeriodDays: 14,
      paymentPeriodDays: 30,
    };

    const schedule = engine.optimizeCapitalCallSchedule(position, plannedInvestments, constraints);

    expect(schedule.efficiency).toBeGreaterThanOrEqual(0);
    expect(schedule.efficiency).toBeLessThanOrEqual(100);
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('LiquidityEngine - Edge Cases', () => {
  it('should handle empty transaction list', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const analysis = engine.analyzeCashFlows([]);

    expect(analysis.summary.totalInflows).toBe(0);
    expect(analysis.summary.totalOutflows).toBe(0);
    expect(analysis.summary.netCashFlow).toBe(0);
  });

  it('should handle zero cash position', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition({ totalCash: 0 });

    const forecast = engine.generateLiquidityForecast(position, [], []);

    expect(forecast.openingCash).toBe(0);
    expect(forecast.runwayMonths).toBeGreaterThanOrEqual(0);
  });

  it('should handle very large fund size', () => {
    const engine = new LiquidityEngine('fund-1', 1000000000);
    const position = createCashPosition({ totalCash: 100000000 });

    const forecast = engine.generateLiquidityForecast(position, [], []);

    expect(forecast.minimumCashBuffer).toBeGreaterThan(0);
  });

  it('should handle very small fund size', () => {
    const engine = new LiquidityEngine('fund-1', 5000000);
    const position = createCashPosition({ totalCash: 500000 });

    const forecast = engine.generateLiquidityForecast(position, [], []);

    expect(forecast.minimumCashBuffer).toBeGreaterThanOrEqual(100000); // Minimum floor
  });

  it('should handle recurring expenses correctly', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const expenses = [
      createRecurringExpense({ frequency: 'monthly', amount: 100000 }),
      createRecurringExpense({ frequency: 'quarterly', amount: 300000 }),
      createRecurringExpense({ frequency: 'annual', amount: 1200000 }),
    ];

    const forecast = engine.generateLiquidityForecast(position, [], expenses, 12);

    expect(forecast.plannedExpenses).toBeGreaterThan(0);
  });

  it('should handle inactive recurring expenses', () => {
    const engine = new LiquidityEngine('fund-1', 50000000);
    const position = createCashPosition();
    const expenses = [
      createRecurringExpense({ isActive: true, amount: 100000 }),
      createRecurringExpense({ isActive: false, amount: 200000 }),
    ];

    const forecast = engine.generateLiquidityForecast(position, [], expenses, 12);

    // Only active expenses should be included
    expect(forecast.plannedExpenses).toBeLessThan(200000 * 12);
  });
});