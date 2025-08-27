import * as client from 'prom-client';

export interface SLOConfig {
  name: string;
  target: number;        // 0.999 for 99.9%
  window: string;        // '30d', '7d', '1h'
  alertThreshold: number; // 0.1 = alert when 10% of budget consumed
}

export interface ErrorBudget {
  slo: string;
  target: number;
  window: string;
  remaining: number;     // 0.0-1.0, 1.0 = full budget
  burnRate: number;      // current rate of budget consumption
  canDeploy: boolean;    // budget allows deployment
  timeToExhaustion: number; // minutes until budget exhausted
  status: 'healthy' | 'warning' | 'critical' | 'exhausted';
}

// Metrics for error budget tracking
const errorBudgetRemaining = new client.Gauge({
  name: 'error_budget_remaining',
  help: 'Remaining error budget (0-1)',
  labelNames: ['slo', 'service', 'window']
});

const errorBudgetBurnRate = new client.Gauge({
  name: 'error_budget_burn_rate',
  help: 'Current error budget burn rate',
  labelNames: ['slo', 'service', 'window']
});

const deploymentBlockedTotal = new client.Counter({
  name: 'deployment_blocked_total',
  help: 'Total deployments blocked by error budget',
  labelNames: ['reason', 'slo', 'service']
});

export class ErrorBudgetManager {
  private slos: Map<string, SLOConfig> = new Map();
  
  constructor() {
    this.setupDefaultSLOs();
  }
  
  private setupDefaultSLOs() {
    const defaultSLOs: SLOConfig[] = [
      {
        name: 'api_availability',
        target: 0.999,     // 99.9%
        window: '30d',
        alertThreshold: 0.25
      },
      {
        name: 'api_latency_p95',
        target: 0.95,      // 95% of requests < 500ms
        window: '1h',
        alertThreshold: 0.5
      },
      {
        name: 'frontend_lcp_p75',
        target: 0.8,       // 80% of pages < 2.5s LCP
        window: '24h',
        alertThreshold: 0.3
      },
      {
        name: 'frontend_inp_p75', 
        target: 0.9,       // 90% of interactions < 200ms
        window: '24h',
        alertThreshold: 0.3
      }
    ];
    
    defaultSLOs.forEach(slo => this.slos.set(slo.name, slo));
  }
  
  async calculateErrorBudget(sloName: string): Promise<ErrorBudget> {
    const slo = this.slos.get(sloName);
    if (!slo) {
      throw new Error(`Unknown SLO: ${sloName}`);
    }
    
    // Query Prometheus for actual performance
    const [successRate, currentBurnRate] = await Promise.all([
      this.getSuccessRate(sloName, slo.window),
      this.getBurnRate(sloName, '5m') // Current burn rate over 5 minutes
    ]);
    
    // Calculate error budget
    const allowedErrorRate = 1 - slo.target;
    const actualErrorRate = 1 - successRate;
    const budgetConsumed = actualErrorRate / allowedErrorRate;
    const remaining = Math.max(0, 1 - budgetConsumed);
    
    // Calculate time to exhaustion
    let timeToExhaustion = Infinity;
    if (currentBurnRate > 0 && remaining > 0) {
      timeToExhaustion = (remaining / currentBurnRate) * this.windowToMinutes(slo.window);
    }
    
    // Determine status
    let status: ErrorBudget['status'];
    if (remaining <= 0) {
      status = 'exhausted';
    } else if (remaining <= slo.alertThreshold * 0.5) {
      status = 'critical';
    } else if (remaining <= slo.alertThreshold) {
      status = 'warning';
    } else {
      status = 'healthy';
    }
    
    // Can deploy if we have sufficient budget (>50% of alert threshold)
    const canDeploy = remaining > slo.alertThreshold * 0.5;
    
    const budget: ErrorBudget = {
      slo: sloName,
      target: slo.target,
      window: slo.window,
      remaining,
      burnRate: currentBurnRate,
      canDeploy,
      timeToExhaustion,
      status
    };
    
    // Update metrics
    errorBudgetRemaining.labels(sloName, 'api', slo.window).set(remaining);
    errorBudgetBurnRate.labels(sloName, 'api', slo.window).set(currentBurnRate);
    
    return budget;
  }
  
  async checkDeploymentGate(): Promise<{
    allowed: boolean;
    blockedBy: string[];
    budgets: ErrorBudget[];
  }> {
    const budgets = await Promise.all(
      Array.from(this.slos.keys()).map(slo => this.calculateErrorBudget(slo))
    );
    
    const blockedBy: string[] = [];
    const allowed = budgets.every(budget => {
      if (!budget.canDeploy) {
        blockedBy.push(`${budget.slo} (${Math.round(budget.remaining * 100)}% budget remaining)`);
        deploymentBlockedTotal.labels('error_budget', budget.slo, 'api').inc();
        return false;
      }
      return true;
    });
    
    return {
      allowed,
      blockedBy,
      budgets
    };
  }
  
  private async getSuccessRate(sloName: string, window: string): Promise<number> {
    // Mock implementation - replace with actual Prometheus queries
    switch (sloName) {
      case 'api_availability':
        return await this.queryPrometheus(
          `sum(rate(http_requests_total{status=~"2.."}[${window}])) / sum(rate(http_requests_total[${window}]))`
        );
      case 'api_latency_p95':
        const latency = await this.queryPrometheus(
          `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[${window}])) by (le))`
        );
        return latency < 0.5 ? 0.95 : 0.8; // Simplified
      case 'frontend_lcp_p75':
        const lcp = await this.queryPrometheus(
          `histogram_quantile(0.75, sum(rate(web_vitals_lcp_bucket[${window}])) by (le))`
        );
        return lcp < 2.5 ? 0.8 : 0.6; // Simplified
      case 'frontend_inp_p75':
        const inp = await this.queryPrometheus(
          `histogram_quantile(0.75, sum(rate(web_vitals_inp_bucket[${window}])) by (le))`
        );
        return inp < 200 ? 0.9 : 0.7; // Simplified
      default:
        return 0.95; // Default fallback
    }
  }
  
  private async getBurnRate(sloName: string, window: string): Promise<number> {
    // Calculate current burn rate (simplified mock)
    const currentSuccessRate = await this.getSuccessRate(sloName, window);
    const slo = this.slos.get(sloName)!;
    const currentErrorRate = 1 - currentSuccessRate;
    const allowedErrorRate = 1 - slo.target;
    
    return Math.max(0, currentErrorRate / allowedErrorRate);
  }
  
  private async queryPrometheus(query: string): Promise<number> {
    // Mock Prometheus query - replace with actual HTTP request
    try {
      const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
      const response = await fetch(`${prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        console.warn(`Prometheus query failed: ${response.statusText}`);
        return 0.95; // Fallback to healthy state
      }
      
      const data = await response.json();
      if (data.status === 'success' && data.data.result.length > 0) {
        return parseFloat(data.data.result[0].value[1]);
      }
    } catch (error) {
      console.warn(`Prometheus query error: ${error}`);
    }
    
    return 0.95; // Fallback to healthy state
  }
  
  private windowToMinutes(window: string): number {
    const match = window.match(/(\d+)([dhm])/);
    if (!match) return 60; // Default 1 hour
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'm': return value;
      case 'h': return value * 60;
      case 'd': return value * 24 * 60;
      default: return 60;
    }
  }
  
  // Add a new SLO configuration
  addSLO(slo: SLOConfig) {
    this.slos.set(slo.name, slo);
  }
  
  // Get all SLO configurations
  getSLOs(): SLOConfig[] {
    return Array.from(this.slos.values());
  }
  
  // Generate error budget report
  async generateReport(): Promise<{
    timestamp: string;
    overallStatus: string;
    budgets: ErrorBudget[];
    deploymentGate: {
      allowed: boolean;
      blockedBy: string[];
    };
  }> {
    const gate = await this.checkDeploymentGate();
    
    const overallStatus = gate.budgets.every(b => b.status === 'healthy') ? 'healthy' :
                         gate.budgets.some(b => b.status === 'exhausted') ? 'exhausted' :
                         gate.budgets.some(b => b.status === 'critical') ? 'critical' : 'warning';
    
    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      budgets: gate.budgets,
      deploymentGate: {
        allowed: gate.allowed,
        blockedBy: gate.blockedBy
      }
    };
  }
}

// Global instance
export const errorBudgetManager = new ErrorBudgetManager();