/**
 * Excel Parity System
 * Validates web application results against Excel/Google Sheets benchmarks
 * Ensures deterministic financial calculations match reference implementations
 */

import {
  type ExcelParityInput,
  type ExcelParityOutput,
  ExcelParityInputSchema,
  ParityValidationError,
} from '@shared/schemas/reserves-schemas';
import { logger } from '@/lib/logger';
import { performanceMonitor } from '@/lib/performance-monitor';

// Configuration constants
const DEFAULT_TOLERANCE = 0.01; // 1% tolerance
const CRITICAL_TOLERANCE = 0.005; // 0.5% for critical metrics
const MAX_ACCEPTABLE_DRIFT = 0.05; // 5% maximum drift

// Critical metrics that must have tighter tolerance
const CRITICAL_METRICS = [
  'nav',
  'dpi',
  'tvpi',
  'total_moic',
  'portfolio_irr',
  'fund_irr'
];

interface MetricComparison {
  metric: string;
  excelValue: number;
  webAppValue: number;
  absoluteDifference: number;
  percentageDrift: number;
  withinTolerance: boolean;
  tolerance: number;
  isCritical: boolean;
}

interface ParityValidationConfig {
  defaultTolerance: number;
  criticalTolerance: number;
  maxDrift: number;
  enableStrictMode: boolean;
  logDetailedResults: boolean;
}

export class ExcelParityValidator {
  private config: ParityValidationConfig;
  private validationHistory: ExcelParityOutput[] = [];

  constructor(config: Partial<ParityValidationConfig> = {}) {
    this.config = {
      defaultTolerance: DEFAULT_TOLERANCE,
      criticalTolerance: CRITICAL_TOLERANCE,
      maxDrift: MAX_ACCEPTABLE_DRIFT,
      enableStrictMode: false,
      logDetailedResults: true,
      ...config,
    };
  }

  /**
   * Main validation function - compares web app results with Excel benchmark
   */
  async validateParity(
    excelData: ExcelParityInput,
    webAppData: ExcelParityInput
  ): Promise<ExcelParityOutput> {
    const startTime = Date.now();

    try {
      // Validate inputs
      const validatedExcelData = ExcelParityInputSchema.parse(excelData);
      const validatedWebAppData = ExcelParityInputSchema.parse(webAppData);

      // Perform detailed comparison
      const comparisons = await this.performDetailedComparison(
        validatedExcelData,
        validatedWebAppData
      );

      // Generate comprehensive results
      const result = this.generateParityResults(comparisons);

      // Log and track results
      this.validationHistory.push(result);
      
      if (this.config.logDetailedResults) {
        this.logDetailedResults(result);
      }

      // Performance tracking
      const duration = Date.now() - startTime;
      performanceMonitor.recordMetric(
        'parity_validation_duration',
        duration,
        'ms',
        {
          metricsCompared: comparisons.length,
          passRate: result.overallParity.parityPercentage,
        }
      );

      logger.info('Excel parity validation completed', {
        duration,
        metricsCompared: comparisons.length,
        passRate: result.overallParity.parityPercentage,
        maxDrift: result.overallParity.maxDrift,
      });

      // Throw error if parity fails in strict mode
      if (this.config.enableStrictMode && !result.overallParity.passesParityTest) {
        throw new ParityValidationError(
          `Parity validation failed: ${result.overallParity.parityPercentage.toFixed(1)}% pass rate`,
          result.overallParity.maxDrift,
          'overall'
        );
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Excel parity validation failed', {
        error: error.message,
        duration,
        config: this.config,
      });

      throw error;
    }
  }

  /**
   * Perform detailed metric-by-metric comparison
   */
  private async performDetailedComparison(
    excelData: ExcelParityInput,
    webAppData: ExcelParityInput
  ): Promise<MetricComparison[]> {
    const comparisons: MetricComparison[] = [];

    // Compare fund-level metrics
    comparisons.push(...this.compareFundMetrics(excelData.fundMetrics, webAppData.fundMetrics));

    // Compare company-level metrics
    comparisons.push(...this.compareCompanyMetrics(excelData.companyData, webAppData.companyData));

    // Compare timeline metrics
    comparisons.push(...this.compareTimelineMetrics(excelData.timeline, webAppData.timeline));

    return comparisons;
  }

  /**
   * Compare fund-level metrics (NAV, DPI, TVPI, etc.)
   */
  private compareFundMetrics(
    excelMetrics: ExcelParityInput['fundMetrics'],
    webAppMetrics: ExcelParityInput['fundMetrics']
  ): MetricComparison[] {
    const comparisons: MetricComparison[] = [];

    // Direct metric comparisons
    const metricPairs = [
      { key: 'totalCommitted', name: 'total_committed' },
      { key: 'totalCalled', name: 'total_called' },
      { key: 'totalDistributed', name: 'total_distributed' },
      { key: 'netAssetValue', name: 'nav' },
      { key: 'managementFees', name: 'management_fees' },
      { key: 'carriedInterest', name: 'carried_interest' },
    ] as const;

    for (const { key, name } of metricPairs) {
      const comparison = this.compareMetric(
        name,
        excelMetrics[key],
        webAppMetrics[key]
      );
      comparisons.push(comparison);
    }

    // Calculated metrics
    const excelDPI = excelMetrics.totalDistributed / excelMetrics.totalCalled || 0;
    const webAppDPI = webAppMetrics.totalDistributed / webAppMetrics.totalCalled || 0;
    comparisons.push(this.compareMetric('dpi', excelDPI, webAppDPI));

    const excelTVPI = (excelMetrics.totalDistributed + excelMetrics.netAssetValue) / excelMetrics.totalCalled || 0;
    const webAppTVPI = (webAppMetrics.totalDistributed + webAppMetrics.netAssetValue) / webAppMetrics.totalCalled || 0;
    comparisons.push(this.compareMetric('tvpi', excelTVPI, webAppTVPI));

    return comparisons;
  }

  /**
   * Compare company-level metrics
   */
  private compareCompanyMetrics(
    excelCompanies: ExcelParityInput['companyData'],
    webAppCompanies: ExcelParityInput['companyData']
  ): MetricComparison[] {
    const comparisons: MetricComparison[] = [];

    // Create lookup map for web app companies
    const webAppLookup = new Map(
      webAppCompanies.map(company => [company.companyName, company])
    );

    for (const excelCompany of excelCompanies) {
      const webAppCompany = webAppLookup.get(excelCompany.companyName);
      
      if (!webAppCompany) {
        logger.warn(`Company ${excelCompany.companyName} not found in web app data`);
        continue;
      }

      const companyPrefix = `${excelCompany.companyName}_`;

      // Compare company metrics
      comparisons.push(
        this.compareMetric(
          `${companyPrefix}invested`,
          excelCompany.invested,
          webAppCompany.invested
        ),
        this.compareMetric(
          `${companyPrefix}current_value`,
          excelCompany.currentValue,
          webAppCompany.currentValue
        ),
        this.compareMetric(
          `${companyPrefix}distributed`,
          excelCompany.distributed,
          webAppCompany.distributed
        ),
        this.compareMetric(
          `${companyPrefix}moic`,
          excelCompany.moic,
          webAppCompany.moic
        ),
        this.compareMetric(
          `${companyPrefix}irr`,
          excelCompany.irr,
          webAppCompany.irr
        )
      );
    }

    return comparisons;
  }

  /**
   * Compare timeline metrics (quarterly data)
   */
  private compareTimelineMetrics(
    excelTimeline: ExcelParityInput['timeline'],
    webAppTimeline: ExcelParityInput['timeline']
  ): MetricComparison[] {
    const comparisons: MetricComparison[] = [];

    // Create lookup map for web app timeline
    const webAppLookup = new Map(
      webAppTimeline.map(quarter => [quarter.quarter, quarter])
    );

    for (const excelQuarter of excelTimeline) {
      const webAppQuarter = webAppLookup.get(excelQuarter.quarter);
      
      if (!webAppQuarter) {
        logger.warn(`Quarter ${excelQuarter.quarter} not found in web app data`);
        continue;
      }

      const quarterPrefix = `${excelQuarter.quarter}_`;

      // Compare quarterly metrics
      comparisons.push(
        this.compareMetric(
          `${quarterPrefix}nav_value`,
          excelQuarter.navValue,
          webAppQuarter.navValue
        ),
        this.compareMetric(
          `${quarterPrefix}distributions`,
          excelQuarter.distributions,
          webAppQuarter.distributions
        ),
        this.compareMetric(
          `${quarterPrefix}calls`,
          excelQuarter.calls,
          webAppQuarter.calls
        ),
        this.compareMetric(
          `${quarterPrefix}dpi`,
          excelQuarter.dpi,
          webAppQuarter.dpi
        ),
        this.compareMetric(
          `${quarterPrefix}tvpi`,
          excelQuarter.tvpi,
          webAppQuarter.tvpi
        ),
        this.compareMetric(
          `${quarterPrefix}irr`,
          excelQuarter.irr,
          webAppQuarter.irr
        )
      );
    }

    return comparisons;
  }

  /**
   * Compare individual metric values
   */
  private compareMetric(
    metricName: string,
    excelValue: number,
    webAppValue: number
  ): MetricComparison {
    const isCritical = CRITICAL_METRICS.some(critical => 
      metricName.toLowerCase().includes(critical)
    );
    
    const tolerance = isCritical ? this.config.criticalTolerance : this.config.defaultTolerance;
    
    const absoluteDifference = Math.abs(excelValue - webAppValue);
    const percentageDrift = excelValue !== 0 ? absoluteDifference / Math.abs(excelValue) : 0;
    const withinTolerance = percentageDrift <= tolerance;

    return {
      metric: metricName,
      excelValue,
      webAppValue,
      absoluteDifference,
      percentageDrift,
      withinTolerance,
      tolerance,
      isCritical,
    };
  }

  /**
   * Generate comprehensive parity results
   */
  private generateParityResults(comparisons: MetricComparison[]): ExcelParityOutput {
    const totalMetrics = comparisons.length;
    const withinTolerance = comparisons.filter(c => c.withinTolerance).length;
    const parityPercentage = totalMetrics > 0 ? withinTolerance / totalMetrics : 0;
    const maxDrift = Math.max(...comparisons.map(c => c.percentageDrift));

    // Detailed breakdown for key metrics
    const detailedBreakdown = this.generateDetailedBreakdown(comparisons);

    return {
      comparisonResults: comparisons.map(c => ({
        metric: c.metric,
        excelValue: c.excelValue,
        webAppValue: c.webAppValue,
        percentageDrift: c.percentageDrift,
        withinTolerance: c.withinTolerance,
        tolerance: c.tolerance,
      })),
      overallParity: {
        totalMetricsCompared: totalMetrics,
        metricsWithinTolerance: withinTolerance,
        parityPercentage,
        maxDrift,
        passesParityTest: parityPercentage >= 0.95 && maxDrift <= this.config.maxDrift,
      },
      detailedBreakdown,
    };
  }

  /**
   * Generate detailed breakdown for key financial metrics
   */
  private generateDetailedBreakdown(
    comparisons: MetricComparison[]
  ): ExcelParityOutput['detailedBreakdown'] {
    const findComparison = (searchTerm: string) => 
      comparisons.find(c => c.metric.toLowerCase().includes(searchTerm.toLowerCase()));

    const navComparison = findComparison('nav') || this.createEmptyComparison();
    const dpiComparison = findComparison('dpi') || this.createEmptyComparison();
    const tvpiComparison = findComparison('tvpi') || this.createEmptyComparison();
    const irrComparison = findComparison('irr') || this.createEmptyComparison();
    const moicComparison = findComparison('moic') || this.createEmptyComparison();

    return {
      navComparison: {
        match: navComparison.withinTolerance,
        drift: navComparison.percentageDrift,
      },
      dpiComparison: {
        match: dpiComparison.withinTolerance,
        drift: dpiComparison.percentageDrift,
      },
      tvpiComparison: {
        match: tvpiComparison.withinTolerance,
        drift: tvpiComparison.percentageDrift,
      },
      irrComparison: {
        match: irrComparison.withinTolerance,
        drift: irrComparison.percentageDrift,
      },
      moicComparison: {
        match: moicComparison.withinTolerance,
        drift: moicComparison.percentageDrift,
      },
    };
  }

  private createEmptyComparison(): MetricComparison {
    return {
      metric: 'not_found',
      excelValue: 0,
      webAppValue: 0,
      absoluteDifference: 0,
      percentageDrift: 0,
      withinTolerance: true,
      tolerance: 0,
      isCritical: false,
    };
  }

  /**
   * Log detailed parity results for debugging
   */
  private logDetailedResults(result: ExcelParityOutput): void {
    logger.info('Excel Parity Validation Results', {
      overallParity: result.overallParity,
      detailedBreakdown: result.detailedBreakdown,
    });

    // Log failures for investigation
    const failures = result.comparisonResults.filter(r => !r.withinTolerance);
    if (failures.length > 0) {
      logger.warn('Parity validation failures detected', {
        failureCount: failures.length,
        failures: failures.map(f => ({
          metric: f.metric,
          drift: (f.percentageDrift * 100).toFixed(2) + '%',
          excel: f.excelValue,
          webApp: f.webAppValue,
        })),
      });
    }

    // Log critical metric performance
    const criticalMetrics = result.comparisonResults.filter(r => 
      CRITICAL_METRICS.some(critical => r.metric.toLowerCase().includes(critical))
    );
    
    if (criticalMetrics.length > 0) {
      const criticalPassRate = criticalMetrics.filter(m => m.withinTolerance).length / criticalMetrics.length;
      logger.info('Critical metrics performance', {
        criticalPassRate: (criticalPassRate * 100).toFixed(1) + '%',
        criticalMetrics: criticalMetrics.map(m => ({
          metric: m.metric,
          passed: m.withinTolerance,
          drift: (m.percentageDrift * 100).toFixed(2) + '%',
        })),
      });
    }
  }

  /**
   * Get validation history for trend analysis
   */
  getValidationHistory(): ExcelParityOutput[] {
    return [...this.validationHistory];
  }

  /**
   * Clear validation history
   */
  clearHistory(): void {
    this.validationHistory = [];
  }

  /**
   * Generate parity report
   */
  generateParityReport(): {
    summary: {
      totalValidations: number;
      averagePassRate: number;
      trendDirection: 'improving' | 'declining' | 'stable';
    };
    recentResults: ExcelParityOutput[];
    recommendations: string[];
  } {
    const history = this.validationHistory;
    const recentResults = history.slice(-5); // Last 5 validations

    if (history.length === 0) {
      return {
        summary: {
          totalValidations: 0,
          averagePassRate: 0,
          trendDirection: 'stable',
        },
        recentResults: [],
        recommendations: ['No validation history available'],
      };
    }

    const averagePassRate = history.reduce(
      (sum, result) => sum + result.overallParity.parityPercentage,
      0
    ) / history.length;

    // Determine trend
    let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';
    if (history.length >= 3) {
      const recent = history.slice(-3).map(r => r.overallParity.parityPercentage);
      const isImproving = recent[2] > recent[1] && recent[1] > recent[0];
      const isDeclining = recent[2] < recent[1] && recent[1] < recent[0];
      
      if (isImproving) trendDirection = 'improving';
      else if (isDeclining) trendDirection = 'declining';
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(history);

    return {
      summary: {
        totalValidations: history.length,
        averagePassRate,
        trendDirection,
      },
      recentResults,
      recommendations,
    };
  }

  private generateRecommendations(history: ExcelParityOutput[]): string[] {
    const recommendations: string[] = [];
    
    if (history.length === 0) return recommendations;

    const latestResult = history[history.length - 1];
    
    if (latestResult.overallParity.parityPercentage < 0.9) {
      recommendations.push('Parity rate below 90% - investigate calculation differences');
    }

    if (latestResult.overallParity.maxDrift > 0.02) {
      recommendations.push('High drift detected - review precision and rounding logic');
    }

    if (!latestResult.detailedBreakdown.navComparison.match) {
      recommendations.push('NAV calculation mismatch - validate asset valuation logic');
    }

    if (!latestResult.detailedBreakdown.dpiComparison.match) {
      recommendations.push('DPI calculation mismatch - review distribution calculations');
    }

    if (!latestResult.detailedBreakdown.irrComparison.match) {
      recommendations.push('IRR calculation mismatch - validate cash flow timing and IRR algorithm');
    }

    if (recommendations.length === 0) {
      recommendations.push('Parity validation passing - continue monitoring');
    }

    return recommendations;
  }
}

// Utility functions for common parity testing scenarios
export async function validateFundParity(
  excelFundData: ExcelParityInput['fundMetrics'],
  webAppFundData: ExcelParityInput['fundMetrics'],
  tolerance = DEFAULT_TOLERANCE
): Promise<boolean> {
  const validator = new ExcelParityValidator({
    defaultTolerance: tolerance,
    enableStrictMode: false,
  });

  const mockExcelInput: ExcelParityInput = {
    fundMetrics: excelFundData,
    companyData: [],
    timeline: [],
  };

  const mockWebAppInput: ExcelParityInput = {
    fundMetrics: webAppFundData,
    companyData: [],
    timeline: [],
  };

  try {
    const result = await validator.validateParity(mockExcelInput, mockWebAppInput);
    return result.overallParity.passesParityTest;
  } catch (error) {
    logger.error('Fund parity validation failed', { error });
    return false;
  }
}

export async function validateCompanyParity(
  excelCompanies: ExcelParityInput['companyData'],
  webAppCompanies: ExcelParityInput['companyData'],
  tolerance = DEFAULT_TOLERANCE
): Promise<ExcelParityOutput> {
  const validator = new ExcelParityValidator({
    defaultTolerance: tolerance,
    enableStrictMode: false,
  });

  const mockExcelInput: ExcelParityInput = {
    fundMetrics: {
      totalCommitted: 0,
      totalCalled: 0,
      totalDistributed: 0,
      netAssetValue: 0,
      managementFees: 0,
      carriedInterest: 0,
    },
    companyData: excelCompanies,
    timeline: [],
  };

  const mockWebAppInput: ExcelParityInput = {
    fundMetrics: {
      totalCommitted: 0,
      totalCalled: 0,
      totalDistributed: 0,
      netAssetValue: 0,
      managementFees: 0,
      carriedInterest: 0,
    },
    companyData: webAppCompanies,
    timeline: [],
  };

  return await validator.validateParity(mockExcelInput, mockWebAppInput);
}

// Export singleton instance for common usage
export const defaultParityValidator = new ExcelParityValidator();