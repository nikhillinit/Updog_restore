/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/**
 * Bounded Memory Cache with LRU Eviction and TTL Enforcement
 * Prevents memory exhaustion and provides observability
 */

import type { Cache } from './index.js';

interface CacheEntry {
  value: string;
  expires: number;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
  maxSize: number;
}

export class BoundedMemoryCache implements Cache {
  private data = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private cleanupInterval: NodeJS.Timeout;
  private metrics: CacheMetrics;

  constructor(options: { maxSize?: number; defaultTTL?: number; cleanupInterval?: number } = {}) {
    this.maxSize = options.maxSize ?? Number(process.env['CACHE_MAX_KEYS'] ?? 5000);
    this.defaultTTL = options.defaultTTL ?? 300; // 5 minutes default
    
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0,
      maxSize: this.maxSize
    };

    // Clean up expired entries periodically
    const interval = options.cleanupInterval ?? 60000; // 1 minute
    this.cleanupInterval = setInterval(() => this.cleanup(), interval);
    
    console.log(`[cache] Bounded memory cache initialized (max: ${this.maxSize} keys, TTL: ${this.defaultTTL}s)`);
  }

  async get(key: string): Promise<string | null> {
    const entry = this.data['get'](key);
    
    if (!entry) {
      this.metrics.misses++;
      return null;
    }
    
    // Check expiration
    if (entry.expires && Date.now() > entry.expires) {
      this.data.delete(key);
      this.metrics.misses++;
      this.updateSize();
      return null;
    }
    
    // LRU: Move to end (most recently used)
    this.data.delete(key);
    this.data['set'](key, entry);
    
    this.metrics.hits++;
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number = this.defaultTTL): Promise<void> {
    const expires = Date.now() + (ttlSeconds * 1000);
    
    // Evict LRU entry if at capacity
    if (this.data.size >= this.maxSize && !this.data.has(key)) {
      const firstKey = this.data.keys().next().value;
      if (firstKey) {
        this.data.delete(firstKey);
        this.metrics.evictions++;
      }
    }
    
    this.data['set'](key, { value, expires });
    this.metrics.sets++;
    this.updateSize();
  }

  async del(key: string): Promise<void> {
    const deleted = this.data.delete(key);
    if (deleted) {
      this.metrics.deletes++;
      this.updateSize();
    }
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupInterval);
    this.data.clear();
    this.updateSize();
    console.log('[cache] Memory cache closed');
  }

  // Observability
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  getHitRate(): number {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? this.metrics.hits / total : 0;
  }

  // Cleanup expired entries
  private cleanup(): void {
    const before = this.data.size;
    const now = Date.now();
    
    for (const [key, entry] of this.data.entries()) {
      if (entry.expires && now > entry.expires) {
        this.data.delete(key);
      }
    }
    
    const cleaned = before - this.data.size;
    if (cleaned > 0) {
      this.updateSize();
      console.log(`[cache] Cleaned ${cleaned} expired entries (${this.data.size}/${this.maxSize} remaining)`);
    }
  }

  private updateSize(): void {
    this.metrics.size = this.data.size;
  }

  // Health check for monitoring
  isHealthy(): boolean {
    return this.data.size < this.maxSize * 0.9; // Warn at 90% capacity
  }

  // Emit metrics for Prometheus (if available)
  emitMetrics(): void {
    try {
      // This could be wired to prom-client if available
      console.log(`[cache] Metrics - Hits: ${this.metrics.hits}, Misses: ${this.metrics.misses}, Hit Rate: ${(this.getHitRate() * 100).toFixed(1)}%, Size: ${this.metrics.size}/${this.maxSize}`);
    } catch (error) {
      // Silently ignore if metrics collection fails
    }
  }
}
