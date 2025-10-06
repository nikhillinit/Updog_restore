/**
 * Versioned Cache Key Schema
 *
 * Provides structured, namespaced keys for cache entries with:
 * - Environment isolation (dev/staging/prod)
 * - Schema versioning (instant purge via version bump)
 * - Tag indexing (bulk invalidation)
 * - Multi-tenancy support
 *
 * Key Pattern:
 * app:{env}:conv:{model}:{tenantId}:{threadId}:v{version}
 *
 * Example:
 * app:prod:conv:gpt4:povc:uuid-123:v1
 *
 * Phase 2 - Issue #2: Redis L2 Cache
 */

export interface CacheKey {
  /**
   * Fully-qualified cache key
   */
  key: string;

  /**
   * Tag keys for bulk invalidation
   */
  tags: string[];
}

/**
 * Cache key schema builder
 *
 * Usage:
 * ```typescript
 * const { key, tags } = CacheKeySchema.conversation('thread-123', 'tenant-1');
 * // key: "app:prod:conv:gpt4:tenant-1:thread-123:v1"
 * // tags: ["tag:conv:tenant-1:gpt4", "tag:thread:thread-123"]
 *
 * // Invalidate all conversations for tenant
 * await cache.invalidateByTag(CacheKeySchema.tenantTag('tenant-1'));
 * ```
 */
export class CacheKeySchema {
  /**
   * Current schema version
   *
   * Bump this to invalidate ALL cached entries instantly.
   * Used when conversation structure changes incompatibly.
   */
  private static VERSION = 1;

  /**
   * Application prefix (for multi-app deployments)
   */
  private static APP_PREFIX = 'app';

  /**
   * Get current environment
   */
  private static getEnv(): string {
    return process.env.NODE_ENV === 'production' ? 'prod'
      : process.env.NODE_ENV === 'staging' ? 'staging'
      : 'dev';
  }

  /**
   * Build conversation cache key
   *
   * @param threadId - Thread UUID
   * @param tenantId - Tenant ID (default: 'default')
   * @param model - Model name (default: 'gpt4')
   * @returns Fully-qualified key with tags
   */
  static conversation(
    threadId: string,
    tenantId: string = 'default',
    model: string = 'gpt4'
  ): CacheKey {
    const env = this.getEnv();

    const key = `${this.APP_PREFIX}:${env}:conv:${model}:${tenantId}:${threadId}:v${this.VERSION}`;

    const tags = [
      `tag:conv:${tenantId}:${model}`,  // All conversations for tenant+model
      `tag:thread:${threadId}`,          // Specific thread
    ];

    return { key, tags };
  }

  /**
   * Build tag key for tenant+model combinations
   *
   * Use for bulk invalidation of all conversations for a tenant.
   *
   * @param tenantId - Tenant ID
   * @param model - Model name (default: 'gpt4')
   * @returns Tag key
   */
  static tenantTag(tenantId: string, model: string = 'gpt4'): string {
    return `tag:conv:${tenantId}:${model}`;
  }

  /**
   * Build tag key for specific thread
   *
   * Use for invalidating a specific conversation thread.
   *
   * @param threadId - Thread UUID
   * @returns Tag key
   */
  static threadTag(threadId: string): string {
    return `tag:thread:${threadId}`;
  }

  /**
   * Build lock key for distributed locking
   *
   * @param cacheKey - Cache key to lock
   * @returns Lock key
   */
  static lockKey(cacheKey: string): string {
    return `lock:${cacheKey}`;
  }

  /**
   * Bump schema version (invalidates ALL cached entries)
   *
   * WARNING: Use sparingly. This invalidates the entire cache.
   *
   * Use cases:
   * - Conversation structure changed incompatibly
   * - Corrupted cache data
   * - Emergency purge
   */
  static bumpVersion(): void {
    this.VERSION++;
    console.warn(`[CacheKeySchema] Schema version bumped to v${this.VERSION}`);
  }

  /**
   * Get current schema version
   */
  static getVersion(): number {
    return this.VERSION;
  }

  /**
   * Parse cache key into components
   *
   * @param key - Fully-qualified cache key
   * @returns Parsed components or null if invalid
   */
  static parse(key: string): {
    app: string;
    env: string;
    type: string;
    model: string;
    tenantId: string;
    threadId: string;
    version: number;
  } | null {
    const pattern = /^(\w+):(\w+):(\w+):(\w+):([^:]+):([^:]+):v(\d+)$/;
    const match = key.match(pattern);

    if (!match) return null;

    return {
      app: match[1],
      env: match[2],
      type: match[3],
      model: match[4],
      tenantId: match[5],
      threadId: match[6],
      version: parseInt(match[7], 10),
    };
  }

  /**
   * Add TTL jitter to prevent synchronized expirations
   *
   * Randomizes TTL ±10% to avoid cache stampede on expiration.
   *
   * @param ttlSec - Base TTL in seconds
   * @returns Jittered TTL in seconds
   */
  static addTTLJitter(ttlSec: number): number {
    const jitterRange = ttlSec * 0.1; // ±10%
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.floor(ttlSec + jitter);
  }
}
