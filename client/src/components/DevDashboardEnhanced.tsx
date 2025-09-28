import React, { useState } from 'react';
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
  Minus,
  Wifi,
  WifiOff,
  Play,
  Settings,
  Clock
} from 'lucide-react';
import { useDevDashboard } from '@/hooks/useDevDashboard';

const DevDashboardEnhanced: React.FC = () => {
  const {
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
    refresh
  } = useDevDashboard();

  const [showRealtimeFeed, setShowRealtimeFeed] = useState(false);

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
      case 'building':
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

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'build_started':
      case 'build_completed':
      case 'build_failed':
        return <Zap className="h-4 w-4" />;
      case 'test_started':
      case 'test_completed':
      case 'test_failed':
        return <TestTube className="h-4 w-4" />;
      case 'metrics_update':
        return <Activity className="h-4 w-4" />;
      default:
        return <Settings className="h-4 w-4" />;
    }
  };

  const getEventColor = (eventType: string) => {
    if (eventType.includes('failed')) return 'text-red-500';
    if (eventType.includes('completed')) return 'text-green-500';
    if (eventType.includes('started')) return 'text-yellow-500';
    return 'text-blue-500';
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
            onClick={refresh}
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
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
            <div className="flex items-center space-x-1">
              {isConnected ? (
                <>
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span>Real-time connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <span>Polling mode</span>
                </>
              )}
            </div>
          </div>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRealtimeFeed(!showRealtimeFeed)}
          >
            <Activity className="h-4 w-4 mr-2" />
            Events ({realtimeEvents.length})
          </Button>
          <Button variant="outline" size="sm" onClick={requestMetricsUpdate}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Real-time Events Feed */}
      {showRealtimeFeed && realtimeEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              Real-time Events
            </CardTitle>
            <CardDescription>
              Live updates from the development environment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {realtimeEvents.map((event, index) => (
                <div key={index} className="flex items-center space-x-3 text-sm p-2 border rounded">
                  <div className={getEventColor(event.type)}>
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium capitalize">
                      {event.type.replace('_', ' ')}
                    </span>
                    {event.data.message && (
                      <span className="ml-2 text-muted-foreground">
                        {event.data.message}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(event.data.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Play className="h-5 w-5 mr-2" />
            Quick Actions
          </CardTitle>
          <CardDescription>
            Common development tasks with one-click execution
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickFixActions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                className="h-auto p-4 flex flex-col items-start space-y-2"
                onClick={action.action}
                disabled={action.isRunning}
              >
                <div className="flex items-center space-x-2 w-full">
                  {action.isRunning ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wrench className="h-4 w-4" />
                  )}
                  <span className="font-medium">{action.label}</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  {action.description}
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

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
                  onClick={() => quickFixActions.find(a => a.id === 'typescript')?.action()}
                  disabled={quickFixActions.find(a => a.id === 'typescript')?.isRunning}
                  className="w-full"
                >
                  {quickFixActions.find(a => a.id === 'typescript')?.isRunning ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Wrench className="h-4 w-4 mr-2" />
                  )}
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
            <div className="mt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={triggerTests}
                className="w-full"
              >
                <Terminal className="h-4 w-4 mr-2" />
                Run Tests
              </Button>
            </div>
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
              {data.metrics.build.status === 'building' ? (
                <div className="flex items-center">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Building...
                </div>
              ) : (
                `${data.metrics.build.duration / 1000}s`
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.metrics.build.status === 'building' ? 'Build in progress' : 'last build time'}
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
            <div className="mt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={triggerBuild}
                disabled={data.metrics.build.status === 'building'}
                className="w-full"
              >
                {data.metrics.build.status === 'building' ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                {data.metrics.build.status === 'building' ? 'Building...' : 'Rebuild'}
              </Button>
            </div>
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

export default DevDashboardEnhanced;