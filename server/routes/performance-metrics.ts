/**
 * Performance Metrics API Endpoints
 *
 * Provides real-time access to performance data for development dashboard
 * and monitoring systems.
 */

import { Router, Request, Response } from 'express';
import { monitor, monteCarloTracker } from '../middleware/performance-monitor.js';

const router = Router();

/**
 * GET /api/performance/summary
 * Get overall performance summary
 */
router.get('/summary', (req: Request, res: Response) => {
  try {
    const timeWindow = parseInt(req.query["window"] as string) || (60 * 60 * 1000); // Default 1 hour
    const metrics = monitor.exportMetrics();

    const summary = {
      timestamp: Date.now(),
      timeWindow,
      operations: metrics.summary,
      alerts: {
        recent: metrics.alerts.length,
        critical: metrics.alerts.filter(a => a.severity === 'critical').length,
        slow: metrics.alerts.filter(a => a.severity === 'slow').length
      },
      health: {
        overall: metrics.alerts.filter(a => a.severity === 'critical').length === 0 ? 'healthy' : 'degraded',
        monteCarloPerformance: metrics.summary['monte_carlo_simulation']?.avgDuration || 0,
        apiPerformance: Object.entries(metrics.summary)
          .filter(([key]) => key.startsWith('GET ') || key.startsWith('POST '))
          .reduce((avg, [, stats]: any) => avg + stats.avgDuration, 0) / Math.max(1, Object.keys(metrics.summary).length)
      }
    };

    res.json(summary);
  } catch (error) {
    console.error('Error getting performance summary:', error);
    res.status(500).json({ error: 'Failed to get performance summary' });
  }
});

/**
 * GET /api/performance/monte-carlo
 * Get Monte Carlo specific performance metrics
 */
router.get('/monte-carlo', (req: Request, res: Response) => {
  try {
    const timeWindow = parseInt(req.query["window"] as string) || (60 * 60 * 1000);
    const stats = monitor.getStats('monte_carlo_simulation', timeWindow);

    const monteCarloMetrics = {
      timestamp: Date.now(),
      timeWindow,
      simulations: {
        total: stats.count,
        avgDuration: Math.round(stats.avgDuration),
        minDuration: Math.round(stats.minDuration),
        maxDuration: Math.round(stats.maxDuration),
        p95Duration: Math.round(stats.p95Duration),
        performance: {
          fast: stats.count - stats.slowCount - stats.criticalCount,
          slow: stats.slowCount,
          critical: stats.criticalCount
        }
      },
      throughput: {
        simulationsPerHour: stats.count * (3600000 / timeWindow),
        avgSimulationsPerMinute: stats.count / (timeWindow / 60000)
      },
      health: stats.criticalCount === 0 ? 'healthy' : 'degraded'
    };

    res.json(monteCarloMetrics);
  } catch (error) {
    console.error('Error getting Monte Carlo metrics:', error);
    res.status(500).json({ error: 'Failed to get Monte Carlo metrics' });
  }
});

/**
 * GET /api/performance/alerts
 * Get recent performance alerts
 */
router.get('/alerts', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query["limit"] as string) || 50;
    const alerts = monitor.getRecentAlerts(limit);

    const formattedAlerts = alerts.map(alert => ({
      id: `${alert.operation}_${alert.timestamp}`,
      operation: alert.operation,
      duration: Math.round(alert.duration),
      severity: alert.severity,
      timestamp: alert.timestamp,
      category: alert.category,
      metadata: alert.metadata,
      timeAgo: Date.now() - alert.timestamp
    }));

    res.json({
      alerts: formattedAlerts,
      summary: {
        total: formattedAlerts.length,
        critical: formattedAlerts.filter(a => a.severity === 'critical').length,
        slow: formattedAlerts.filter(a => a.severity === 'slow').length
      }
    });
  } catch (error) {
    console.error('Error getting performance alerts:', error);
    res.status(500).json({ error: 'Failed to get performance alerts' });
  }
});

/**
 * GET /api/performance/realtime
 * Get real-time performance stream (SSE)
 */
router.get('/realtime', (req: Request, res: Response) => {
  // Set up Server-Sent Events
  res["writeHead"](200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  const sendMetric = (metric: any) => {
    const data = JSON.stringify({
      type: 'metric',
      data: {
        operation: metric.operation,
        duration: Math.round(metric.duration),
        severity: metric.severity,
        category: metric.category,
        timestamp: metric.timestamp
      }
    });

    res["write"](`data: ${data}\n\n`);
  };

  const sendAlert = (alert: any) => {
    const data = JSON.stringify({
      type: 'alert',
      data: {
        operation: alert.operation,
        duration: Math.round(alert.duration),
        severity: alert.severity,
        category: alert.category,
        timestamp: alert.timestamp
      }
    });

    res["write"](`data: ${data}\n\n`);
  };

  // Listen for new metrics and alerts
  monitor.on('metric_recorded', sendMetric);
  monitor.on('performance_alert', sendAlert);

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res["write"](`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
  }, 30000);

  // Clean up on disconnect
  req["on"]('close', () => {
    monitor.removeListener('metric_recorded', sendMetric);
    monitor.removeListener('performance_alert', sendAlert);
    clearInterval(heartbeat);
  });
});

/**
 * GET /api/performance/operations
 * Get performance stats for all operations
 */
router.get('/operations', (req: Request, res: Response) => {
  try {
    const timeWindow = parseInt(req.query["window"] as string) || (60 * 60 * 1000);
    const category = req.query["category"] as string;

    const metrics = monitor.exportMetrics();
    let operations = Object.entries(metrics.summary);

    // Filter by category if specified
    if (category) {
      const recentMetrics = metrics.recentMetrics
        .filter(m => m.category === category)
        .slice(-1000); // Last 1000 metrics

      const operationNames = [...new Set(recentMetrics.map(m => m.operation))];
      operations = operations.filter(([opName]) => operationNames.includes(opName));
    }

    const formattedOperations = operations.map(([operation, stats]: any) => ({
      operation,
      stats: {
        count: stats.count,
        avgDuration: Math.round(stats.avgDuration),
        minDuration: Math.round(stats.minDuration),
        maxDuration: Math.round(stats.maxDuration),
        p95Duration: Math.round(stats.p95Duration),
        slowCount: stats.slowCount,
        criticalCount: stats.criticalCount
      },
      health: stats.criticalCount === 0 ? (stats.slowCount === 0 ? 'healthy' : 'slow') : 'critical'
    }));

    // Sort by average duration (slowest first)
    formattedOperations.sort((a, b) => b.stats.avgDuration - a.stats.avgDuration);

    res.json({
      operations: formattedOperations,
      timestamp: Date.now(),
      timeWindow,
      category: category || 'all'
    });
  } catch (error) {
    console.error('Error getting operations metrics:', error);
    res.status(500).json({ error: 'Failed to get operations metrics' });
  }
});

/**
 * POST /api/performance/simulate
 * Trigger a test Monte Carlo simulation for performance testing
 */
router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const { runs = 100, fundId = 1 } = req.body;

    // Start performance tracking
    const simulationId = `test_${Date.now()}`;
    monteCarloTracker.startSimulation(simulationId, { runs, fundId });

    // Simulate some work (replace with actual Monte Carlo call)
    const timer = monitor.createTimer('test_simulation', 'monte_carlo');

    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500)); // 0.5-2.5s

    const duration = timer.end({ runs, fundId, test: true });

    monteCarloTracker.endSimulation(simulationId, { scenarios: new Array(runs) });

    res.json({
      simulationId,
      duration: Math.round(duration),
      runs,
      success: true,
      message: 'Test simulation completed'
    });
  } catch (error) {
    console.error('Error running test simulation:', error);
    res.status(500).json({ error: 'Failed to run test simulation' });
  }
});

export default router;