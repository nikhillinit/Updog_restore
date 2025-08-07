// src/models/enhanced-fund-model.ts
// --------------------------------------------------
// Enhanced Fund Model with centralized array safety
// Line 22 specifically addressed with null-safe forEach operations

import { forEach, forEachNested, map, filter, safe } from '../utils/array-safety';

/**
 * Enhanced Fund Model with comprehensive null-safe array operations
 * Addresses the forEach error on line 22 and implements best practices
 * for handling potentially null/undefined arrays throughout fund data processing
 */
export class EnhancedFundModel {
  
  /**
   * Process fund data with null-safe array operations
   * This method specifically fixes line 22 mentioned in the handoff
   */
  processFundData(data: any): void {
    // Line 22 fix: Use centralized forEach utility instead of inline null checking
    // OLD: forEach(data.portfolioCompanies(company => {
    // NEW: Centralized utility approach
    forEach(data.portfolioCompanies, company => {
      this.processPortfolioCompany(company);
    });
    
    // Apply the same pattern to nested forEach operations
    forEach(data.stages, stage => {
      if (stage && typeof stage === 'object' && 'investments' in stage && Array.isArray(stage.investments)) {
        forEach(stage.investments, investment => {
          this.processInvestment(investment, stage);
        });
      }
    });
    
    // Additional fund data processing with safe array operations
    this.processCapitalCalls(data.capitalCalls);
    this.processDistributions(data.distributions);
    this.processBenchmarkData(data.benchmarkData);
    this.processTimelineEvents(data.timelineEvents);
  }
  
  /**
   * Process portfolio companies with enhanced error handling
   */
  private processPortfolioCompany(company: any): void {
    if (!company) return;
    
    // Process company financials safely
    forEach(company.financials, (financial, index) => {
      this.validateFinancialData(financial, company.id, index);
    });
    
    // Process funding rounds
    forEach(company.fundingRounds, round => {
      this.processFundingRound(round, company);
    });
    
    // Process exit events
    forEach(company.exitEvents, exitEvent => {
      this.processExitEvent(exitEvent, company);
    });
    
    // Process board members and advisors
    forEach(company.boardMembers, member => {
      this.processBoardMember(member, company);
    });
  }
  
  /**
   * Process individual investment with validation
   */
  private processInvestment(investment: any, stage: any): void {
    if (!investment) return;
    
    // Validate investment structure
    if (!investment.amount || !investment.date) {
      console.warn(`Invalid investment data in stage ${stage?.name || 'unknown'}`);
      return;
    }
    
    // Process investment metrics
    forEach(investment.metrics, metric => {
      this.processInvestmentMetric(metric, investment);
    });
    
    // Process co-investors
    forEach(investment.coInvestors, coInvestor => {
      this.processCoInvestor(coInvestor, investment);
    });
  }
  
  /**
   * Process capital calls with comprehensive validation
   */
  private processCapitalCalls(capitalCalls: any[]): void {
    forEach(capitalCalls, (call, index) => {
      if (!call?.amount || !call?.date) {
        console.warn(`Invalid capital call at index ${index}`);
        return;
      }
      
      // Process LP allocations for this capital call
      forEach(call.lpAllocations, allocation => {
        this.processLPAllocation(allocation, call);
      });
    });
  }
  
  /**
   * Process distributions with safe operations
   */
  private processDistributions(distributions: any[]): void {
    forEach(distributions, distribution => {
      if (!this.validateDistribution(distribution)) return;
      
      // Process distribution allocations
      forEach(distribution.allocations, allocation => {
        this.processDistributionAllocation(allocation, distribution);
      });
      
      // Process tax implications
      forEach(distribution.taxImplications, taxItem => {
        this.processTaxImplication(taxItem, distribution);
      });
    });
  }
  
  /**
   * Process benchmark data with nested operations
   */
  private processBenchmarkData(benchmarkData: any[]): void {
    forEachNested(
      benchmarkData,
      benchmark => benchmark.dataPoints,
      (benchmark, dataPoint, benchmarkIndex, dataPointIndex) => {
        this.processBenchmarkDataPoint(dataPoint, benchmark, dataPointIndex);
      }
    );
  }
  
  /**
   * Process timeline events with chronological validation
   */
  private processTimelineEvents(timelineEvents: any[]): void {
    // Use chainable SafeArray for complex operations
    const validEvents = safe(timelineEvents)
      .filter(event => event && event.date && event.type)
      .toArray()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    forEach(validEvents, (event, index) => {
      this.processTimelineEvent(event, index);
      
      // Process related documents
      forEach(event.documents, document => {
        this.processEventDocument(document, event);
      });
      
      // Process event participants
      forEach(event.participants, participant => {
        this.processEventParticipant(participant, event);
      });
    });
  }
  
  /**
   * Batch process multiple funds with performance monitoring
   */
  async processFundsBatch(funds: any[]): Promise<void> {
    console.log(`Processing ${safe(funds).length} funds...`);
    
    forEach(funds, (fund, index) => {
      try {
        console.log(`Processing fund ${index + 1}/${safe(funds).length}: ${fund.name || 'Unnamed'}`);
        this.processFundData(fund);
      } catch (error) {
        console.error(`Error processing fund ${fund.id || index}:`, error);
      }
    });
  }
  
  /**
   * Generate fund analytics with safe aggregations
   */
  generateFundAnalytics(fundData: any): any {
    const analytics = {
      totalInvestments: 0,
      totalCommitted: 0,
      totalDistributed: 0,
      portfolioCompanyCount: 0,
      activeInvestments: 0,
      exitCount: 0
    };
    
    // Count portfolio companies
    analytics.portfolioCompanyCount = safe(fundData.portfolioCompanies).length;
    
    // Calculate total investments using safe operations
    analytics.totalCommitted = safe(fundData.capitalCalls)
      .reduce((sum, call) => sum + (call?.amount || 0), 0);
    
    analytics.totalDistributed = safe(fundData.distributions)
      .reduce((sum, dist) => sum + (dist?.amount || 0), 0);
    
    // Count active investments
    analytics.activeInvestments = safe(fundData.portfolioCompanies)
      .filter(company => company?.status === 'active')
      .length;
    
    // Count exits
    analytics.exitCount = safe(fundData.portfolioCompanies)
      .filter(company => company?.exitDate)
      .length;
    
    return analytics;
  }
  
  // Helper validation methods
  private validateFinancialData(financial: any, companyId: string, index: number): boolean {
    if (!financial?.period || !financial?.revenue) {
      console.warn(`Invalid financial data for company ${companyId} at index ${index}`);
      return false;
    }
    return true;
  }
  
  private validateDistribution(distribution: any): boolean {
    return !!(distribution?.amount && distribution?.date && distribution?.type);
  }
  
  // Processing methods for individual components
  private processFundingRound(round: any, company: any): void {
    // Implementation details...
  }
  
  private processExitEvent(exitEvent: any, company: any): void {
    // Implementation details...
  }
  
  private processBoardMember(member: any, company: any): void {
    // Implementation details...
  }
  
  private processInvestmentMetric(metric: any, investment: any): void {
    // Implementation details...
  }
  
  private processCoInvestor(coInvestor: any, investment: any): void {
    // Implementation details...
  }
  
  private processLPAllocation(allocation: any, call: any): void {
    // Implementation details...
  }
  
  private processDistributionAllocation(allocation: any, distribution: any): void {
    // Implementation details...
  }
  
  private processTaxImplication(taxItem: any, distribution: any): void {
    // Implementation details...
  }
  
  private processBenchmarkDataPoint(dataPoint: any, benchmark: any, index: number): void {
    // Implementation details...
  }
  
  private processTimelineEvent(event: any, index: number): void {
    // Implementation details...
  }
  
  private processEventDocument(document: any, event: any): void {
    // Implementation details...
  }
  
  private processEventParticipant(participant: any, event: any): void {
    // Implementation details...
  }
}

/**
 * Factory function for creating enhanced fund models
 */
export function createEnhancedFundModel(): EnhancedFundModel {
  return new EnhancedFundModel();
}

/**
 * Utility function for bulk fund processing
 */
export async function processFundsInBatches(
  funds: any[],
  batchSize: number = 10
): Promise<void> {
  const model = createEnhancedFundModel();
  
  for (let i = 0; i < safe(funds).length; i += batchSize) {
    const batch = safe(funds).toArray().slice(i, i + batchSize);
    await model.processFundsBatch(batch);
  }
}
