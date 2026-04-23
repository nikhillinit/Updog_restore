export interface TypeScriptErrorMetric {
  file: string;
  line: number;
  message: string;
}

export interface DevHealthMetrics {
  typescript: {
    errorCount: number;
    errors: TypeScriptErrorMetric[];
    trend: 'improving' | 'stable' | 'degrading';
  };
  tests: {
    status: 'passing' | 'failing' | 'unknown';
    passCount: number;
    failCount: number;
    coverage: number;
    performance: {
      avgDuration: number;
      slowTests: Array<{ name: string; duration: number }>;
    };
  };
  build: {
    status: 'success' | 'failed' | 'building';
    duration: number;
    size: {
      client: number;
      server: number;
    };
    warnings: number;
  };
  monteCarlo: {
    status: 'healthy' | 'degraded' | 'offline';
    avgLatency: number;
    throughput: number;
    errorRate: number;
  };
  database: {
    status: 'connected' | 'disconnected' | 'degraded';
    latency: number;
    connectionCount: number;
  };
  devServer: {
    status: 'running' | 'stopped' | 'error';
    port: number;
    memory: number;
    uptime: number;
  };
  git: {
    branch: string;
    uncommittedChanges: number;
    lastCommit: {
      hash: string;
      message: string;
      timestamp: string;
    };
  };
}

export type DashboardOverall = 'healthy' | 'warning' | 'critical';

export interface DashboardData {
  timestamp: string;
  overall: DashboardOverall;
  metrics: DevHealthMetrics;
}

export interface DevDashboardQuickFixResponse {
  success: boolean;
  message: string;
}

export type DevDashboardEventType =
  | 'metrics_update'
  | 'build_started'
  | 'build_completed'
  | 'build_failed'
  | 'test_started'
  | 'test_completed'
  | 'test_failed';

export interface DevDashboardRealtimeMetrics {
  typescript: DevHealthMetrics['typescript'];
  git: Pick<DevHealthMetrics['git'], 'uncommittedChanges'>;
  devServer: Pick<DevHealthMetrics['devServer'], 'status' | 'memory' | 'uptime'>;
}

export interface MetricsUpdateEvent {
  type: 'metrics_update';
  data: {
    timestamp: string;
    overall: DashboardOverall;
    changedMetrics: string[];
    metrics: Partial<DevDashboardRealtimeMetrics>;
    message?: string;
  };
}

export interface BuildStatusEvent {
  type: 'build_started' | 'build_completed' | 'build_failed';
  data: {
    timestamp: string;
    duration?: number;
    errors?: string[];
    message?: string;
  };
}

export interface TestStatusEvent {
  type: 'test_started' | 'test_completed' | 'test_failed';
  data: {
    timestamp: string;
    results?: {
      passed: number;
      failed: number;
      coverage: number;
    };
    message?: string;
  };
}

export type DevDashboardEvent = MetricsUpdateEvent | BuildStatusEvent | TestStatusEvent;
