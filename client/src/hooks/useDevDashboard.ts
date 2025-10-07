import { useState, useEffect, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

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

interface DevDashboardEvent {
  type: 'metrics_update' | 'build_started' | 'build_completed' | 'build_failed' | 'test_started' | 'test_completed' | 'test_failed';
  data: any;
}

interface QuickFixAction {
  id: string;
  label: string;
  icon: string;
  description: string;
  action: () => Promise<void>;
  isRunning: boolean;
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
      const newData = await response.json();
      setData(newData);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Quick fix actions
  const createQuickFixAction = useCallback((
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
      setRunningActions(prev => new Set(prev).add(id));
      setError(null);

      try {
        const response = await fetch(`/api/dev-dashboard/fix/${endpoint}`, {
          method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
          // Refresh data after successful fix
          await fetchHealth();

          // Add success event to realtime feed
          setRealtimeEvents(prev => [
            {
              type: 'build_completed',
              data: {
                timestamp: new Date().toISOString(),
                message: result.message
              }
            },
            ...prev.slice(0, 9) // Keep last 10 events
          ]);
        } else {
          setError(result.message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fix failed');
      } finally {
        setRunningActions(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      }
    }
  }), [runningActions, fetchHealth]);

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
    createQuickFixAction(
      'build',
      'Rebuild',
      'zap',
      'Trigger a fast development build',
      'build'
    )
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
      transports: ['websocket', 'polling']
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to dev dashboard WebSocket');
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from dev dashboard WebSocket');
    });

    socketRef.current.on('dev_dashboard_event', (event: DevDashboardEvent) => {
      console.log('Received dev dashboard event:', event);

      // Add event to realtime feed
      setRealtimeEvents(prev => [event, ...prev.slice(0, 9)]);

      // Update metrics if it's a metrics update
      if (event.type === 'metrics_update') {
        setData({
          timestamp: event.data.timestamp,
          overall: event.data.overall,
          metrics: event.data.metrics
        });
        setLastUpdated(new Date());
      }

      // Handle build events
      if (event.type === 'build_started') {
        setData(prev => prev ? {
          ...prev,
          metrics: {
            ...prev.metrics,
            build: {
              ...prev.metrics.build,
              status: 'building'
            }
          }
        } : null);
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
    refresh: fetchHealth
  };
};