import { useState, useEffect, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { logger } from '@/lib/logger';

interface DevHealthMetrics {
  typescript: {
    errorCount: number;
    errors: Array<{ file: string; line: number; message: string }>;
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

interface DashboardData {
  timestamp: string;
  overall: 'healthy' | 'warning' | 'critical';
  metrics: DevHealthMetrics;
}

type DashboardOverall = DashboardData['overall'];
type DevDashboardEventType =
  | 'metrics_update'
  | 'build_started'
  | 'build_completed'
  | 'build_failed'
  | 'test_started'
  | 'test_completed'
  | 'test_failed';

interface MetricsUpdateEvent {
  type: 'metrics_update';
  data: {
    timestamp: string;
    overall: DashboardOverall;
    changedMetrics: string[];
    metrics: Partial<Pick<DevHealthMetrics, 'typescript' | 'git' | 'devServer'>>;
    message?: string;
  };
}

interface BuildStatusEvent {
  type: 'build_started' | 'build_completed' | 'build_failed';
  data: {
    timestamp: string;
    duration?: number;
    errors?: string[];
    message?: string;
  };
}

interface TestStatusEvent {
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

type DevDashboardEvent = MetricsUpdateEvent | BuildStatusEvent | TestStatusEvent;

interface QuickFixResponse {
  success: boolean;
  message: string;
}

interface QuickFixAction {
  id: string;
  label: string;
  icon: string;
  description: string;
  action: () => Promise<void>;
  isRunning: boolean;
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null;

const isDashboardOverall = (value: unknown): value is DashboardOverall =>
  value === 'healthy' || value === 'warning' || value === 'critical';

const isDevDashboardEventType = (value: unknown): value is DevDashboardEventType =>
  value === 'metrics_update' ||
  value === 'build_started' ||
  value === 'build_completed' ||
  value === 'build_failed' ||
  value === 'test_started' ||
  value === 'test_completed' ||
  value === 'test_failed';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function parseDashboardData(value: unknown): DashboardData {
  const timestamp = isRecord(value) ? value['timestamp'] : undefined;
  const overall = isRecord(value) ? value['overall'] : undefined;
  const metrics = isRecord(value) ? value['metrics'] : undefined;

  if (
    !isRecord(value) ||
    typeof timestamp !== 'string' ||
    !isDashboardOverall(overall) ||
    !isRecord(metrics)
  ) {
    throw new Error('Invalid dev dashboard response');
  }

  return {
    timestamp,
    overall,
    metrics: metrics as unknown as DevHealthMetrics,
  };
}

function parseQuickFixResponse(value: unknown): QuickFixResponse {
  const success = isRecord(value) ? value['success'] : undefined;
  const message = isRecord(value) ? value['message'] : undefined;

  if (!isRecord(value) || typeof success !== 'boolean' || typeof message !== 'string') {
    throw new Error('Invalid quick fix response');
  }

  return {
    success,
    message,
  };
}

function parseDevDashboardEvent(value: unknown): DevDashboardEvent | null {
  const type = isRecord(value) ? value['type'] : undefined;
  const data = isRecord(value) ? value['data'] : undefined;

  if (!isRecord(value) || !isDevDashboardEventType(type) || !isRecord(data)) {
    return null;
  }

  const timestamp = data['timestamp'];
  if (typeof timestamp !== 'string') {
    return null;
  }

  if (type === 'metrics_update') {
    const overall = data['overall'];
    const metrics = data['metrics'];
    if (!isDashboardOverall(overall) || !isRecord(metrics)) {
      return null;
    }

    const changedMetrics = Array.isArray(data['changedMetrics'])
      ? data['changedMetrics'].filter((metric): metric is string => typeof metric === 'string')
      : [];
    const message = typeof data['message'] === 'string' ? data['message'] : undefined;

    return {
      type,
      data: {
        timestamp,
        overall,
        changedMetrics,
        metrics: metrics as unknown as MetricsUpdateEvent['data']['metrics'],
        ...(message !== undefined ? { message } : {}),
      },
    };
  }

  if (type === 'build_started' || type === 'build_completed' || type === 'build_failed') {
    const duration = typeof data['duration'] === 'number' ? data['duration'] : undefined;
    const errors = isStringArray(data['errors']) ? data['errors'] : undefined;
    const message = typeof data['message'] === 'string' ? data['message'] : undefined;

    return {
      type,
      data: {
        timestamp,
        ...(duration !== undefined ? { duration } : {}),
        ...(errors !== undefined ? { errors } : {}),
        ...(message !== undefined ? { message } : {}),
      },
    };
  }

  const results = data['results'];
  const parsedResults =
    isRecord(results) &&
    typeof results['passed'] === 'number' &&
    typeof results['failed'] === 'number' &&
    typeof results['coverage'] === 'number'
      ? {
          passed: results['passed'],
          failed: results['failed'],
          coverage: results['coverage'],
        }
      : undefined;
  const message = typeof data['message'] === 'string' ? data['message'] : undefined;

  return {
    type,
    data: {
      timestamp,
      ...(parsedResults !== undefined ? { results: parsedResults } : {}),
      ...(message !== undefined ? { message } : {}),
    },
  };
}

export const useDevDashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isConnected, setIsConnected] = useState(false);
  const [realtimeEvents, setRealtimeEvents] = useState<DevDashboardEvent[]>([]);
  const [runningActions, setRunningActions] = useState<Set<string>>(new Set());

  const socketRef = useRef<Socket | null>(null);

  // Fetch initial data from REST API
  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/dev-dashboard/health');
      if (!response.ok) throw new Error('Failed to fetch health data');
      const payload: unknown = await response.json();
      const newData = parseDashboardData(payload);
      setData(newData);
      setError(null);
      setLastUpdated(new Date(newData.timestamp));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Quick fix actions
  const createQuickFixAction = useCallback(
    (
      id: string,
      label: string,
      icon: string,
      description: string,
      endpoint: string
    ): QuickFixAction => ({
      id,
      label,
      icon,
      description,
      isRunning: runningActions.has(id),
      action: async () => {
        setRunningActions((prev) => new Set(prev).add(id));
        setError(null);

        try {
          const response = await fetch(`/api/dev-dashboard/fix/${endpoint}`, {
            method: 'POST',
          });
          const payload: unknown = await response.json();
          const result = parseQuickFixResponse(payload);

          if (result.success) {
            // Refresh data after successful fix
            await fetchHealth();

            // Add success event to realtime feed
            setRealtimeEvents((prev) => [
              {
                type: 'build_completed',
                data: {
                  timestamp: new Date().toISOString(),
                  message: result.message,
                },
              },
              ...prev.slice(0, 9), // Keep last 10 events
            ]);
          } else {
            setError(result.message);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Fix failed');
        } finally {
          setRunningActions((prev) => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
        }
      },
    }),
    [runningActions, fetchHealth]
  );

  const quickFixActions: QuickFixAction[] = [
    createQuickFixAction(
      'typescript',
      'Fix TypeScript',
      'wrench',
      'Run type checking and auto-fix linting issues',
      'typescript'
    ),
    createQuickFixAction(
      'tests',
      'Run Tests',
      'test-tube',
      'Execute the test suite and show results',
      'tests'
    ),
    createQuickFixAction('build', 'Rebuild', 'zap', 'Trigger a fast development build', 'build'),
  ];

  // Trigger build via WebSocket
  const triggerBuild = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('trigger_build');
    }
  }, []);

  // Trigger tests via WebSocket
  const triggerTests = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('trigger_tests');
    }
  }, []);

  // Request immediate metrics update
  const requestMetricsUpdate = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('request_metrics');
    } else {
      fetchHealth();
    }
  }, [fetchHealth]);

  // Setup WebSocket connection for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    socketRef.current = io(wsUrl, {
      path: '/socket.io/dev-dashboard',
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      logger.debug('Connected to dev dashboard WebSocket');
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      logger.debug('Disconnected from dev dashboard WebSocket');
    });

    socketRef.current.on('dev_dashboard_event', (payload: unknown) => {
      const event = parseDevDashboardEvent(payload);
      if (!event) {
        logger.warn('Ignored invalid dev dashboard event payload');
        return;
      }

      logger.debug('Received dev dashboard event', { eventType: event.type });

      // Add event to realtime feed
      setRealtimeEvents((prev) => [event, ...prev.slice(0, 9)]);

      // Update metrics if it's a metrics update
      if (event.type === 'metrics_update') {
        setData((prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            timestamp: event.data.timestamp,
            overall: event.data.overall,
            metrics: {
              ...prev.metrics,
              ...event.data.metrics,
            },
          };
        });
        setLastUpdated(new Date(event.data.timestamp));
      }

      // Handle build events
      if (event.type === 'build_started') {
        setData((prev) =>
          prev
            ? {
                ...prev,
                metrics: {
                  ...prev.metrics,
                  build: {
                    ...prev.metrics.build,
                    status: 'building',
                  },
                },
              }
            : null
        );
      }

      if (event.type === 'build_completed') {
        // Refresh full metrics after build completion
        setTimeout(fetchHealth, 1000);
      }
    });

    // Initial fetch
    fetchHealth();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [fetchHealth]);

  // Periodic fallback refresh (in case WebSocket fails)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isConnected) {
        fetchHealth();
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isConnected, fetchHealth]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    isConnected,
    realtimeEvents,
    quickFixActions,
    triggerBuild,
    triggerTests,
    requestMetricsUpdate,
    refresh: fetchHealth,
  };
};
