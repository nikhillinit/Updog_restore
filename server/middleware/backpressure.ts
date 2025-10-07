/**
 * Express middleware for backpressure monitoring
 * Prevents server overload by rejecting requests when system resources are constrained
 */
import type { Request, Response, NextFunction } from 'express';
import * as os from 'os';
import * as v8 from 'v8';

interface BackpressureOptions {
  maxEventLoopDelay?: number;      // Maximum event loop delay in ms
  maxHeapUsedRatio?: number;        // Maximum heap usage ratio (0-1)
  maxRssMemory?: number;            // Maximum RSS memory in bytes
  maxCpuUsage?: number;             // Maximum CPU usage ratio (0-1)
  sampleInterval?: number;          // How often to sample metrics (ms)
  healthCheck?: () => Promise<boolean>; // Custom health check function
}

class BackpressureMonitor {
  private eventLoopDelay = 0;
  private lastCheck = Date.now();
  private cpuUsage = process.cpuUsage();
  private options: Required<BackpressureOptions>;
  
  constructor(options: BackpressureOptions = {}) {
    this.options = {
      maxEventLoopDelay: options.maxEventLoopDelay ?? 250,
      maxHeapUsedRatio: options.maxHeapUsedRatio ?? 0.9,
      maxRssMemory: options.maxRssMemory ?? 1.5 * 1024 * 1024 * 1024, // 1.5GB
      maxCpuUsage: options.maxCpuUsage ?? 0.9,
      sampleInterval: options.sampleInterval ?? 1000,
      healthCheck: options.healthCheck ?? (async () => true)
    };
    
    this.startMonitoring();
  }
  
  private startMonitoring() {
    // Monitor event loop delay
    setInterval(() => {
      const start = Date.now();
      setImmediate(() => {
        this.eventLoopDelay = Date.now() - start;
      });
    }, this.options.sampleInterval);
  }
  
  async isUnderPressure(): Promise<{ underPressure: boolean; reason?: string }> {
    // Check event loop delay
    if (this.eventLoopDelay > this.options.maxEventLoopDelay) {
      return { 
        underPressure: true, 
        reason: `Event loop delay too high: ${this.eventLoopDelay}ms` 
      };
    }
    
    // Check heap usage
    const heapStats = v8.getHeapStatistics();
    const heapRatio = heapStats.used_heap_size / heapStats.heap_size_limit;
    if (heapRatio > this.options.maxHeapUsedRatio) {
      return { 
        underPressure: true, 
        reason: `Heap usage too high: ${(heapRatio * 100).toFixed(1)}%` 
      };
    }
    
    // Check RSS memory
    const memUsage = process.memoryUsage();
    if (memUsage.rss > this.options.maxRssMemory) {
      return { 
        underPressure: true, 
        reason: `RSS memory too high: ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB` 
      };
    }
    
    // Check CPU usage
    const cpuPercent = this.getCpuUsagePercent();
    if (cpuPercent > this.options.maxCpuUsage) {
      return { 
        underPressure: true, 
        reason: `CPU usage too high: ${(cpuPercent * 100).toFixed(1)}%` 
      };
    }
    
    // Custom health check
    try {
      const healthy = await this.options.healthCheck();
      if (!healthy) {
        return { underPressure: true, reason: 'Custom health check failed' };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        underPressure: true,
        reason: `Health check error: ${errorMessage}`
      };
    }
    
    return { underPressure: false };
  }
  
  private getCpuUsagePercent(): number {
    const newCpuUsage = process.cpuUsage();
    const now = Date.now();
    const timeDiff = (now - this.lastCheck) * 1000; // Convert to microseconds
    
    const userDiff = newCpuUsage.user - this.cpuUsage.user;
    const systemDiff = newCpuUsage.system - this.cpuUsage.system;
    
    this.cpuUsage = newCpuUsage;
    this.lastCheck = now;
    
    if (timeDiff === 0) return 0;
    
    const cpuPercent = (userDiff + systemDiff) / timeDiff;
    return cpuPercent / os.cpus().length; // Normalize by CPU count
  }
  
  getMetrics() {
    const heapStats = v8.getHeapStatistics();
    const memUsage = process.memoryUsage();
    
    return {
      eventLoopDelay: this.eventLoopDelay,
      heapUsedRatio: heapStats.used_heap_size / heapStats.heap_size_limit,
      rssMemory: memUsage.rss,
      cpuUsage: this.getCpuUsagePercent(),
      loadAverage: os.loadavg()
    };
  }
}

// Singleton instance
let monitor: BackpressureMonitor | null = null;

/**
 * Create Express middleware for backpressure protection
 */
export function createBackpressureMiddleware(options?: BackpressureOptions) {
  if (!monitor) {
    monitor = new BackpressureMonitor(options);
  }
  
  return async (req: Request, res: Response, next: NextFunction) => {
    const { underPressure, reason } = await monitor!.isUnderPressure();
    
    if (underPressure) {
      // Log the pressure event
      console.warn('[Backpressure] Server under pressure:', reason);
      
      // Set retry header
      res['setHeader']('Retry-After', '10');
      
      // Return 503 Service Unavailable
      return res.status(503).json({
        error: 'Service Temporarily Unavailable',
        message: 'Server is under heavy load. Please try again later.',
        reason: process.env['NODE_ENV'] === 'development' ? reason : undefined
      });
    }
    
    next();
  };
}

/**
 * Get current backpressure metrics
 */
export function getBackpressureMetrics() {
  if (!monitor) {
    throw new Error('Backpressure monitor not initialized. Call createBackpressureMiddleware first.');
  }
  return monitor.getMetrics();
}

/**
 * Express route handler for backpressure metrics endpoint
 */
export function backpressureMetricsHandler(req: Request, res: Response) {
  try {
    const metrics = getBackpressureMetrics();
    res.json({
      status: 'ok',
      metrics,
      thresholds: {
        maxEventLoopDelay: 250,
        maxHeapUsedRatio: 0.9,
        maxRssMemory: 1.5 * 1024 * 1024 * 1024,
        maxCpuUsage: 0.9
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Metrics unavailable',
      message: errorMessage
    });
  }
}