import { register, Counter, Histogram, Gauge } from 'prom-client';

export interface AgentMetrics {
  executionsTotal: Counter<string>;
  executionDuration: Histogram<string>;
  executionFailures: Counter<string>;
  activeAgents: Gauge<string>;
  lastExecutionTime: Gauge<string>;
  retryCount: Counter<string>;
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: AgentMetrics;

  private constructor() {
    // Clear existing metrics
    register.clear();

    this.metrics = {
      executionsTotal: new Counter({
        name: 'agent_executions_total',
        help: 'Total number of agent executions',
        labelNames: ['agent_name', 'operation', 'status'],
      }),

      executionDuration: new Histogram({
        name: 'agent_execution_duration_ms',
        help: 'Duration of agent executions in milliseconds',
        labelNames: ['agent_name', 'operation'],
        buckets: [100, 500, 1000, 5000, 10000, 30000, 60000, 120000],
      }),

      executionFailures: new Counter({
        name: 'agent_execution_failures_total',
        help: 'Total number of agent execution failures',
        labelNames: ['agent_name', 'operation', 'error_type'],
      }),

      activeAgents: new Gauge({
        name: 'agent_active_count',
        help: 'Number of currently active agents',
        labelNames: ['agent_name'],
      }),

      lastExecutionTime: new Gauge({
        name: 'agent_last_execution_timestamp',
        help: 'Timestamp of last agent execution',
        labelNames: ['agent_name'],
      }),

      retryCount: new Counter({
        name: 'agent_retries_total',
        help: 'Total number of agent execution retries',
        labelNames: ['agent_name', 'operation'],
      }),
    };

    // Register all metrics
    register.registerMetric(this.metrics.executionsTotal);
    register.registerMetric(this.metrics.executionDuration);
    register.registerMetric(this.metrics.executionFailures);
    register.registerMetric(this.metrics.activeAgents);
    register.registerMetric(this.metrics.lastExecutionTime);
    register.registerMetric(this.metrics.retryCount);
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  getMetrics(): AgentMetrics {
    return this.metrics;
  }

  recordExecution(
    agentName: string,
    operation: string,
    status: 'success' | 'failure',
    duration: number,
    retries: number = 0
  ): void {
    // Record execution
    this.metrics.executionsTotal.inc({ agent_name: agentName, operation, status });
    
    // Record duration
    this.metrics.executionDuration.observe({ agent_name: agentName, operation }, duration);
    
    // Record retries if any
    if (retries > 0) {
      this.metrics.retryCount.inc({ agent_name: agentName, operation }, retries);
    }
    
    // Update last execution time
    this.metrics.lastExecutionTime.set({ agent_name: agentName }, Date.now());
  }

  recordFailure(
    agentName: string,
    operation: string,
    errorType: string
  ): void {
    this.metrics.executionFailures.inc({ 
      agent_name: agentName, 
      operation, 
      error_type: errorType 
    });
  }

  recordAgentStart(agentName: string): void {
    this.metrics.activeAgents.inc({ agent_name: agentName });
  }

  recordAgentStop(agentName: string): void {
    this.metrics.activeAgents.dec({ agent_name: agentName });
  }

  async getMetricsString(): Promise<string> {
    return register.metrics();
  }

  reset(): void {
    register.clear();
  }
}