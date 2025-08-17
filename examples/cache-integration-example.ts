/**
 * Example: Integrating circuit breaker into existing cache layer
 * 
 * This shows how to replace your current cache implementation with
 * a circuit breaker-protected version that automatically falls back
 * to memory cache when Redis fails.
 */

import { CacheBreakerService } from '../server/infra/circuit-breaker/cache-breaker';
import { breakerRegistry } from '../server/infra/circuit-breaker/breaker-registry';
import { buildCache } from '../server/cache/index';

// Example: Enhanced cache service with circuit breaker protection
export async function createProtectedCacheService(): Promise<CacheBreakerService> {
  // Build your existing cache (Redis with memory fallback)
  const primaryCache = await buildCache();
  
  // Wrap it with circuit breaker protection
  const protectedCache = new CacheBreakerService(primaryCache);
  
  // Register for monitoring and admin access
  breakerRegistry.register('cache-primary', protectedCache);
  
  return protectedCache;
}

// Example: Portfolio service using protected cache
export class PortfolioService {
  constructor(private cache: CacheBreakerService) {}

  async getPortfolio(id: string) {
    const key = `portfolio:${id}`;
    
    // Try to get from cache first (with circuit breaker protection)
    const cached = await this.cache.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // Simulate database/computation fallback
    const portfolio = await this.computePortfolio(id);
    
    // Cache the result (with circuit breaker protection)
    await this.cache.set(key, JSON.stringify(portfolio), 300); // 5 min TTL
    
    return portfolio;
  }

  private async computePortfolio(id: string) {
    // Simulate heavy computation or database query
    return {
      id,
      name: `Portfolio ${id}`,
      value: Math.random() * 1000000,
      updatedAt: new Date().toISOString()
    };
  }
}

// Example: How to integrate into your providers.ts
export async function enhanceProviders() {
  const protectedCache = await createProtectedCacheService();
  
  return {
    cache: protectedCache,
    // ... other providers
  };
}