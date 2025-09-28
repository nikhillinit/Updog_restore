import type {
  CashTransaction,
  CashPosition,
  LiquidityForecast,
  RecurringExpense,
  CashTransactionType,
} from '@shared/types';

// =============================================================================
// LIQUIDITY ANALYTICS ENGINE
// =============================================================================

/**
 * Core analytics engine for cashflow and liquidity management
 * Provides forecasting, scenario modeling, and liquidity metrics
 */
export class LiquidityEngine {
  private fundId: string;
  private fundSize: number;

  constructor(fundId: string, fundSize: number) {
    this.fundId = fundId;
    this.fundSize = fundSize;
  }

  // =============================================================================
  // CASH FLOW ANALYSIS
  // =============================================================================

  /**
   * Analyze cash transactions and calculate key metrics
   */
  public analyzeCashFlows(transactions: CashTransaction[]): CashFlowAnalysis {
    const currentYear = new Date().getFullYear();
    const currentQuarter = Math.floor((new Date().getMonth() + 3) / 3);

    // Group transactions by type and period
    const byType = this.groupTransactionsByType(transactions);
    const byQuarter = this.groupTransactionsByQuarter(transactions);
    const byMonth = this.groupTransactionsByMonth(transactions);

    // Calculate running balances
    const runningBalances = this.calculateRunningBalances(transactions);

    // Identify cash flow patterns
    const patterns = this.identifyCashFlowPatterns(byMonth);

    // Calculate velocity metrics
    const velocity = this.calculateCashVelocity(transactions);

    return {
      summary: {
        totalInflows: this.sumTransactions(transactions.filter(t => t.amount > 0)),
        totalOutflows: Math.abs(this.sumTransactions(transactions.filter(t => t.amount < 0))),
        netCashFlow: this.sumTransactions(transactions),
        transactionCount: transactions.length,
        avgTransactionSize: this.sumTransactions(transactions) / Math.max(transactions.length, 1),
      },
      byType,
      byQuarter,
      byMonth,
      runningBalances,
      patterns,
      velocity,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate liquidity forecast with multiple scenarios
   */
  public generateLiquidityForecast(
    currentPosition: CashPosition,
    transactions: CashTransaction[],
    recurringExpenses: RecurringExpense[],
    months: number = 12
  ): LiquidityForecast {
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + (months * 30 * 24 * 60 * 60 * 1000));

    // Project future cash flows
    const projectedInflows = this.projectInflows(transactions, recurringExpenses, months);
    const projectedOutflows = this.projectOutflows(transactions, recurringExpenses, months);

    // Calculate base case scenario
    const baseCase = this.calculateBaseScenario(
      currentPosition,
      projectedInflows,
      projectedOutflows
    );

    // Generate alternative scenarios
    const scenarios = this.generateScenarios(baseCase, projectedInflows, projectedOutflows);

    // Calculate risk metrics
    const riskMetrics = this.calculateLiquidityRiskMetrics(baseCase, scenarios);

    return {
      fundId: this.fundId,
      periodStart: startDate,
      periodEnd: endDate,
      openingCash: currentPosition.totalCash,
      openingCommitted: currentPosition.totalCommitted,
      plannedCapitalCalls: projectedInflows.capitalCalls,
      expectedDistributions: projectedInflows.distributions,
      otherInflows: projectedInflows.other,
      plannedInvestments: projectedOutflows.investments,
      plannedExpenses: projectedOutflows.expenses,
      managementFees: projectedOutflows.managementFees,
      otherOutflows: projectedOutflows.other,
      projectedCash: baseCase.endingCash,
      projectedCommitted: baseCase.endingCommitted,
      minimumCashBuffer: this.calculateMinimumCashBuffer(),
      liquidityRatio: riskMetrics.liquidityRatio,
      burnRate: riskMetrics.burnRate,
      runwayMonths: riskMetrics.runwayMonths,
      scenarios,
      generatedAt: new Date(),
      generatedBy: 'LiquidityEngine',
      lastUpdated: new Date(),
    };
  }

  /**
   * Calculate liquidity stress test scenarios
   */
  public runStressTest(
    currentPosition: CashPosition,
    stressFactors: StressTestFactors
  ): StressTestResult {
    const scenarios: StressTestScenario[] = [];

    // Scenario 1: Delayed distributions
    scenarios.push(this.calculateDelayedDistributionsScenario(
      currentPosition,
      stressFactors.distributionDelay
    ));

    // Scenario 2: Accelerated investment pace
    scenarios.push(this.calculateAcceleratedInvestmentScenario(
      currentPosition,
      stressFactors.investmentAcceleration
    ));

    // Scenario 3: LP funding delays
    scenarios.push(this.calculateLPFundingDelayScenario(
      currentPosition,
      stressFactors.lpFundingDelay
    ));

    // Scenario 4: Market downturn (combined stress)
    scenarios.push(this.calculateMarketDownturnScenario(
      currentPosition,
      stressFactors
    ));

    // Calculate aggregate risk
    const worstCaseScenario = scenarios.reduce((worst, scenario) =>
      scenario.endingCash < worst.endingCash ? scenario : worst
    );

    return {
      currentPosition,
      scenarios,
      worstCase: worstCaseScenario,
      riskLevel: this.assessOverallRiskLevel(scenarios),
      recommendations: this.generateRiskRecommendations(scenarios),
      testDate: new Date(),
    };
  }

  /**
   * Calculate optimal capital call schedule
   */
  public optimizeCapitalCallSchedule(
    currentPosition: CashPosition,
    plannedInvestments: PlannedInvestment[],
    constraints: CapitalCallConstraints
  ): OptimizedCapitalCallSchedule {
    // Sort investments by priority and timing
    const sortedInvestments = plannedInvestments.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // Lower number = higher priority
      }
      return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
    });

    const capitalCalls: OptimizedCapitalCall[] = [];
    let runningCash = currentPosition.totalCash;
    let runningCommitted = currentPosition.totalCommitted;

    for (const investment of sortedInvestments) {
      const needsCapitalCall = runningCash < investment.amount;

      if (needsCapitalCall) {
        // Calculate optimal call amount
        const callAmount = this.calculateOptimalCallAmount(
          investment,
          runningCash,
          runningCommitted,
          constraints
        );

        // Calculate optimal timing
        const callDate = this.calculateOptimalCallTiming(
          investment.targetDate,
          constraints.noticePeriodDays,
          constraints.paymentPeriodDays
        );

        capitalCalls.push({
          id: `call-${capitalCalls.length + 1}`,
          amount: callAmount,
          noticeDate: callDate.noticeDate,
          dueDate: callDate.dueDate,
          purpose: `Capital call for ${investment.description}`,
          investments: [investment],
          priority: investment.priority,
          utilization: (callAmount / runningCommitted) * 100,
        });

        runningCash += callAmount;
        runningCommitted -= callAmount;
      }

      runningCash -= investment.amount;
    }

    // Optimize call consolidation
    const optimizedCalls = this.consolidateCapitalCalls(capitalCalls, constraints);

    return {
      calls: optimizedCalls,
      totalAmount: optimizedCalls.reduce((sum, call) => sum + call.amount, 0),
      utilizationRate: (optimizedCalls.reduce((sum, call) => sum + call.amount, 0) / currentPosition.totalCommitted) * 100,
      averageCallSize: optimizedCalls.reduce((sum, call) => sum + call.amount, 0) / Math.max(optimizedCalls.length, 1),
      timeline: {
        firstCall: optimizedCalls[0]?.noticeDate || new Date(),
        lastCall: optimizedCalls[optimizedCalls.length - 1]?.dueDate || new Date(),
        totalDuration: 0, // Calculate based on first and last dates
      },
      efficiency: this.calculateScheduleEfficiency(optimizedCalls, constraints),
      generatedAt: new Date(),
    };
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private groupTransactionsByType(transactions: CashTransaction[]): Record<CashTransactionType, number> {
    const groups: Partial<Record<CashTransactionType, number>> = {};

    transactions.forEach(transaction => {
      groups[transaction.type] = (groups[transaction.type] || 0) + transaction.amount;
    });

    return groups as Record<CashTransactionType, number>;
  }

  private groupTransactionsByQuarter(transactions: CashTransaction[]): QuarterlyData[] {
    const quarterMap = new Map<string, CashTransaction[]>();

    transactions.forEach(transaction => {
      const date = new Date(transaction.plannedDate);
      const quarter = `${date.getFullYear()}-Q${Math.floor((date.getMonth() + 3) / 3)}`;

      if (!quarterMap.has(quarter)) {
        quarterMap.set(quarter, []);
      }
      quarterMap.get(quarter)!.push(transaction);
    });

    return Array.from(quarterMap.entries()).map(([quarter, txns]) => ({
      quarter,
      totalInflow: this.sumTransactions(txns.filter(t => t.amount > 0)),
      totalOutflow: Math.abs(this.sumTransactions(txns.filter(t => t.amount < 0))),
      netFlow: this.sumTransactions(txns),
      transactionCount: txns.length,
    }));
  }

  private groupTransactionsByMonth(transactions: CashTransaction[]): MonthlyData[] {
    const monthMap = new Map<string, CashTransaction[]>();

    transactions.forEach(transaction => {
      const date = new Date(transaction.plannedDate);
      const month = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

      if (!monthMap.has(month)) {
        monthMap.set(month, []);
      }
      monthMap.get(month)!.push(transaction);
    });

    return Array.from(monthMap.entries()).map(([month, txns]) => ({
      month,
      totalInflow: this.sumTransactions(txns.filter(t => t.amount > 0)),
      totalOutflow: Math.abs(this.sumTransactions(txns.filter(t => t.amount < 0))),
      netFlow: this.sumTransactions(txns),
      transactionCount: txns.length,
    }));
  }

  private calculateRunningBalances(transactions: CashTransaction[]): RunningBalance[] {
    const sortedTransactions = [...transactions].sort((a, b) =>
      new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime()
    );

    const balances: RunningBalance[] = [];
    let runningBalance = 0;

    sortedTransactions.forEach(transaction => {
      runningBalance += transaction.amount;
      balances.push({
        date: new Date(transaction.plannedDate),
        balance: runningBalance,
        transaction: transaction,
      });
    });

    return balances;
  }

  private identifyCashFlowPatterns(monthlyData: MonthlyData[]): CashFlowPattern {
    const inflows = monthlyData.map(d => d.totalInflow);
    const outflows = monthlyData.map(d => d.totalOutflow);
    const netFlows = monthlyData.map(d => d.netFlow);

    return {
      inflowTrend: this.calculateTrend(inflows),
      outflowTrend: this.calculateTrend(outflows),
      netFlowTrend: this.calculateTrend(netFlows),
      volatility: this.calculateVolatility(netFlows),
      seasonality: this.detectSeasonality(monthlyData),
      cyclicality: this.detectCyclicality(netFlows),
    };
  }

  private calculateCashVelocity(transactions: CashTransaction[]): CashVelocity {
    const inflows = transactions.filter(t => t.amount > 0);
    const outflows = transactions.filter(t => t.amount < 0);

    const avgInflowFrequency = this.calculateAverageFrequency(inflows);
    const avgOutflowFrequency = this.calculateAverageFrequency(outflows);

    return {
      inflowVelocity: avgInflowFrequency,
      outflowVelocity: avgOutflowFrequency,
      turnoverRatio: Math.abs(this.sumTransactions(outflows)) / Math.max(this.sumTransactions(inflows), 1),
      cycleTime: avgInflowFrequency + avgOutflowFrequency,
    };
  }

  private projectInflows(
    transactions: CashTransaction[],
    recurringExpenses: RecurringExpense[],
    months: number
  ): ProjectedInflows {
    // Analyze historical patterns
    const historicalInflows = transactions.filter(t => t.amount > 0);

    // Project capital calls based on deployment schedule
    const capitalCalls = this.projectCapitalCalls(historicalInflows, months);

    // Project distributions based on portfolio maturity
    const distributions = this.projectDistributions(historicalInflows, months);

    // Project other income (interest, fees, etc.)
    const other = this.projectOtherInflows(historicalInflows, months);

    return { capitalCalls, distributions, other };
  }

  private projectOutflows(
    transactions: CashTransaction[],
    recurringExpenses: RecurringExpense[],
    months: number
  ): ProjectedOutflows {
    // Project investments based on pipeline
    const investments = this.projectInvestments(transactions, months);

    // Project expenses from recurring schedule
    const expenses = this.projectExpenses(recurringExpenses, months);

    // Project management fees
    const managementFees = this.projectManagementFees(months);

    // Project other outflows
    const other = this.projectOtherOutflows(transactions, months);

    return { investments, expenses, managementFees, other };
  }

  private calculateBaseScenario(
    currentPosition: CashPosition,
    inflows: ProjectedInflows,
    outflows: ProjectedOutflows
  ): BaseScenario {
    const totalInflows = inflows.capitalCalls + inflows.distributions + inflows.other;
    const totalOutflows = outflows.investments + outflows.expenses + outflows.managementFees + outflows.other;

    return {
      endingCash: currentPosition.totalCash + totalInflows - totalOutflows,
      endingCommitted: currentPosition.totalCommitted - inflows.capitalCalls,
      netCashFlow: totalInflows - totalOutflows,
      cashFlowVolatility: this.estimateCashFlowVolatility(inflows, outflows),
    };
  }

  private generateScenarios(
    baseCase: BaseScenario,
    inflows: ProjectedInflows,
    outflows: ProjectedOutflows
  ): Array<{ name: string; probability: number; projectedCash: number; notes?: string }> {
    return [
      {
        name: 'Base Case',
        probability: 0.5,
        projectedCash: baseCase.endingCash,
        notes: 'Expected scenario based on current trends',
      },
      {
        name: 'Optimistic',
        probability: 0.25,
        projectedCash: baseCase.endingCash * 1.3, // 30% better
        notes: 'Accelerated distributions, delayed expenses',
      },
      {
        name: 'Pessimistic',
        probability: 0.25,
        projectedCash: baseCase.endingCash * 0.7, // 30% worse
        notes: 'Delayed distributions, increased expenses',
      },
    ];
  }

  private calculateLiquidityRiskMetrics(
    baseCase: BaseScenario,
    scenarios: Array<{ name: string; probability: number; projectedCash: number }>
  ): LiquidityRiskMetrics {
    const weightedAverageCash = scenarios.reduce((sum, scenario) =>
      sum + (scenario.projectedCash * scenario.probability), 0
    );

    const monthlyBurnRate = this.estimateMonthlyBurnRate();

    return {
      liquidityRatio: weightedAverageCash / (monthlyBurnRate * 3), // 3-month coverage
      burnRate: monthlyBurnRate,
      runwayMonths: weightedAverageCash / Math.max(monthlyBurnRate, 1),
      riskScore: this.calculateRiskScore(scenarios),
    };
  }

  // Additional helper methods would continue here...
  private sumTransactions(transactions: CashTransaction[]): number {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }

  private calculateMinimumCashBuffer(): number {
    return this.fundSize * 0.02; // 2% of fund size as minimum buffer
  }

  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    const first = values[0];
    const last = values[values.length - 1];
    const threshold = Math.abs(first) * 0.1; // 10% threshold

    if (last > first + threshold) return 'increasing';
    if (last < first - threshold) return 'decreasing';
    return 'stable';
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private detectSeasonality(monthlyData: MonthlyData[]): boolean {
    // Simple seasonality detection - look for recurring patterns
    // This is a simplified implementation
    return monthlyData.length >= 12;
  }

  private detectCyclicality(netFlows: number[]): boolean {
    // Simple cyclicality detection
    return netFlows.length >= 6;
  }

  private calculateAverageFrequency(transactions: CashTransaction[]): number {
    if (transactions.length < 2) return 0;

    const dates = transactions.map(t => new Date(t.plannedDate).getTime()).sort();
    let totalGap = 0;

    for (let i = 1; i < dates.length; i++) {
      totalGap += dates[i] - dates[i - 1];
    }

    return totalGap / (dates.length - 1) / (24 * 60 * 60 * 1000); // Days
  }

  private projectCapitalCalls(transactions: CashTransaction[], months: number): number {
    // Simple projection based on historical patterns
    const historicalCalls = transactions.filter(t => t.type === 'capital_call');
    const monthlyAverage = this.sumTransactions(historicalCalls) / Math.max(months, 1);
    return monthlyAverage * months;
  }

  private projectDistributions(transactions: CashTransaction[], months: number): number {
    const historicalDistributions = transactions.filter(t => t.type === 'distribution');
    const monthlyAverage = this.sumTransactions(historicalDistributions) / Math.max(months, 1);
    return monthlyAverage * months;
  }

  private projectOtherInflows(transactions: CashTransaction[], months: number): number {
    const otherInflows = transactions.filter(t =>
      t.amount > 0 && !['capital_call', 'distribution'].includes(t.type)
    );
    const monthlyAverage = this.sumTransactions(otherInflows) / Math.max(months, 1);
    return monthlyAverage * months;
  }

  private projectInvestments(transactions: CashTransaction[], months: number): number {
    const investments = transactions.filter(t =>
      ['investment', 'follow_on', 'bridge_loan'].includes(t.type)
    );
    const monthlyAverage = Math.abs(this.sumTransactions(investments)) / Math.max(months, 1);
    return monthlyAverage * months;
  }

  private projectExpenses(recurringExpenses: RecurringExpense[], months: number): number {
    return recurringExpenses.reduce((total, expense) => {
      if (!expense.isActive) return total;

      const monthlyAmount = expense.frequency === 'monthly' ? expense.amount :
                          expense.frequency === 'quarterly' ? expense.amount / 3 :
                          expense.amount / 12;

      return total + (monthlyAmount * months);
    }, 0);
  }

  private projectManagementFees(months: number): number {
    // Assume 2% annual management fee
    const annualFee = this.fundSize * 0.02;
    return (annualFee / 12) * months;
  }

  private projectOtherOutflows(transactions: CashTransaction[], months: number): number {
    const otherOutflows = transactions.filter(t =>
      t.amount < 0 && !['investment', 'follow_on', 'bridge_loan', 'expense', 'management_fee'].includes(t.type)
    );
    const monthlyAverage = Math.abs(this.sumTransactions(otherOutflows)) / Math.max(months, 1);
    return monthlyAverage * months;
  }

  private estimateCashFlowVolatility(inflows: ProjectedInflows, outflows: ProjectedOutflows): number {
    // Simple volatility estimate
    const totalFlow = inflows.capitalCalls + inflows.distributions + inflows.other +
                     outflows.investments + outflows.expenses + outflows.managementFees + outflows.other;
    return totalFlow * 0.15; // Assume 15% volatility
  }

  private estimateMonthlyBurnRate(): number {
    // Estimate based on fund size and typical operating expenses
    const annualExpenses = this.fundSize * 0.025; // 2.5% of fund size
    return annualExpenses / 12;
  }

  private calculateRiskScore(scenarios: Array<{ projectedCash: number; probability: number }>): number {
    // Calculate risk score based on probability of negative cash flow
    const negativeScenarios = scenarios.filter(s => s.projectedCash < 0);
    const probabilityOfNegative = negativeScenarios.reduce((sum, s) => sum + s.probability, 0);
    return probabilityOfNegative;
  }

  // Additional stress test methods...
  private calculateDelayedDistributionsScenario(
    position: CashPosition,
    delayMonths: number
  ): StressTestScenario {
    return {
      name: 'Delayed Distributions',
      description: `Portfolio distributions delayed by ${delayMonths} months`,
      endingCash: position.totalCash - (this.estimateMonthlyBurnRate() * delayMonths),
      impactRating: delayMonths > 6 ? 'high' : delayMonths > 3 ? 'medium' : 'low',
      probability: 0.3,
    };
  }

  private calculateAcceleratedInvestmentScenario(
    position: CashPosition,
    accelerationFactor: number
  ): StressTestScenario {
    const additionalDeployment = position.availableInvestment * (accelerationFactor - 1);
    return {
      name: 'Accelerated Investment',
      description: `Investment pace ${accelerationFactor}x faster than planned`,
      endingCash: position.totalCash - additionalDeployment,
      impactRating: accelerationFactor > 2 ? 'high' : accelerationFactor > 1.5 ? 'medium' : 'low',
      probability: 0.2,
    };
  }

  private calculateLPFundingDelayScenario(
    position: CashPosition,
    delayMonths: number
  ): StressTestScenario {
    const delayedCapital = position.totalCommitted * 0.3; // Assume 30% of committed delayed
    return {
      name: 'LP Funding Delays',
      description: `LP capital call responses delayed by ${delayMonths} months`,
      endingCash: position.totalCash - (this.estimateMonthlyBurnRate() * delayMonths),
      impactRating: delayMonths > 3 ? 'high' : delayMonths > 1 ? 'medium' : 'low',
      probability: 0.15,
    };
  }

  private calculateMarketDownturnScenario(
    position: CashPosition,
    factors: StressTestFactors
  ): StressTestScenario {
    const combinedImpact =
      (this.estimateMonthlyBurnRate() * factors.distributionDelay) +
      (position.availableInvestment * (factors.investmentAcceleration - 1)) +
      (this.estimateMonthlyBurnRate() * factors.lpFundingDelay);

    return {
      name: 'Market Downturn',
      description: 'Combined stress scenario: delayed distributions, funding delays, and continued investment pressure',
      endingCash: position.totalCash - combinedImpact,
      impactRating: 'high',
      probability: 0.05,
    };
  }

  private assessOverallRiskLevel(scenarios: StressTestScenario[]): 'low' | 'medium' | 'high' {
    const highRiskScenarios = scenarios.filter(s => s.impactRating === 'high' && s.endingCash < 0);
    const mediumRiskScenarios = scenarios.filter(s => s.impactRating === 'medium' && s.endingCash < 0);

    if (highRiskScenarios.length > 0) return 'high';
    if (mediumRiskScenarios.length > 1) return 'medium';
    return 'low';
  }

  private generateRiskRecommendations(scenarios: StressTestScenario[]): string[] {
    const recommendations: string[] = [];

    const negativeScenarios = scenarios.filter(s => s.endingCash < 0);

    if (negativeScenarios.length > 0) {
      recommendations.push('Consider increasing cash reserves or accelerating capital calls');
      recommendations.push('Review investment pipeline timing and prioritization');
      recommendations.push('Implement contingency funding arrangements');
    }

    const highRiskScenarios = scenarios.filter(s => s.impactRating === 'high');
    if (highRiskScenarios.length > 1) {
      recommendations.push('Develop comprehensive risk mitigation strategies');
      recommendations.push('Consider credit facility or emergency funding sources');
    }

    return recommendations;
  }

  // Capital call optimization methods...
  private calculateOptimalCallAmount(
    investment: PlannedInvestment,
    currentCash: number,
    availableCommitted: number,
    constraints: CapitalCallConstraints
  ): number {
    const shortfall = Math.max(0, investment.amount - currentCash);
    const bufferAmount = shortfall * 0.1; // 10% buffer
    const targetAmount = shortfall + bufferAmount;

    // Apply constraints
    const maxCall = Math.min(targetAmount, availableCommitted, constraints.maxCallAmount || Infinity);
    const minCall = Math.max(maxCall, constraints.minCallAmount || 0);

    return Math.min(maxCall, Math.max(minCall, targetAmount));
  }

  private calculateOptimalCallTiming(
    investmentDate: Date,
    noticePeriodDays: number,
    paymentPeriodDays: number
  ): { noticeDate: Date; dueDate: Date } {
    const noticeDate = new Date(investmentDate.getTime() - (noticePeriodDays + paymentPeriodDays) * 24 * 60 * 60 * 1000);
    const dueDate = new Date(investmentDate.getTime() - noticePeriodDays * 24 * 60 * 60 * 1000);

    return { noticeDate, dueDate };
  }

  private consolidateCapitalCalls(
    calls: OptimizedCapitalCall[],
    constraints: CapitalCallConstraints
  ): OptimizedCapitalCall[] {
    // Simple consolidation logic - merge calls within the same month
    const consolidatedCalls: OptimizedCapitalCall[] = [];
    const callsByMonth = new Map<string, OptimizedCapitalCall[]>();

    calls.forEach(call => {
      const monthKey = `${call.noticeDate.getFullYear()}-${call.noticeDate.getMonth()}`;
      if (!callsByMonth.has(monthKey)) {
        callsByMonth.set(monthKey, []);
      }
      callsByMonth.get(monthKey)!.push(call);
    });

    callsByMonth.forEach(monthCalls => {
      if (monthCalls.length === 1) {
        consolidatedCalls.push(monthCalls[0]);
      } else {
        // Merge multiple calls in the same month
        const mergedCall: OptimizedCapitalCall = {
          id: `consolidated-${consolidatedCalls.length}`,
          amount: monthCalls.reduce((sum, call) => sum + call.amount, 0),
          noticeDate: monthCalls[0].noticeDate,
          dueDate: monthCalls[0].dueDate,
          purpose: `Consolidated capital call for ${monthCalls.length} investments`,
          investments: monthCalls.flatMap(call => call.investments),
          priority: Math.min(...monthCalls.map(call => call.priority)),
          utilization: monthCalls.reduce((sum, call) => sum + call.utilization, 0),
        };
        consolidatedCalls.push(mergedCall);
      }
    });

    return consolidatedCalls.sort((a, b) => a.noticeDate.getTime() - b.noticeDate.getTime());
  }

  private calculateScheduleEfficiency(
    calls: OptimizedCapitalCall[],
    constraints: CapitalCallConstraints
  ): number {
    // Calculate efficiency score based on various factors
    let score = 100;

    // Penalize too many small calls
    const avgCallSize = calls.reduce((sum, call) => sum + call.amount, 0) / Math.max(calls.length, 1);
    if (avgCallSize < (constraints.minCallAmount || 0)) {
      score -= 20;
    }

    // Reward consolidated calls
    if (calls.length < calls.length * 0.7) { // Assuming some consolidation happened
      score += 10;
    }

    // Penalize calls too close together
    for (let i = 1; i < calls.length; i++) {
      const daysBetween = (calls[i].noticeDate.getTime() - calls[i-1].noticeDate.getTime()) / (24 * 60 * 60 * 1000);
      if (daysBetween < 30) { // Less than 30 days apart
        score -= 5;
      }
    }

    return Math.max(0, Math.min(100, score));
  }
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface CashFlowAnalysis {
  summary: {
    totalInflows: number;
    totalOutflows: number;
    netCashFlow: number;
    transactionCount: number;
    avgTransactionSize: number;
  };
  byType: Record<CashTransactionType, number>;
  byQuarter: QuarterlyData[];
  byMonth: MonthlyData[];
  runningBalances: RunningBalance[];
  patterns: CashFlowPattern;
  velocity: CashVelocity;
  generatedAt: Date;
}

export interface QuarterlyData {
  quarter: string;
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  transactionCount: number;
}

export interface MonthlyData {
  month: string;
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  transactionCount: number;
}

export interface RunningBalance {
  date: Date;
  balance: number;
  transaction: CashTransaction;
}

export interface CashFlowPattern {
  inflowTrend: 'increasing' | 'decreasing' | 'stable';
  outflowTrend: 'increasing' | 'decreasing' | 'stable';
  netFlowTrend: 'increasing' | 'decreasing' | 'stable';
  volatility: number;
  seasonality: boolean;
  cyclicality: boolean;
}

export interface CashVelocity {
  inflowVelocity: number;
  outflowVelocity: number;
  turnoverRatio: number;
  cycleTime: number;
}

export interface ProjectedInflows {
  capitalCalls: number;
  distributions: number;
  other: number;
}

export interface ProjectedOutflows {
  investments: number;
  expenses: number;
  managementFees: number;
  other: number;
}

export interface BaseScenario {
  endingCash: number;
  endingCommitted: number;
  netCashFlow: number;
  cashFlowVolatility: number;
}

export interface LiquidityRiskMetrics {
  liquidityRatio: number;
  burnRate: number;
  runwayMonths: number;
  riskScore: number;
}

export interface StressTestFactors {
  distributionDelay: number; // months
  investmentAcceleration: number; // multiplier
  lpFundingDelay: number; // months
  expenseIncrease: number; // percentage
}

export interface StressTestScenario {
  name: string;
  description: string;
  endingCash: number;
  impactRating: 'low' | 'medium' | 'high';
  probability: number;
}

export interface StressTestResult {
  currentPosition: CashPosition;
  scenarios: StressTestScenario[];
  worstCase: StressTestScenario;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
  testDate: Date;
}

export interface PlannedInvestment {
  id: string;
  description: string;
  amount: number;
  targetDate: Date;
  priority: number;
  companyId?: string;
}

export interface CapitalCallConstraints {
  noticePeriodDays: number;
  paymentPeriodDays: number;
  minCallAmount?: number;
  maxCallAmount?: number;
  maxCallsPerQuarter?: number;
}

export interface OptimizedCapitalCall {
  id: string;
  amount: number;
  noticeDate: Date;
  dueDate: Date;
  purpose: string;
  investments: PlannedInvestment[];
  priority: number;
  utilization: number;
}

export interface OptimizedCapitalCallSchedule {
  calls: OptimizedCapitalCall[];
  totalAmount: number;
  utilizationRate: number;
  averageCallSize: number;
  timeline: {
    firstCall: Date;
    lastCall: Date;
    totalDuration: number;
  };
  efficiency: number;
  generatedAt: Date;
}