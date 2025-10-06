/**
 * Cache Adapter Interface
 *
 * Abstraction layer for pluggable L2 cache backends.
 * Supports Upstash (HTTP), ioredis (socket), and in-memory (testing).
 *
 * Phase 2 - Issue #2: Redis L2 Cache
 */

/**
 * Configuration for cache adapters
 */
export interface CacheAdapterConfig {
  /**
   * Connection URL (redis://, rediss://, or HTTP endpoint)
   */
  url: string;

  /**
   * Authentication token (for Upstash)
   */
  token?: string;

  /**
   * Maximum retry attempts
   */
  maxRetries?: number;

  /**
   * Operation timeout in milliseconds
   */
  timeoutMs?: number;

  /**
   * Enable circuit breaker for fault tolerance
   */
  enableCircuitBreaker?: boolean;

  /**
   * Circuit breaker threshold (failures before trip)
   */
  circuitBreakerThreshold?: number;
}

/**
 * Cache entry for batch operations
 */
export interface CacheEntry<T> {
  key: string;
  value: T;
  ttlSec: number;
}

/**
 * Cache adapter interface
 *
 * All methods should be fault-tolerant and not throw on errors.
 * Failed operations return null or empty results.
 */
export interface CacheAdapter {
  /**
   * Get value by key
   *
   * @param key - Cache key
   * @returns Deserialized value or null if not found/error
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Get multiple values by keys (batch operation)
   *
   * @param keys - Array of cache keys
   * @returns Array of values (null for missing/error)
   */
  mget<T>(keys: string[]): Promise<(T | null)[]>;

  /**
   * Set value with TTL
   *
   * @param key - Cache key
   * @param value - Value to cache (will be serialized)
   * @param ttlSec - Time-to-live in seconds
   */
  set<T>(key: string, value: T, ttlSec: number): Promise<void>;

  /**
   * Set multiple values (batch operation)
   *
   * @param entries - Array of key/value/TTL entries
   */
  mset<T>(entries: CacheEntry<T>[]): Promise<void>;

  /**
   * Delete one or more keys
   *
   * @param keys - Single key or array of keys
   * @returns Number of keys deleted (0 if error)
   */
  del(keys: string | string[]): Promise<number>;

  /**
   * Get remaining TTL for key
   *
   * @param key - Cache key
   * @returns TTL in seconds, null if key doesn't exist or error
   */
  ttl(key: string): Promise<number | null>;

  /**
   * Add key to a set (for tag indexing)
   *
   * @param setKey - Set key
   * @param member - Value to add
   */
  sadd(setKey: string, member: string): Promise<void>;

  /**
   * Get all members of a set
   *
   * @param setKey - Set key
   * @returns Array of members (empty if not found/error)
   */
  smembers(setKey: string): Promise<string[]>;

  /**
   * Check if adapter is healthy
   *
   * @returns True if responsive
   */
  ping(): Promise<boolean>;

  /**
   * Gracefully disconnect (optional)
   */
  disconnect?(): Promise<void>;

  /**
   * Get adapter name (for logging/debugging)
   */
  getName(): string;

  /**
   * Check if circuit breaker is open
   */
  isCircuitOpen(): boolean;
}

/**
 * Time-budgeted operation helper
 *
 * Wraps a promise with a timeout, returning fallback value on timeout.
 *
 * @param promise - Operation to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param fallback - Value to return on timeout
 * @returns Promise result or fallback
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))
  ]);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
