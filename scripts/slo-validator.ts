/**
 * SLO Validator with Multi-Window Burn Rate Analysis
 * Implements Google SRE best practices for SLO monitoring
 */

export interface SLOConfig {
  errorBudget: number; // e.g., 0.001 for 99.9% SLO
  windows: {
    short: number;   // e.g., 3600000 (1 hour)
    medium: number;  // e.g., 21600000 (6 hours) 
    long: number;    // e.g., 86400000 (24 hours)
  };
  burnRateThresholds: {
    fast: number;    // e.g., 14.4 (2% budget in 1h)
    moderate: number; // e.g., 6 (10% budget in 6h)
    slow: number;    // e.g., 1 (100% budget in 24h)
  };
}

export interface BurnRateResult {
  window: string;
  burnRate: number;
  threshold: number;
  budgetConsumed: number;
  projectedExhaustion: Date | null;
  severity: 'ok' | 'warning' | 'critical';
}

export class SLOValidator {
  private config: SLOConfig;

  constructor(config: Partial<SLOConfig> = {}) {
    this.config = {
      errorBudget: Number(process.env.SLO_ERROR_BUDGET || 0.001), // 99.9% SLO
      windows: {
        short: Number(process.env.SLO_SHORT_WINDOW || 3600000),   // 1 hour
        medium: Number(process.env.SLO_MEDIUM_WINDOW || 21600000), // 6 hours
        long: Number(process.env.SLO_LONG_WINDOW || 86400000)     // 24 hours
      },
      burnRateThresholds: {
        fast: Number(process.env.SLO_FAST_BURN_THRESHOLD || 14.4),     // 2% budget in 1h
        moderate: Number(process.env.SLO_MODERATE_BURN_THRESHOLD || 6), // 10% budget in 6h  
        slow: Number(process.env.SLO_SLOW_BURN_THRESHOLD || 1)         // 100% budget in 24h
      },
      ...config
    };
  }

  async validate(version: string): Promise<{
    passing: boolean;
    burnRates: BurnRateResult[];
    recommendation: string;
    overallSeverity: 'ok' | 'warning' | 'critical';
  }> {
    console.log(`📊 Validating SLOs for ${version}...`);
    
    // Calculate burn rates for each window
    const burnRates = await Promise.all([
      this.calculateBurnRate('short', this.config.windows.short, version),
      this.calculateBurnRate('medium', this.config.windows.medium, version),
      this.calculateBurnRate('long', this.config.windows.long, version)
    ]);

    // Determine overall status
    const overallSeverity = this.determineOverallSeverity(burnRates);
    const passing = overallSeverity !== 'critical';
    const recommendation = this.generateRecommendation(burnRates, overallSeverity);

    // Log detailed results
    this.logBurnRateResults(burnRates);

    return {
      passing,
      burnRates,
      recommendation,
      overallSeverity
    };
  }

  private async calculateBurnRate(
    windowName: string, 
    windowMs: number, 
    version: string
  ): Promise<BurnRateResult> {
    // In production, query time-series metrics for the specified window
    // Example Prometheus query:
    // rate(http_requests_total{code!~"2..",version="v1.3.2"}[1h]) / 
    // rate(http_requests_total{version="v1.3.2"}[1h])

    const errorRate = await this.fetchErrorRateForWindow(windowMs, version);
    const burnRate = errorRate / this.config.errorBudget;
    
    // Determine threshold based on window
    let threshold: number;
    if (windowName === 'short') {
      threshold = this.config.burnRateThresholds.fast;
    } else if (windowName === 'medium') {
      threshold = this.config.burnRateThresholds.moderate;
    } else {
      threshold = this.config.burnRateThresholds.slow;
    }

    // Calculate budget consumption
    const budgetConsumed = (burnRate * windowMs) / (24 * 60 * 60 * 1000); // Normalized to 24h
    
    // Project when budget will be exhausted if current rate continues
    const projectedExhaustion = burnRate > 0 
      ? new Date(Date.now() + (1 / burnRate) * (24 * 60 * 60 * 1000))
      : null;

    // Determine severity
    let severity: 'ok' | 'warning' | 'critical';
    if (burnRate > threshold) {
      severity = 'critical';
    } else if (burnRate > threshold * 0.7) {
      severity = 'warning';
    } else {
      severity = 'ok';
    }

    return {
      window: windowName,
      burnRate,
      threshold,
      budgetConsumed,
      projectedExhaustion,
      severity
    };
  }

  private async fetchErrorRateForWindow(windowMs: number, version: string): Promise<number> {
    // In production, this would query your metrics backend
    // For simulation, return realistic error rates with some variance
    
    const baseErrorRate = 0.0005; // 0.05% base error rate
    const variance = Math.random() * 0.0003; // ±0.015% variance
    const deploymentPenalty = version.includes('canary') ? 0.0002 : 0; // Slight increase for canary
    
    return Math.max(0, baseErrorRate + variance + deploymentPenalty);
  }

  private determineOverallSeverity(burnRates: BurnRateResult[]): 'ok' | 'warning' | 'critical' {
    // Multi-window alerting logic
    // Critical: Fast burn rate is critical OR (moderate AND slow are critical)
    // Warning: Any window shows warning level
    
    const fast = burnRates.find(br => br.window === 'short');
    const moderate = burnRates.find(br => br.window === 'medium');
    const slow = burnRates.find(br => br.window === 'long');

    if (fast?.severity === 'critical' || 
        (moderate?.severity === 'critical' && slow?.severity === 'critical')) {
      return 'critical';
    }

    if (burnRates.some(br => br.severity === 'warning')) {
      return 'warning';
    }

    return 'ok';
  }

  private generateRecommendation(
    burnRates: BurnRateResult[], 
    severity: 'ok' | 'warning' | 'critical'
  ): string {
    if (severity === 'critical') {
      const fastBurn = burnRates.find(br => br.window === 'short');
      if (fastBurn?.severity === 'critical') {
        return `CRITICAL: Fast burn rate detected (${fastBurn.burnRate.toFixed(2)}x vs ${fastBurn.threshold}x threshold). ` +
               `Error budget will be exhausted in ${this.formatDuration(fastBurn.projectedExhaustion)}. ` +
               `ROLLBACK RECOMMENDED.`;
      }
      
      return 'CRITICAL: Multiple windows showing elevated burn rates. Consider rollback to preserve error budget.';
    }

    if (severity === 'warning') {
      const warningWindows = burnRates.filter(br => br.severity === 'warning');
      return `WARNING: Elevated burn rate in ${warningWindows.map(w => w.window).join(', ')} window(s). ` +
             `Monitor closely and consider slowing rollout.`;
    }

    return 'SLO validation passed. Error budget consumption within acceptable limits.';
  }

  private logBurnRateResults(burnRates: BurnRateResult[]) {
    console.log('\n📈 SLO Burn Rate Analysis:');
    
    for (const result of burnRates) {
      const icon = result.severity === 'critical' ? '🚨' : 
                   result.severity === 'warning' ? '⚠️' : '✅';
      
      console.log(`   ${icon} ${result.window.padEnd(6)} window: ${result.burnRate.toFixed(3)}x burn rate ` +
                  `(threshold: ${result.threshold}x)`);
      
      if (result.projectedExhaustion) {
        console.log(`      Budget exhaustion: ${this.formatDuration(result.projectedExhaustion)}`);
      }
    }
    console.log();
  }

  private formatDuration(date: Date | null): string {
    if (!date) return 'never';
    
    const diffMs = date.getTime() - Date.now();
    if (diffMs < 0) return 'already exhausted';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    
    return `${hours}h ${minutes}m`;
  }

  // For testing and manual validation
  simulateHighErrorRate(errorRate: number) {
    // Override error rate for testing
    this.fetchErrorRateForWindow = async () => errorRate;
  }

  // Get current error budget status
  async getErrorBudgetStatus(): Promise<{
    remaining: number;
    consumed: number;
    resetTime: Date;
  }> {
    // In production, calculate based on monthly/quarterly error budget
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const resetTime = new Date(monthStart);
    resetTime.setMonth(resetTime.getMonth() + 1);
    
    // Simulate budget consumption (in production, calculate from actual metrics)
    const consumed = Math.random() * 0.3; // 0-30% consumed
    const remaining = 1 - consumed;
    
    return {
      remaining,
      consumed,
      resetTime
    };
  }
}