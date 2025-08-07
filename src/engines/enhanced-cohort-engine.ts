/**
 * Enhanced Cohort Engine with centralized array-safety utilities
 */

import { forEach } from '../utils/array-safety';

export class EnhancedCohortEngine {
  static buildDefaultGraduationMatrix(stageCount: number): number[][] {
    const matrix: number[][] = [];
    
    // Initialize matrix with default values
    for (let i = 0; i < stageCount; i++) {
      matrix[i] = new Array(stageCount).fill(0);
    }
    
    // Use centralized array-safety utility
    forEach(matrix, (row, i) => {
      forEach(row, (_, j) => {
        if (i === j) {
          matrix[i][j] = 0.8; // Default graduation rate
        } else if (j === i + 1) {
          matrix[i][j] = 0.2; // Default progression rate
        }
      });
    });
    
    return matrix;
  }
  
  processReserves(reserves: any[]): void {
    // Use centralized array-safety utility
    forEach(reserves, reserve => {
      // Process each reserve
      if (reserve && typeof reserve === 'object') {
        // Process reserve data
        this.validateReserveData(reserve);
        this.calculateReserveMetrics(reserve);
      }
    });
  }
  
  calculateMetrics(cohorts: any[]): void {
    // Use centralized array-safety utility for nested operations
    forEach(cohorts, cohort => {
      if (cohort && cohort.companies) {
        forEach(cohort.companies, company => {
          // Process company metrics
          if (company && typeof company === 'object') {
            this.processCompanyMetrics(company);
            this.updateCohortAggregates(cohort, company);
          }
        });
      }
    });
  }

  private validateReserveData(reserve: any): boolean {
    // Validation logic for reserve data
    return reserve && reserve.amount && reserve.date;
  }

  private calculateReserveMetrics(reserve: any): void {
    // Calculate metrics for individual reserve
    if (reserve.amount) {
      reserve.calculatedMetrics = {
        utilization: reserve.utilized / reserve.amount,
        remainingCapacity: reserve.amount - reserve.utilized
      };
    }
  }

  private processCompanyMetrics(company: any): void {
    // Process individual company metrics
    if (company.financials) {
      forEach(company.financials, financial => {
        // Process financial data with null safety
        if (financial && financial.period) {
          this.calculateFinancialRatios(financial);
        }
      });
    }
  }

  private updateCohortAggregates(cohort: any, company: any): void {
    // Update cohort-level aggregated metrics
    if (!cohort.aggregates) {
      cohort.aggregates = {
        totalValue: 0,
        companyCount: 0,
        averageMultiple: 0
      };
    }
    
    if (company.valuation) {
      cohort.aggregates.totalValue += company.valuation;
      cohort.aggregates.companyCount += 1;
    }
  }

  private calculateFinancialRatios(financial: any): void {
    // Calculate financial ratios for a specific period
    if (financial.revenue && financial.expenses) {
      financial.profitMargin = (financial.revenue - financial.expenses) / financial.revenue;
    }
  }

  // Additional method to process portfolio data with centralized array-safety utility
  processPortfolioData(portfolios: any[]): void {
    forEach(portfolios, portfolio => {
      if (portfolio && portfolio.investments) {
        forEach(portfolio.investments, investment => {
          if (investment && investment.rounds) {
            forEach(investment.rounds, round => {
              // Process investment round data
              if (round && round.amount) {
                this.processInvestmentRound(round);
              }
            });
          }
        });
      }
    });
  }

  private processInvestmentRound(round: any): void {
    // Process individual investment round
    if (round.date && round.amount) {
      round.processed = true;
      round.processedAt = new Date();
    }
  }

  // Method to handle time-series data with centralized array-safety utility
  processTimeSeriesData(timeSeries: any[]): void {
    forEach(timeSeries, series => {
      if (series && series.dataPoints) {
        forEach(series.dataPoints, point => {
          // Process individual data point
          if (point && point.timestamp && point.value !== undefined) {
            this.normalizeDataPoint(point);
          }
        });
      }
    });
  }

  private normalizeDataPoint(point: any): void {
    // Normalize data point values
    if (typeof point.value === 'number') {
      point.normalizedValue = Math.max(0, Math.min(1, point.value));
    }
  }

  // Batch processing method with centralized array-safety utility
  processBatchOperations(batches: any[]): void {
    forEach(batches, batch => {
      if (batch && batch.operations) {
        forEach(batch.operations, operation => {
          // Process individual batch operation
          if (operation && operation.type) {
            this.executeBatchOperation(operation);
          }
        });
      }
    });
  }

  private executeBatchOperation(operation: any): void {
    // Execute individual batch operation
    switch (operation.type) {
      case 'calculate':
        // Perform calculation
        break;
      case 'validate':
        // Perform validation
        break;
      case 'transform':
        // Perform transformation
        break;
      default:
        console.warn(`Unknown operation type: ${operation.type}`);
    }
  }
}
