/**
 * Intelligent Predictive Cache for Reserves Calculations
 * Uses access patterns to prefetch and optimize cache performance
 */

import { metrics } from '@/metrics/reserves-metrics';
import type { ReservesInput, ReservesConfig, ReservesResult } from '@shared/types/reserves-v11';

interface CacheEntry {
  key: string;
  value: ReservesResult;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
  ttl: number;
}

interface AccessPattern {
  key: string;
  frequency: number;
  relatedKeys: Set<string>;
  avgComputeTime: number;
  lastPattern: string[];
}

interface BatchRequest {
  key: string;
  input: ReservesInput;
  config: ReservesConfig;
  resolver: (_result: ReservesResult) => void;
  rejecter: (_error: Error) => void;
}

export class IntelligentReservesCache {
  private cache = new Map<string, CacheEntry>();
  private accessPatterns = new Map<string, AccessPattern>();
  private batchQueue: BatchRequest[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  // Configuration
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly MIN_TTL = 60 * 1000; // 1 minute
  private readonly MAX_TTL = 10 * 60 * 1000; // 10 minutes
  private readonly BATCH_DELAY = 10; // 10ms
  private readonly BATCH_SIZE = 20;
  private readonly PREFETCH_THRESHOLD = 3; // Prefetch after 3 accesses

  // Pattern detection
  private accessSequence: string[] = [];
  private readonly SEQUENCE_LENGTH = 10;

  constructor() {
    // Periodic cleanup
    globalThis.setInterval(() => this.cleanup(), 60 * 1000);
  }

  async get(
    key: string,
    calculator: (_input: ReservesInput, config: ReservesConfig) => Promise<ReservesResult>,
    input: ReservesInput,
    config: ReservesConfig
  ): Promise<ReservesResult> {
    const startTime = performance.now();

    try {
      // Check cache
      const cached = this.getFromCache(key);
      if (cached) {
        this.recordAccess(key, true);
        metrics.recordCacheHit(key);

        // Trigger predictive prefetch
        this.triggerPrefetch(key, calculator, input, config);

        return cached;
      }

      // Add to batch queue
      const result = await this.addToBatch(key, input, config, calculator);

      this.recordAccess(key, false);
      metrics.recordCacheMiss(key);

      return result;
    } catch (error) {
      metrics.recordError(`Cache error: ${error}`);
      throw error;
    }
  }

  private getFromCache(key: string): ReservesResult | null {
    const entry = this.cache['get'](key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access info
    entry.accessCount++;
    entry.lastAccess = Date.now();

    return entry.value;
  }

  private async addToBatch(
    key: string,
    input: ReservesInput,
    config: ReservesConfig,
    calculator: Function
  ): Promise<ReservesResult> {
    return new Promise((resolve: any, reject: any) => {
      // Add to batch queue
      this.batchQueue.push({
        key,
        input,
        config,
        resolver: resolve,
        rejecter: reject,
      });

      // Schedule batch processing
      if (!this.batchTimer) {
        this.batchTimer = globalThis.setTimeout(() => {
          this.processBatch(calculator);
        }, this.BATCH_DELAY);
      }

      // Process immediately if batch is full
      if (this.batchQueue.length >= this.BATCH_SIZE) {
        if (this.batchTimer) {
          globalThis.clearTimeout(this.batchTimer);
          this.batchTimer = null;
        }
        this.processBatch(calculator);
      }
    });
  }

  private async processBatch(calculator: Function): Promise<void> {
    const batch = this.batchQueue.splice(0, this.BATCH_SIZE);
    this.batchTimer = null;

    if (batch.length === 0) return;

    const startTime = performance.now();

    try {
      // Process batch in parallel
      const promises = batch.map(async (request: any) => {
        try {
          const result = await calculator(request.input, request.config);

          // Cache result
          this['set'](request.key, result, request.input, request.config);

          request.resolver(result);
        } catch (error) {
          request.rejecter(error as Error);
        }
      });

      await Promise.all(promises);

      metrics.recordBatchProcessing(batch.length, performance.now() - startTime);
    } catch (error) {
      console.error('Batch processing error:', error);

      // Reject all pending requests
      batch.forEach((request) => {
        request.rejecter(new Error('Batch processing failed'));
      });
    }

    // Process remaining items if any
    if (this.batchQueue.length > 0) {
      this.batchTimer = globalThis.setTimeout(() => {
        this.processBatch(calculator);
      }, this.BATCH_DELAY);
    }
  }

  private set(
    key: string,
    value: ReservesResult,
    input: ReservesInput,
    config: ReservesConfig
  ): void {
    // Calculate adaptive TTL
    const ttl = this.calculateAdaptiveTTL(key);

    // Store in cache with metadata
    const cacheEntry: CacheEntry = {
      key,
      value,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now(),
      ttl,
    };
    this.cache['set'](key, cacheEntry);

    // Manage cache size
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    // Update access patterns
    this.updateAccessPattern(key, input, config);
  }

  private calculateAdaptiveTTL(key: string): number {
    const pattern = this.accessPatterns['get'](key);

    if (!pattern) {
      return this.MIN_TTL;
    }

    // High frequency items get longer TTL
    if (pattern.frequency > 10) {
      return this.MAX_TTL;
    }

    if (pattern.frequency > 5) {
      return this.MAX_TTL / 2;
    }

    return this.MIN_TTL;
  }

  private evictLRU(): void {
    let lruKey = '';
    let lruTime = Date.now();

    // Find least recently used
    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < lruTime) {
        lruTime = entry.lastAccess;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  private recordAccess(key: string, _isHit: boolean): void {
    // Update access sequence
    this.accessSequence.push(key);
    if (this.accessSequence.length > this.SEQUENCE_LENGTH) {
      this.accessSequence.shift();
    }

    // Update pattern
    const pattern = this.accessPatterns['get'](key) || {
      key,
      frequency: 0,
      relatedKeys: new Set(),
      avgComputeTime: 0,
      lastPattern: [],
    };

    pattern.frequency++;
    pattern.lastPattern = [...this.accessSequence];

    // Find related keys (accessed together)
    this.accessSequence.forEach((k) => {
      if (k !== key) {
        pattern.relatedKeys.add(k);
      }
    });

    this.accessPatterns['set'](key, pattern);
  }

  private updateAccessPattern(key: string, input: ReservesInput, config: ReservesConfig): void {
    const pattern = this.accessPatterns['get'](key) || {
      key,
      frequency: 1,
      relatedKeys: new Set(),
      avgComputeTime: 0,
      lastPattern: [],
    };

    // Identify related calculations (similar inputs)
    for (const [otherKey, otherPattern] of this.accessPatterns) {
      if (otherKey !== key && this.areSimilar(key, otherKey)) {
        pattern.relatedKeys.add(otherKey);
        otherPattern.relatedKeys.add(key);
      }
    }

    this.accessPatterns['set'](key, pattern);
  }

  private areSimilar(key1: string, key2: string): boolean {
    // Simple similarity check based on key structure
    // In production, this would compare actual input parameters
    const parts1 = key1.split(':');
    const parts2 = key2.split(':');

    if (parts1.length !== parts2.length) return false;

    // Check if most parts match (e.g., same fund, different config)
    let matches = 0;
    for (let i = 0; i < parts1.length; i++) {
      if (parts1[i] === parts2[i]) matches++;
    }

    return matches >= parts1.length - 1;
  }

  private async triggerPrefetch(
    key: string,
    calculator: Function,
    baseInput: ReservesInput,
    baseConfig: ReservesConfig
  ): Promise<void> {
    const pattern = this.accessPatterns['get'](key);

    if (!pattern || pattern.frequency < this.PREFETCH_THRESHOLD) {
      return;
    }

    // Identify keys to prefetch
    const toPrefetch: string[] = [];

    // 1. Related keys that aren't cached
    for (const relatedKey of pattern.relatedKeys) {
      if (!this.cache.has(relatedKey) && toPrefetch.length < 5) {
        toPrefetch.push(relatedKey);
      }
    }

    // 2. Predicted next keys based on sequence
    const predicted = this.predictNextKeys(key);
    for (const predictedKey of predicted) {
      if (!this.cache.has(predictedKey) && toPrefetch.length < 5) {
        toPrefetch.push(predictedKey);
      }
    }

    if (toPrefetch.length === 0) return;

    // Prefetch in background
    setTimeout(async () => {
      if (import.meta.env.DEV) console.log(`Prefetching ${toPrefetch.length} related calculations`);

      for (const prefetchKey of toPrefetch) {
        try {
          // Generate variations of input for prefetch
          const variations = this.generateInputVariations(baseInput, baseConfig);

          for (const [varInput, varConfig] of variations) {
            const result = await calculator(varInput, varConfig);
            const varKey = this.generateKey(varInput, varConfig);
            this['set'](varKey, result, varInput, varConfig);
          }
        } catch (error) {
          console.debug('Prefetch error:', error);
        }
      }
    }, 0);
  }

  private predictNextKeys(currentKey: string): string[] {
    const predictions: string[] = [];

    // Look for patterns in access sequence
    for (let i = 0; i < this.accessSequence.length - 1; i++) {
      if (this.accessSequence[i] === currentKey) {
        const nextKey = this.accessSequence[i + 1];
        if (nextKey && !predictions.includes(nextKey)) {
          predictions.push(nextKey);
        }
      }
    }

    return predictions.slice(0, 3); // Top 3 predictions
  }

  private generateInputVariations(
    input: ReservesInput,
    config: ReservesConfig
  ): Array<[ReservesInput, ReservesConfig]> {
    const variations: Array<[ReservesInput, ReservesConfig]> = [];

    // Common variations to prefetch
    const reserveVariations = [
      config.reserve_bps - 100, // 1% less
      config.reserve_bps + 100, // 1% more
    ];

    for (const reserve_bps of reserveVariations) {
      if (reserve_bps >= 0 && reserve_bps <= 10000) {
        variations.push([input, { ...config, reserve_bps }]);
      }
    }

    // Toggle remain pass
    variations.push([input, { ...config, remain_passes: config.remain_passes === 0 ? 1 : 0 }]);

    return variations.slice(0, 3); // Limit prefetch
  }

  private generateKey(input: ReservesInput, config: ReservesConfig): string {
    // Generate stable cache key
    const parts = [
      'reserves',
      input.companies.length,
      input.fund_size_cents,
      config.reserve_bps,
      config.remain_passes,
      config.cap_policy.kind,
    ];

    return parts.join(':');
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    // Remove expired entries
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        toDelete.push(key);
      }
    }

    toDelete.forEach((key) => this.cache.delete(key));

    // Clean up old patterns
    for (const [key, pattern] of this.accessPatterns) {
      if (pattern.frequency === 0 && !this.cache.has(key)) {
        this.accessPatterns.delete(key);
      }
    }
  }

  // Analytics methods
  getCacheStats() {
    const stats = {
      size: this.cache.size,
      patterns: this.accessPatterns.size,
      avgFrequency: 0,
      avgTTL: 0,
      hitRate: 0,
    };

    if (this.accessPatterns.size > 0) {
      let totalFreq = 0;
      for (const pattern of this.accessPatterns.values()) {
        totalFreq += pattern.frequency;
      }
      stats.avgFrequency = totalFreq / this.accessPatterns.size;
    }

    if (this.cache.size > 0) {
      let totalTTL = 0;
      for (const entry of this.cache.values()) {
        totalTTL += entry.ttl;
      }
      stats.avgTTL = totalTTL / this.cache.size;
    }

    return stats;
  }

  clearCache(): void {
    this.cache.clear();
    this.accessPatterns.clear();
    this.accessSequence = [];
  }
}

// Export singleton
export const predictiveCache = new IntelligentReservesCache();
