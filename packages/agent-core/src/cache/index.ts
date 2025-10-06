/**
 * Cache Infrastructure
 *
 * Two-tier caching system for agent-core with:
 * - L1 (in-memory): Fast, per-instance cache
 * - L2 (Redis): Distributed, cross-instance cache
 *
 * Phase 2 - Issue #2: Redis L2 Cache
 */

// Interfaces
export type {
  CacheAdapter,
  CacheAdapterConfig,
  CacheEntry
} from './CacheAdapter';

export {
  withTimeout,
  sleep
} from './CacheAdapter';

// Adapters
export { UpstashAdapter } from './UpstashAdapter';
export { InMemoryAdapter } from './InMemoryAdapter';

// Utilities
export {
  CircuitBreaker,
  CircuitState,
  type CircuitBreakerConfig
} from './CircuitBreaker';

export {
  CacheKeySchema,
  type CacheKey
} from './KeySchema';
