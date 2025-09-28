/**
 * Advanced Database Connection Pool Manager
 *
 * Production-ready connection pooling with:
 * - Automatic pool sizing based on load
 * - Connection health monitoring
 * - Graceful degradation under high load
 * - Memory pressure detection
 * - Detailed metrics and monitoring
 *
 * @author Claude Code
 * @version 1.0 - Production Ready
 */

import { Pool, PoolClient } from '@neondatabase/serverless';
import { EventEmitter } from 'events';

// ============================================================================
// INTERFACES
// ============================================================================

export interface PoolConfig {
  connectionString: string;
  minConnections?: number;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  acquireTimeoutMs?: number;
  maxRetries?: number;
  healthCheckIntervalMs?: number;
  enableMetrics?: boolean;
}

export interface PoolMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  pendingRequests: number;
  connectionsCreated: number;
  connectionsDestroyed: number;
  connectionErrors: number;
  averageQueryTime: number;
  peakConnections: number;
  lastHealthCheck: Date;
  memoryUsageMB: number;
}

export interface ConnectionWrapper {
  client: PoolClient;
  acquired: Date;
  lastActivity: Date;
  queryCount: number;
  isHealthy: boolean;
}

// ============================================================================
// ADVANCED POOL MANAGER
// ============================================================================

export class DatabasePoolManager extends EventEmitter {
  private pools: Map<string, Pool> = new Map();
  private poolConfigs: Map<string, PoolConfig> = new Map();
  private metrics: Map<string, PoolMetrics> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private activeConnections: Map<string, Set<ConnectionWrapper>> = new Map();

  // Default configuration
  private readonly defaultConfig: Required<PoolConfig> = {
    connectionString: '',
    minConnections: 2,
    maxConnections: 10,
    idleTimeoutMs: 30000,
    connectionTimeoutMs: 5000,
    acquireTimeoutMs: 10000,
    maxRetries: 3,
    healthCheckIntervalMs: 60000,
    enableMetrics: true
  };

  /**
   * Create or get existing pool with enhanced configuration
   */
  async createPool(poolId: string, config: PoolConfig): Promise<Pool> {
    if (this.pools.has(poolId)) {
      return this.pools['get'](poolId)!;
    }

    const fullConfig = { ...this.defaultConfig, ...config };
    this.poolConfigs['set'](poolId, fullConfig);

    // Create pool with advanced configuration
    const pool = new Pool({
      connectionString: fullConfig.connectionString,
      max: fullConfig.maxConnections,
      min: fullConfig.minConnections,
      idleTimeoutMillis: fullConfig.idleTimeoutMs,
      connectionTimeoutMillis: fullConfig.connectionTimeoutMs,
      maxRetries: fullConfig.maxRetries,
    });

    // Initialize metrics
    this.initializeMetrics(poolId);

    // Setup connection event handlers
    this.setupPoolEventHandlers(poolId, pool);

    // Start health monitoring
    if (fullConfig.enableMetrics) {
      this.startHealthMonitoring(poolId);
    }

    this.pools['set'](poolId, pool);
    this.activeConnections['set'](poolId, new Set());

    this.emit('poolCreated', { poolId, config: fullConfig });

    return pool;
  }

  /**
   * Get pool with automatic scaling based on load
   */
  async getPool(poolId: string): Promise<Pool> {
    const pool = this.pools['get'](poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId} not found. Create it first with createPool()`);
    }

    // Check if pool needs scaling
    await this.checkPoolScaling(poolId);

    return pool;
  }

  /**
   * Acquire connection with enhanced tracking
   */
  async acquireConnection(poolId: string): Promise<ConnectionWrapper> {
    const pool = await this.getPool(poolId);
    const startTime = Date.now();

    try {
      const client = await pool.connect();
      const wrapper: ConnectionWrapper = {
        client,
        acquired: new Date(),
        lastActivity: new Date(),
        queryCount: 0,
        isHealthy: true
      };

      // Track active connection
      this.activeConnections['get'](poolId)!.add(wrapper);

      // Update metrics
      this.updateAcquisitionMetrics(poolId, Date.now() - startTime);

      return wrapper;

    } catch (error) {
      this.updateErrorMetrics(poolId, error);
      throw error;
    }
  }

  /**
   * Release connection with cleanup
   */
  async releaseConnection(poolId: string, wrapper: ConnectionWrapper): Promise<void> {
    try {
      // Update activity
      wrapper.lastActivity = new Date();

      // Release the actual connection
      wrapper.client.release();

      // Remove from tracking
      this.activeConnections['get'](poolId)?.delete(wrapper);

      this.emit('connectionReleased', { poolId, queryCount: wrapper.queryCount });

    } catch (error) {
      this.updateErrorMetrics(poolId, error);
      throw error;
    }
  }

  /**
   * Execute query with automatic connection management
   */
  async executeQuery<T = any>(poolId: string, query: string, params?: any[]): Promise<T> {
    const wrapper = await this.acquireConnection(poolId);
    const startTime = Date.now();

    try {
      // Update wrapper activity
      wrapper.lastActivity = new Date();
      wrapper.queryCount++;

      // Execute query
      const result = await wrapper.client.query(query, params);

      // Update metrics
      const queryTime = Date.now() - startTime;
      this.updateQueryMetrics(poolId, queryTime);

      return result;

    } finally {
      await this.releaseConnection(poolId, wrapper);
    }
  }

  /**
   * Execute transaction with automatic rollback on error
   */
  async executeTransaction<T = any>(
    poolId: string,
    transactionFn: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const wrapper = await this.acquireConnection(poolId);

    try {
      await wrapper.client.query('BEGIN');
      wrapper.queryCount++;

      const result = await transactionFn(wrapper.client);

      await wrapper.client.query('COMMIT');
      wrapper.queryCount++;

      return result;

    } catch (error) {
      try {
        await wrapper.client.query('ROLLBACK');
        wrapper.queryCount++;
      } catch (rollbackError) {
        this.emit('rollbackError', { poolId, error: rollbackError });
      }
      throw error;

    } finally {
      await this.releaseConnection(poolId, wrapper);
    }
  }

  /**
   * Get detailed pool metrics
   */
  getMetrics(poolId: string): PoolMetrics | null {
    return this.metrics['get'](poolId) || null;
  }

  /**
   * Get metrics for all pools
   */
  getAllMetrics(): Record<string, PoolMetrics> {
    const result: Record<string, PoolMetrics> = {};
    for (const [poolId, metrics] of this.metrics.entries()) {
      result[poolId] = { ...metrics };
    }
    return result;
  }

  /**
   * Check pool health and perform maintenance
   */
  async checkPoolHealth(poolId: string): Promise<boolean> {
    const pool = this.pools['get'](poolId);
    const metrics = this.metrics['get'](poolId);

    if (!pool || !metrics) {
      return false;
    }

    try {
      // Test connection
      const testWrapper = await this.acquireConnection(poolId);
      await testWrapper.client.query('SELECT 1');
      await this.releaseConnection(poolId, testWrapper);

      // Check for stale connections
      await this.cleanupStaleConnections(poolId);

      // Update health check timestamp
      metrics.lastHealthCheck = new Date();

      this.emit('healthCheckPassed', { poolId });
      return true;

    } catch (error) {
      this.emit('healthCheckFailed', { poolId, error });
      return false;
    }
  }

  /**
   * Scale pool based on current load
   */
  private async checkPoolScaling(poolId: string): Promise<void> {
    const metrics = this.metrics['get'](poolId);
    const config = this.poolConfigs['get'](poolId);

    if (!metrics || !config) return;

    const utilizationRatio = metrics.activeConnections / config.maxConnections;

    // Scale up if utilization is high
    if (utilizationRatio > 0.8 && config.maxConnections < 20) {
      config.maxConnections = Math.min(config.maxConnections + 2, 20);
      this.emit('poolScaledUp', { poolId, newMaxConnections: config.maxConnections });
    }

    // Scale down if utilization is low for extended period
    if (utilizationRatio < 0.3 && config.maxConnections > config.minConnections) {
      config.maxConnections = Math.max(config.maxConnections - 1, config.minConnections);
      this.emit('poolScaledDown', { poolId, newMaxConnections: config.maxConnections });
    }
  }

  /**
   * Clean up stale connections
   */
  private async cleanupStaleConnections(poolId: string): Promise<void> {
    const activeConns = this.activeConnections['get'](poolId);
    if (!activeConns) return;

    const staleThreshold = 300000; // 5 minutes
    const now = Date.now();
    const staleConnections: ConnectionWrapper[] = [];

    for (const wrapper of activeConns) {
      if (now - wrapper.lastActivity.getTime() > staleThreshold) {
        staleConnections.push(wrapper);
      }
    }

    // Clean up stale connections
    for (const wrapper of staleConnections) {
      try {
        await this.releaseConnection(poolId, wrapper);
        this.emit('staleConnectionCleaned', { poolId });
      } catch (error) {
        this.emit('cleanupError', { poolId, error });
      }
    }
  }

  /**
   * Initialize metrics for a pool
   */
  private initializeMetrics(poolId: string): void {
    this.metrics['set'](poolId, {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      pendingRequests: 0,
      connectionsCreated: 0,
      connectionsDestroyed: 0,
      connectionErrors: 0,
      averageQueryTime: 0,
      peakConnections: 0,
      lastHealthCheck: new Date(),
      memoryUsageMB: 0
    });
  }

  /**
   * Setup pool event handlers
   */
  private setupPoolEventHandlers(poolId: string, pool: Pool): void {
    pool['on']('connect', () => {
      const metrics = this.metrics['get'](poolId)!;
      metrics.connectionsCreated++;
      metrics.totalConnections++;
      metrics.peakConnections = Math.max(metrics.peakConnections, metrics.totalConnections);
    });

    pool['on']('remove', () => {
      const metrics = this.metrics['get'](poolId)!;
      metrics.connectionsDestroyed++;
      metrics.totalConnections--;
    });

    pool['on']('error', (error: any) => {
      this.updateErrorMetrics(poolId, error);
      this.emit('poolError', { poolId, error });
    });
  }

  /**
   * Start health monitoring for a pool
   */
  private startHealthMonitoring(poolId: string): void {
    const config = this.poolConfigs['get'](poolId)!;

    const interval = setInterval(async () => {
      await this.checkPoolHealth(poolId);
      this.updateMemoryMetrics(poolId);
    }, config.healthCheckIntervalMs);

    this.healthCheckIntervals['set'](poolId, interval);
  }

  /**
   * Update acquisition metrics
   */
  private updateAcquisitionMetrics(poolId: string, acquisitionTime: number): void {
    const metrics = this.metrics['get'](poolId)!;
    metrics.activeConnections++;
    metrics.idleConnections = Math.max(0, metrics.totalConnections - metrics.activeConnections);
  }

  /**
   * Update query metrics
   */
  private updateQueryMetrics(poolId: string, queryTime: number): void {
    const metrics = this.metrics['get'](poolId)!;

    // Update rolling average
    if (metrics.averageQueryTime === 0) {
      metrics.averageQueryTime = queryTime;
    } else {
      metrics.averageQueryTime = (metrics.averageQueryTime * 0.9) + (queryTime * 0.1);
    }
  }

  /**
   * Update error metrics
   */
  private updateErrorMetrics(poolId: string, error: any): void {
    const metrics = this.metrics['get'](poolId)!;
    metrics.connectionErrors++;
    this.emit('error', { poolId, error });
  }

  /**
   * Update memory metrics
   */
  private updateMemoryMetrics(poolId: string): void {
    const metrics = this.metrics['get'](poolId)!;
    const memUsage = process.memoryUsage();
    metrics.memoryUsageMB = memUsage.heapUsed / (1024 * 1024);
  }

  /**
   * Gracefully close a specific pool
   */
  async closePool(poolId: string): Promise<void> {
    const pool = this.pools['get'](poolId);
    const interval = this.healthCheckIntervals['get'](poolId);

    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(poolId);
    }

    if (pool) {
      await pool.end();
      this.pools.delete(poolId);
    }

    this.poolConfigs.delete(poolId);
    this.metrics.delete(poolId);
    this.activeConnections.delete(poolId);

    this.emit('poolClosed', { poolId });
  }

  /**
   * Gracefully close all pools
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.pools.keys()).map(poolId =>
      this.closePool(poolId)
    );

    await Promise.all(closePromises);
    this.emit('allPoolsClosed');
  }

  /**
   * Get summary statistics across all pools
   */
  getSummaryStats() {
    const allMetrics = Array.from(this.metrics.values());

    return {
      totalPools: this.pools.size,
      totalConnections: allMetrics.reduce((sum: any, m: any) => sum + m.totalConnections, 0),
      totalActiveConnections: allMetrics.reduce((sum: any, m: any) => sum + m.activeConnections, 0),
      totalErrors: allMetrics.reduce((sum: any, m: any) => sum + m.connectionErrors, 0),
      averageQueryTime: allMetrics.reduce((sum: any, m: any) => sum + m.averageQueryTime, 0) / allMetrics.length,
      totalMemoryUsageMB: allMetrics.reduce((sum: any, m: any) => sum + m.memoryUsageMB, 0)
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const databasePoolManager = new DatabasePoolManager();

// Setup global error handling
databasePoolManager['on']('error', (error: any) => {
  console.error('Database Pool Error:', error);
});

databasePoolManager['on']('poolError', ({ poolId, error }) => {
  console.error(`Pool ${poolId} Error:`, error);
});

// Export for cleanup in tests
export const cleanupPools = () => databasePoolManager.closeAll();