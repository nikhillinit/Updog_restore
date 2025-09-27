/**
 * Production-grade error handling and recovery system for reserves calculations
 * Provides graceful degradation, automatic retry, and comprehensive error reporting
 */

import { metrics } from '@/metrics/reserves-metrics';
import type { ReservesInput, ReservesConfig, ReservesResult } from '@shared/types/reserves-v11';

export interface ErrorContext {
  operation: string;
  input?: Partial<ReservesInput>;
  config?: Partial<ReservesConfig>;
  timestamp: Date;
  userAgent?: string;
  sessionId?: string;
}

export interface RecoveryStrategy {
  name: string;
  canRecover: (_error: Error, _context: ErrorContext) => boolean;
  recover: (_error: Error, _context: ErrorContext) => Promise<ReservesResult | null>;
  priority: number;
}

export class ReservesErrorBoundary {
  private recoveryStrategies: RecoveryStrategy[] = [];
  private errorHistory: Array<{ error: Error; context: ErrorContext; timestamp: Date }> = [];
  private readonly MAX_HISTORY = 100;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_WINDOW = 60000; // 1 minute
  
  constructor() {
    this.initializeRecoveryStrategies();
  }
  
  private initializeRecoveryStrategies(): void {
    // Strategy 1: Simplified calculation for data errors
    this.addRecoveryStrategy({
      name: 'simplified_calculation',
      priority: 1,
      canRecover: (error: Error) => {
        return error.message.includes('companies') || 
               error.message.includes('validation') ||
               error.message.includes('data');
      },
      recover: async (error: Error, context: ErrorContext): Promise<ReservesResult | null> => {
        if (!context.input || !context.config) return null;
        
        try {
          // Simplified calculation with reduced complexity
          const simplifiedInput = {
            ...context.input,
            companies: context.input.companies?.filter(c => 
              c.invested_cents > 0 && c.exit_moic_bps > 0
            ).slice(0, 50) || [] // Limit to 50 companies
          };
          
          const simplifiedConfig = {
            ...context.config,
            remain_passes: 0, // Disable remain passes
            audit_level: 'basic' as const
          };
          
          // Use basic calculation logic
          return this.performSimplifiedCalculation(simplifiedInput as ReservesInput, simplifiedConfig as ReservesConfig);
        } catch (recoveryError) {
          console.error('Simplified calculation recovery failed:', recoveryError);
          return null;
        }
      }
    });
    
    // Strategy 2: Cached result fallback
    this.addRecoveryStrategy({
      name: 'cached_fallback',
      priority: 2,
      canRecover: (error: Error) => {
        return !error.message.includes('critical') && 
               !error.message.includes('security');
      },
      recover: async (error: Error, context: ErrorContext): Promise<ReservesResult | null> => {
        try {
          // Attempt to find similar cached result
          const cacheKey = this.generateFallbackCacheKey(context);
          const cached = localStorage.getItem(`reserves_fallback_${cacheKey}`);
          
          if (cached) {
            const result = JSON.parse(cached);
            
            // Add warning about using cached data
            return {
              ...result,
              warnings: [...(result.warnings || []), 'Using cached fallback data due to calculation error']
            };
          }
          
          return null;
        } catch (cacheError) {
          console.error('Cache fallback recovery failed:', cacheError);
          return null;
        }
      }
    });
    
    // Strategy 3: Default conservative estimate
    this.addRecoveryStrategy({
      name: 'conservative_estimate',
      priority: 3,
      canRecover: () => true, // Last resort
      recover: async (error: Error, context: ErrorContext): Promise<ReservesResult | null> => {
        if (!context.input || !context.config) return null;
        
        try {
          const totalInvested = context.input.companies?.reduce((sum: any, c: any) => sum + c.invested_cents, 0) || 0;
          const reserveAmount = Math.floor(totalInvested * (context.config.reserve_bps || 1500) / 10000);
          
          return {
            ok: true,
            data: {
              allocations: [],
              remaining_cents: reserveAmount,
              metadata: {
                total_available_cents: reserveAmount,
                total_allocated_cents: 0,
                conservation_check: true,
                exit_moic_ranking: [],
                max_iterations: 1,
                companies_funded: 0
              }
            },
            warnings: [
              'Conservative estimate used due to calculation error',
              'No allocations calculated - manual review required',
              `Original error: ${error.message}`
            ]
          };
        } catch (estimateError) {
          console.error('Conservative estimate recovery failed:', estimateError);
          return null;
        }
      }
    });
  }
  
  async executeWithRecovery(
    operation: () => Promise<ReservesResult>,
    context: ErrorContext
  ): Promise<ReservesResult> {
    try {
      // Check circuit breaker
      if (this.isCircuitOpen(context)) {
        throw new Error('Circuit breaker open - too many recent failures');
      }
      
      const result = await operation();
      
      // Cache successful result for potential fallback
      this.cacheSuccessfulResult(result, context);
      
      return result;
      
    } catch (error) {
      console.error(`Error in ${context.operation}:`, error);
      
      // Record error
      this.recordError(error as Error, context);
      
      // Report error to monitoring
      metrics.recordError(`${context.operation}: ${(error as Error).message}`);
      
      // Attempt recovery
      const recoveredResult = await this.attemptRecovery(error as Error, context);
      
      if (recoveredResult) {
        metrics.recordRecovery(context.operation, true);
        return recoveredResult;
      }
      
      // Recovery failed - return error result
      metrics.recordRecovery(context.operation, false);
      
      return {
        ok: false,
        error: JSON.stringify({
          code: 'CALCULATION_FAILED',
          message: (error as Error).message,
          details: {
            operation: context.operation,
            timestamp: context.timestamp.toISOString(),
            recoveryAttempted: true
          }
        }),
        warnings: [
          'Calculation failed and recovery unsuccessful',
          'Please check input data and try again',
          'Contact support if the issue persists'
        ]
      };
    }
  }
  
  private async attemptRecovery(error: Error, context: ErrorContext): Promise<ReservesResult | null> {
    // Sort strategies by priority
    const sortedStrategies = [...this.recoveryStrategies].sort((a: any, b: any) => a.priority - b.priority);
    
    for (const strategy of sortedStrategies) {
      if (strategy.canRecover(error, context)) {
        try {
          console.log(`Attempting recovery with strategy: ${strategy.name}`);
          const result = await strategy.recover(error, context);
          
          if (result) {
            console.log(`Recovery successful with strategy: ${strategy.name}`);
            return result;
          }
        } catch (recoveryError) {
          console.error(`Recovery strategy ${strategy.name} failed:`, recoveryError);
        }
      }
    }
    
    return null;
  }
  
  private performSimplifiedCalculation(input: ReservesInput, config: ReservesConfig): ReservesResult {
    const validCompanies = input.companies.filter(c => 
      c.invested_cents > 0 && c.exit_moic_bps > 0
    );
    
    if (validCompanies.length === 0) {
      throw new Error('No valid companies for simplified calculation');
    }
    
    const totalInvested = validCompanies.reduce((sum: any, c: any) => sum + c.invested_cents, 0);
    const reserveAmount = Math.floor(totalInvested * config.reserve_bps / 10000);
    
    // Simple equal allocation
    const allocationPerCompany = Math.floor(reserveAmount / validCompanies.length);
    const remainder = reserveAmount - (allocationPerCompany * validCompanies.length);
    
    const allocations = validCompanies.map((company: any, index: any) => ({
      company_id: company.id,
      planned_cents: allocationPerCompany + (index === 0 ? remainder : 0),
      iteration: 1,
      reason: 'Equal allocation in recovery mode',
      cap_cents: allocationPerCompany + (index === 0 ? remainder : 0)
    }));
    
    return {
      ok: true,
      data: {
        allocations,
        remaining_cents: 0,
        metadata: {
          total_available_cents: reserveAmount,
          total_allocated_cents: reserveAmount,
          conservation_check: true,
          exit_moic_ranking: validCompanies.map(c => c.id),
          max_iterations: 1,
          companies_funded: validCompanies.length
        }
      },
      warnings: ['Simplified calculation used - results may not reflect optimal allocation']
    };
  }
  
  private isCircuitOpen(context: ErrorContext): boolean {
    const recentErrors = this.errorHistory.filter(
      entry => Date.now() - entry.timestamp.getTime() < this.CIRCUIT_BREAKER_WINDOW &&
               entry.context.operation === context.operation
    );
    
    return recentErrors.length >= this.CIRCUIT_BREAKER_THRESHOLD;
  }
  
  private recordError(error: Error, context: ErrorContext): void {
    this.errorHistory.push({
      error,
      context,
      timestamp: new Date()
    });
    
    // Trim history
    if (this.errorHistory.length > this.MAX_HISTORY) {
      this.errorHistory = this.errorHistory.slice(-this.MAX_HISTORY);
    }
  }
  
  private cacheSuccessfulResult(result: ReservesResult, context: ErrorContext): void {
    try {
      const cacheKey = this.generateFallbackCacheKey(context);
      const cacheData = {
        ...result,
        cachedAt: new Date().toISOString(),
        context: {
          operation: context.operation,
          timestamp: context.timestamp.toISOString()
        }
      };
      
      localStorage.setItem(`reserves_fallback_${cacheKey}`, JSON.stringify(cacheData));
    } catch (cacheError) {
      console.error('Failed to cache successful result:', cacheError);
    }
  }
  
  private generateFallbackCacheKey(context: ErrorContext): string {
    const parts = [
      context.operation,
      context.input?.companies?.length || 0,
      context.input?.fund_size_cents || 0,
      context.config?.reserve_bps || 0
    ];
    
    return parts.join('_');
  }
  
  private addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
  }
  
  // Analytics methods
  getErrorStats() {
    const now = Date.now();
    const recentErrors = this.errorHistory.filter(
      entry => now - entry.timestamp.getTime() < this.CIRCUIT_BREAKER_WINDOW
    );
    
    const operationCounts = recentErrors.reduce((acc: any, entry: any) => {
      acc[entry.context.operation] = (acc[entry.context.operation] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalErrors: this.errorHistory.length,
      recentErrors: recentErrors.length,
      operationBreakdown: operationCounts,
      circuitStatus: Object.keys(operationCounts).reduce((acc: any, op: any) => {
        acc[op] = operationCounts[op] >= this.CIRCUIT_BREAKER_THRESHOLD ? 'OPEN' : 'CLOSED';
        return acc;
      }, {} as Record<string, string>)
    };
  }
  
  clearErrorHistory(): void {
    this.errorHistory = [];
  }
}

// Export singleton
export const reservesErrorBoundary = new ReservesErrorBoundary();