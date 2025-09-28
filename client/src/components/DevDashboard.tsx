import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Terminal,
  Database,
  GitBranch,
  TestTube,
  Zap,
  Activity,
  Wrench,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';

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

const DevDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

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

  const handleQuickFix = async (action: string) => {
    try {
      const response = await fetch(`/api/dev-dashboard/fix/${action}`, {
        method: 'POST'
      });
      const result = await response.json();

      if (result.success) {
        // Refresh data after successful fix
        await fetchHealth();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fix failed');
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passing':
      case 'success':
      case 'healthy':
      case 'connected':
      case 'running':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'failing':
      case 'failed':
      case 'critical':
      case 'offline':
      case 'disconnected':
      case 'stopped':
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'degrading':
        return <TrendingDown className="h-3 w-3 text-red-500" />;
      default:
        return <Minus className="h-3 w-3 text-gray-500" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))  } ${  sizes[i]}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading dashboard...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert className="mx-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error || 'Failed to load dashboard data'}
          <Button
            variant="outline"
            size="sm"
            className="ml-4"
            onClick={fetchHealth}
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Development Dashboard</h1>
          <p className="text-muted-foreground">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Badge
            variant={
              data.overall === 'healthy' ? 'default' :
              data.overall === 'warning' ? 'secondary' : 'destructive'
            }
            className="text-sm px-3 py-1"
          >
            {getStatusIcon(data.overall)}
            <span className="ml-2 capitalize">{data.overall}</span>
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchHealth}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* TypeScript Health */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">TypeScript</CardTitle>
            <div className="flex items-center space-x-1">
              {getTrendIcon(data.metrics.typescript.trend)}
              {getStatusIcon(data.metrics.typescript.errorCount === 0 ? 'success' : 'failed')}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.metrics.typescript.errorCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.metrics.typescript.errorCount === 0 ? 'No errors' : 'Type errors'}
            </p>
            {data.metrics.typescript.errorCount > 0 && (
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickFix('typescript')}
                  className="w-full"
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  Quick Fix
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Suite */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Test Suite</CardTitle>
            <div className="flex items-center space-x-1">
              <TestTube className="h-4 w-4" />
              {getStatusIcon(data.metrics.tests.status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {data.metrics.tests.passCount}
            </div>
            <p className="text-xs text-muted-foreground">
              passing {data.metrics.tests.failCount > 0 && `, ${data.metrics.tests.failCount} failing`}
            </p>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Coverage</span>
                <span>{data.metrics.tests.coverage}%</span>
              </div>
              <Progress value={data.metrics.tests.coverage} className="mt-1" />
            </div>
            {data.metrics.tests.status !== 'passing' && (
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickFix('tests')}
                  className="w-full"
                >
                  <Terminal className="h-4 w-4 mr-2" />
                  Run Tests
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Build Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Build</CardTitle>
            {getStatusIcon(data.metrics.build.status)}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.metrics.build.duration / 1000}s
            </div>
            <p className="text-xs text-muted-foreground">
              last build time
            </p>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span>Client:</span>
                <span>{formatBytes(data.metrics.build.size.client)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Server:</span>
                <span>{formatBytes(data.metrics.build.size.server)}</span>
              </div>
            </div>
            {data.metrics.build.status !== 'success' && (
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickFix('build')}
                  className="w-full"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Rebuild
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monte Carlo Performance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monte Carlo</CardTitle>
            <div className="flex items-center space-x-1">
              <Activity className="h-4 w-4" />
              {getStatusIcon(data.metrics.monteCarlo.status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.metrics.monteCarlo.avgLatency}ms
            </div>
            <p className="text-xs text-muted-foreground">
              avg latency
            </p>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span>Throughput:</span>
                <span>{data.metrics.monteCarlo.throughput}/min</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Error Rate:</span>
                <span>{(data.metrics.monteCarlo.errorRate * 100).toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database</CardTitle>
            <div className="flex items-center space-x-1">
              <Database className="h-4 w-4" />
              {getStatusIcon(data.metrics.database.status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.metrics.database.latency}ms
            </div>
            <p className="text-xs text-muted-foreground">
              connection latency
            </p>
            <div className="mt-2">
              <div className="flex justify-between text-xs">
                <span>Connections:</span>
                <span>{data.metrics.database.connectionCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dev Server */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dev Server</CardTitle>
            {getStatusIcon(data.metrics.devServer.status)}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              :{data.metrics.devServer.port}
            </div>
            <p className="text-xs text-muted-foreground">
              port
            </p>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span>Memory:</span>
                <span>{data.metrics.devServer.memory}MB</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Uptime:</span>
                <span>{formatUptime(data.metrics.devServer.uptime)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Git Status Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <GitBranch className="h-5 w-5 mr-2" />
            Git Status
          </CardTitle>
          <CardDescription>
            Current branch and repository state
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Branch</div>
              <div className="text-lg font-semibold">{data.metrics.git.branch}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Uncommitted Changes</div>
              <div className="text-lg font-semibold">
                {data.metrics.git.uncommittedChanges}
                {data.metrics.git.uncommittedChanges > 0 && (
                  <span className="text-yellow-500 ml-2">⚠</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Last Commit</div>
              <div className="text-sm">
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  {data.metrics.git.lastCommit.hash}
                </code>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {data.metrics.git.lastCommit.message}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TypeScript Errors Detail */}
      {data.metrics.typescript.errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">TypeScript Errors</CardTitle>
            <CardDescription>
              {data.metrics.typescript.errors.length} type error(s) detected
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.metrics.typescript.errors.slice(0, 5).map((error, index) => (
                <div key={index} className="border-l-2 border-red-200 pl-4 py-2">
                  <div className="text-sm font-medium">
                    {error.file}:{error.line}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {error.message}
                  </div>
                </div>
              ))}
              {data.metrics.typescript.errors.length > 5 && (
                <div className="text-sm text-muted-foreground">
                  ... and {data.metrics.typescript.errors.length - 5} more errors
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DevDashboard;