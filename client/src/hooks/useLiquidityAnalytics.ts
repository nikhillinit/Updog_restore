import { useState, useEffect, useCallback, useMemo } from 'react';
import { LiquidityEngine, type CashFlowAnalysis, type StressTestResult } from '@/core/LiquidityEngine';
import type {
  CashTransaction,
  CashPosition,
  LiquidityForecast,
  RecurringExpense,
} from '@shared/types';

// =============================================================================
// LIQUIDITY ANALYTICS HOOK
// =============================================================================

export interface LiquidityAnalyticsState {
  // Analysis results
  cashFlowAnalysis: CashFlowAnalysis | null;
  liquidityForecast: LiquidityForecast | null;
  stressTestResult: StressTestResult | null;

  // Loading states
  isLoadingAnalysis: boolean;
  isLoadingForecast: boolean;
  isLoadingStressTest: boolean;

  // Error states
  analysisError: Error | null;
  forecastError: Error | null;
  stressTestError: Error | null;

  // Last update timestamps
  lastAnalysisUpdate: Date | null;
  lastForecastUpdate: Date | null;
  lastStressTestUpdate: Date | null;
}

export interface LiquidityAnalyticsActions {
  // Core actions
  runCashFlowAnalysis: () => Promise<void>;
  generateLiquidityForecast: (months?: number) => Promise<void>;
  runStressTest: (factors?: Partial<typeof defaultStressFactors>) => Promise<void>;

  // Utility actions
  refreshAll: () => Promise<void>;
  clearResults: () => void;
  exportData: () => Promise<string>; // Export as JSON

  // Real-time monitoring
  startRealTimeMonitoring: () => void;
  stopRealTimeMonitoring: () => void;
}

export interface UseLiquidityAnalyticsOptions {
  fundId: string;
  fundSize: number;

  // Data sources
  transactions?: CashTransaction[];
  currentPosition?: CashPosition;
  recurringExpenses?: RecurringExpense[];

  // Auto-refresh settings
  autoRefresh?: boolean;
  refreshIntervalMs?: number;

  // Analysis settings
  defaultForecastMonths?: number;
  enableRealTimeAlerts?: boolean;
}

const defaultStressFactors = {
  distributionDelay: 6, // 6 months delay
  investmentAcceleration: 1.5, // 50% faster investment pace
  lpFundingDelay: 2, // 2 months LP funding delay
  expenseIncrease: 20, // 20% expense increase
};

export function useLiquidityAnalytics(
  options: UseLiquidityAnalyticsOptions
): LiquidityAnalyticsState & LiquidityAnalyticsActions {

  // =============================================================================
  // STATE MANAGEMENT
  // =============================================================================

  const [state, setState] = useState<LiquidityAnalyticsState>({
    cashFlowAnalysis: null,
    liquidityForecast: null,
    stressTestResult: null,
    isLoadingAnalysis: false,
    isLoadingForecast: false,
    isLoadingStressTest: false,
    analysisError: null,
    forecastError: null,
    stressTestError: null,
    lastAnalysisUpdate: null,
    lastForecastUpdate: null,
    lastStressTestUpdate: null,
  });

  // =============================================================================
  // LIQUIDITY ENGINE INSTANCE
  // =============================================================================

  const liquidityEngine = useMemo(() => {
    return new LiquidityEngine(options.fundId, options.fundSize);
  }, [options.fundId, options.fundSize]);

  // =============================================================================
  // MOCK DATA GENERATION (Replace with API calls)
  // =============================================================================

  const generateMockTransactions = useCallback((): CashTransaction[] => {
    if (options.transactions) return options.transactions;

    // Generate mock transactions for demonstration
    const mockTransactions: CashTransaction[] = [];
    const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

    for (let i = 0; i < 50; i++) {
      const date = new Date(startDate.getTime() + (i * 7 * 24 * 60 * 60 * 1000)); // Weekly intervals

      // Random transaction type
      const types = ['capital_call', 'investment', 'distribution', 'expense', 'management_fee'];
      const type = types[Math.floor(Math.random() * types.length)] as any;

      // Amount based on type
      let amount = 0;
      switch (type) {
        case 'capital_call':
        case 'distribution':
          amount = Math.random() * 5000000 + 1000000; // $1-6M inflows
          break;
        case 'investment':
          amount = -(Math.random() * 3000000 + 500000); // $0.5-3.5M outflows
          break;
        case 'expense':
          amount = -(Math.random() * 50000 + 10000); // $10-60K outflows
          break;
        case 'management_fee':
          amount = -(Math.random() * 200000 + 100000); // $100-300K outflows
          break;
      }

      mockTransactions.push({
        id: `mock-${i}`,
        fundId: options.fundId,
        type,
        amount,
        currency: 'USD',
        plannedDate: date,
        executedDate: date,
        status: 'executed',
        description: `Mock ${type} transaction`,
        createdAt: date,
        updatedAt: date,
        createdBy: 'system',
      });
    }

    return mockTransactions;
  }, [options.fundId, options.transactions]);

  const generateMockCurrentPosition = useCallback((): CashPosition => {
    if (options.currentPosition) return options.currentPosition;

    return {
      fundId: options.fundId,
      asOfDate: new Date(),
      bankAccounts: [
        {
          accountId: 'main-operating',
          bankName: 'First Republic Bank',
          accountType: 'operating',
          balance: 5000000,
          currency: 'USD',
          lastUpdated: new Date(),
        },
        {
          accountId: 'capital-call',
          bankName: 'First Republic Bank',
          accountType: 'capital_call',
          balance: 2000000,
          currency: 'USD',
          lastUpdated: new Date(),
        },
      ],
      totalCash: 7000000,
      totalCommitted: 95000000,
      totalDeployed: 48000000,
      availableLiquidity: 7000000,
      pendingInflows: 3000000,
      pendingOutflows: 4500000,
      netPending: -1500000,
      dryPowder: 6000000,
      reserveRequirement: 15000000,
      availableInvestment: 6000000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }, [options.fundId, options.currentPosition]);

  const generateMockRecurringExpenses = useCallback((): RecurringExpense[] => {
    if (options.recurringExpenses) return options.recurringExpenses;

    return [
      {
        id: 'legal-fees',
        fundId: options.fundId,
        name: 'Legal & Regulatory',
        category: 'legal',
        amount: 15000,
        frequency: 'monthly',
        startDate: new Date(),
        nextDueDate: new Date(),
        vendor: 'Wilson Sonsini',
        description: 'General counsel and regulatory compliance',
        autoGenerate: true,
        approvalRequired: false,
        isActive: true,
        createdAt: new Date(),
        createdBy: 'system',
      },
      {
        id: 'audit-fees',
        fundId: options.fundId,
        name: 'Audit & Tax',
        category: 'audit',
        amount: 25000,
        frequency: 'quarterly',
        startDate: new Date(),
        nextDueDate: new Date(),
        vendor: 'PwC',
        description: 'Annual audit and tax preparation',
        autoGenerate: true,
        approvalRequired: true,
        isActive: true,
        createdAt: new Date(),
        createdBy: 'system',
      },
      {
        id: 'admin-fees',
        fundId: options.fundId,
        name: 'Fund Administration',
        category: 'administration',
        amount: 20000,
        frequency: 'monthly',
        startDate: new Date(),
        nextDueDate: new Date(),
        vendor: 'Citco',
        description: 'Fund administration and reporting',
        autoGenerate: true,
        approvalRequired: false,
        isActive: true,
        createdAt: new Date(),
        createdBy: 'system',
      },
    ];
  }, [options.fundId, options.recurringExpenses]);

  // =============================================================================
  // CORE ACTIONS
  // =============================================================================

  const runCashFlowAnalysis = useCallback(async () => {
    setState(prev => ({ ...prev, isLoadingAnalysis: true, analysisError: null }));

    try {
      const transactions = generateMockTransactions();
      const analysis = liquidityEngine.analyzeCashFlows(transactions);

      setState(prev => ({
        ...prev,
        cashFlowAnalysis: analysis,
        isLoadingAnalysis: false,
        lastAnalysisUpdate: new Date(),
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoadingAnalysis: false,
        analysisError: error instanceof Error ? error : new Error('Analysis failed'),
      }));
    }
  }, [liquidityEngine, generateMockTransactions]);

  const generateLiquidityForecast = useCallback(async (months = options.defaultForecastMonths || 12) => {
    setState(prev => ({ ...prev, isLoadingForecast: true, forecastError: null }));

    try {
      const currentPosition = generateMockCurrentPosition();
      const transactions = generateMockTransactions();
      const recurringExpenses = generateMockRecurringExpenses();

      const forecast = liquidityEngine.generateLiquidityForecast(
        currentPosition,
        transactions,
        recurringExpenses,
        months
      );

      setState(prev => ({
        ...prev,
        liquidityForecast: forecast,
        isLoadingForecast: false,
        lastForecastUpdate: new Date(),
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoadingForecast: false,
        forecastError: error instanceof Error ? error : new Error('Forecast failed'),
      }));
    }
  }, [options.defaultForecastMonths, liquidityEngine, generateMockCurrentPosition, generateMockTransactions, generateMockRecurringExpenses]);

  const runStressTest = useCallback(async (factors = defaultStressFactors) => {
    setState(prev => ({ ...prev, isLoadingStressTest: true, stressTestError: null }));

    try {
      const currentPosition = generateMockCurrentPosition();
      const mergedFactors = { ...defaultStressFactors, ...factors };

      const stressTestResult = liquidityEngine.runStressTest(currentPosition, mergedFactors);

      setState(prev => ({
        ...prev,
        stressTestResult,
        isLoadingStressTest: false,
        lastStressTestUpdate: new Date(),
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoadingStressTest: false,
        stressTestError: error instanceof Error ? error : new Error('Stress test failed'),
      }));
    }
  }, [liquidityEngine, generateMockCurrentPosition]);

  // =============================================================================
  // UTILITY ACTIONS
  // =============================================================================

  const refreshAll = useCallback(async () => {
    await Promise.all([
      runCashFlowAnalysis(),
      generateLiquidityForecast(),
      runStressTest(),
    ]);
  }, [runCashFlowAnalysis, generateLiquidityForecast, runStressTest]);

  const clearResults = useCallback(() => {
    setState({
      cashFlowAnalysis: null,
      liquidityForecast: null,
      stressTestResult: null,
      isLoadingAnalysis: false,
      isLoadingForecast: false,
      isLoadingStressTest: false,
      analysisError: null,
      forecastError: null,
      stressTestError: null,
      lastAnalysisUpdate: null,
      lastForecastUpdate: null,
      lastStressTestUpdate: null,
    });
  }, []);

  const exportData = useCallback(async () => {
    const exportData = {
      metadata: {
        fundId: options.fundId,
        fundSize: options.fundSize,
        exportDate: new Date().toISOString(),
        version: '1.0.0',
      },
      analysis: state.cashFlowAnalysis,
      forecast: state.liquidityForecast,
      stressTest: state.stressTestResult,
    };

    return JSON.stringify(exportData, null, 2);
  }, [options.fundId, options.fundSize, state]);

  // =============================================================================
  // REAL-TIME MONITORING
  // =============================================================================

  const [monitoringInterval, setMonitoringInterval] = useState<NodeJS.Timeout | null>(null);

  const startRealTimeMonitoring = useCallback(() => {
    if (monitoringInterval) return; // Already monitoring

    const interval = setInterval(() => {
      // Check for liquidity alerts and update if needed
      const currentPosition = generateMockCurrentPosition();

      // Simple alert logic
      const lowLiquidityThreshold = options.fundSize * 0.02; // 2% of fund size
      if (currentPosition.totalCash < lowLiquidityThreshold) {
        console.warn('Low liquidity alert:', {
          currentCash: currentPosition.totalCash,
          threshold: lowLiquidityThreshold,
          fundId: options.fundId,
        });
      }

      // Auto-refresh data periodically
      if (options.autoRefresh) {
        refreshAll();
      }
    }, options.refreshIntervalMs || 60000); // Default 1 minute

    setMonitoringInterval(interval);
  }, [monitoringInterval, options, generateMockCurrentPosition, refreshAll]);

  const stopRealTimeMonitoring = useCallback(() => {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      setMonitoringInterval(null);
    }
  }, [monitoringInterval]);

  // =============================================================================
  // EFFECTS
  // =============================================================================

  // Auto-start monitoring if enabled
  useEffect(() => {
    if (options.enableRealTimeAlerts) {
      startRealTimeMonitoring();
    }

    return () => {
      stopRealTimeMonitoring();
    };
  }, [options.enableRealTimeAlerts, startRealTimeMonitoring, stopRealTimeMonitoring]);

  // Initial data load
  useEffect(() => {
    if (options.autoRefresh !== false) {
      refreshAll();
    }
  }, [options.fundId, options.fundSize]); // Re-run when fund changes

  // =============================================================================
  // RETURN HOOK INTERFACE
  // =============================================================================

  return {
    // State
    ...state,

    // Actions
    runCashFlowAnalysis,
    generateLiquidityForecast,
    runStressTest,
    refreshAll,
    clearResults,
    exportData,
    startRealTimeMonitoring,
    stopRealTimeMonitoring,
  };
}

// =============================================================================
// HELPER HOOKS
// =============================================================================

/**
 * Hook for liquidity alerts and notifications
 */
export function useLiquidityAlerts(
  currentPosition: CashPosition | null,
  forecast: LiquidityForecast | null
) {
  const [alerts, setAlerts] = useState<LiquidityAlert[]>([]);

  useEffect(() => {
    if (!currentPosition || !forecast) {
      setAlerts([]);
      return;
    }

    const newAlerts: LiquidityAlert[] = [];

    // Low liquidity alert
    if (currentPosition.totalCash < forecast.minimumCashBuffer) {
      newAlerts.push({
        id: 'low-liquidity',
        type: 'warning',
        title: 'Low Liquidity Warning',
        message: `Current cash (${formatCurrency(currentPosition.totalCash)}) is below minimum buffer (${formatCurrency(forecast.minimumCashBuffer)})`,
        severity: 'medium',
        timestamp: new Date(),
      });
    }

    // Runway alert
    if (forecast.runwayMonths < 6) {
      newAlerts.push({
        id: 'short-runway',
        type: 'error',
        title: 'Short Cash Runway',
        message: `Only ${forecast.runwayMonths.toFixed(1)} months of runway remaining`,
        severity: 'high',
        timestamp: new Date(),
      });
    }

    // Liquidity ratio alert
    if (forecast.liquidityRatio < 1.5) {
      newAlerts.push({
        id: 'low-liquidity-ratio',
        type: 'warning',
        title: 'Low Liquidity Ratio',
        message: `Liquidity ratio (${forecast.liquidityRatio.toFixed(2)}) is below recommended threshold (1.5)`,
        severity: 'medium',
        timestamp: new Date(),
      });
    }

    setAlerts(newAlerts);
  }, [currentPosition, forecast]);

  return { alerts };
}

/**
 * Hook for liquidity performance metrics
 */
export function useLiquidityMetrics(analysis: CashFlowAnalysis | null) {
  return useMemo(() => {
    if (!analysis) return null;

    return {
      // Efficiency metrics
      cashEfficiency: analysis.velocity.turnoverRatio,
      deploymentRate: analysis.summary.totalOutflows / analysis.summary.totalInflows,

      // Volatility metrics
      cashFlowVolatility: analysis.patterns.volatility,

      // Trend indicators
      trends: {
        inflows: analysis.patterns.inflowTrend,
        outflows: analysis.patterns.outflowTrend,
        net: analysis.patterns.netFlowTrend,
      },

      // Timing metrics
      avgCycleTime: analysis.velocity.cycleTime,
      inflowFrequency: analysis.velocity.inflowVelocity,
      outflowFrequency: analysis.velocity.outflowVelocity,
    };
  }, [analysis]);
}

// =============================================================================
// HELPER TYPES
// =============================================================================

export interface LiquidityAlert {
  id: string;
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}