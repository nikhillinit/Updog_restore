/**
 * Idempotency Middleware
 * Ensures exactly-once processing for critical operations
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { redis as redisClient } from '../db/redis-circuit';

interface IdempotencyOptions {
  ttl?: number;                    // TTL in seconds (default: 300 = 5 minutes)
  prefix?: string;                 // Redis key prefix (default: 'idem')
  generateKey?: (req: Request) => string | undefined; // Custom key generator
  skipPaths?: string[];            // Paths to skip idempotency
  memoryFallback?: boolean;        // Use memory if Redis unavailable
  includeStatusCodes?: number[];   // Status codes to cache (default: [200, 201])
}

interface IdempotentResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  timestamp: number;
}

// In-memory fallback for when Redis is unavailable
class MemoryIdempotencyStore {
  private store = new Map<string, { data: IdempotentResponse; expiry: number }>();
  private readonly maxSize = 1000;
  
  set(key: string, data: IdempotentResponse, ttl: number): void {
    // Cleanup expired entries
    this.cleanup();
    
    // Evict oldest if at capacity
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      this.store.delete(firstKey);
    }
    
    const expiry = Date.now() + (ttl * 1000);
    this.store['set'](key, { data, expiry });
  }
  
  get(key: string): IdempotentResponse | null {
    const entry = this.store['get'](key);
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  delete(key: string): void {
    this.store.delete(key);
  }
  
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiry) {
        this.store.delete(key);
      }
    }
  }
  
  clear(): void {
    this.store.clear();
  }
  
  size(): number {
    return this.store.size;
  }
}

const memoryStore = new MemoryIdempotencyStore();

/**
 * Get idempotency key from request
 */
function getIdempotencyKey(req: Request, options: IdempotencyOptions): string | undefined {
  // Custom key generator
  if (options.generateKey) {
    return options.generateKey(req);
  }
  
  // Check headers for idempotency key
  const headerKey = req.headers['idempotency-key'] || 
                    req.headers['x-idempotency-key'] ||
                    req.headers['idempotent-key'];
  
  if (headerKey && typeof headerKey === 'string') {
    return headerKey;
  }
  
  // Generate key from request signature for specific endpoints
  if (req.method === 'POST' && shouldAutoGenerateKey(req)) {
    return generateRequestHash(req);
  }
  
  return undefined;
}

/**
 * Check if we should auto-generate idempotency key
 */
function shouldAutoGenerateKey(req: Request): boolean {
  const criticalPaths = [
    '/api/funds',
    '/api/simulations',
    '/api/transactions',
    '/api/payments',
  ];
  
  return criticalPaths.some(path => req.path.startsWith(path));
}

/**
 * Generate hash from request data
 */
function generateRequestHash(req: Request): string {
  const data = {
    method: req.method,
    path: req.path,
    body: req.body,
    userId: (req as any).user?.id,
  };
  
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
}

/**
 * Store idempotent response
 */
async function storeResponse(
  key: string,
  response: IdempotentResponse,
  options: IdempotencyOptions
): Promise<void> {
  const redisKey = `${options.prefix}:${key}`;
  const ttl = options.ttl || 300;
  
  try {
    // Try Redis first
    if (redisClient) {
      await redisClient.setex(redisKey, ttl, JSON.stringify(response));
    }
  } catch (error) {
    console.warn('[Idempotency] Failed to store in Redis:', error);
    
    // Fallback to memory if enabled
    if (options.memoryFallback) {
      memoryStore['set'](key, response, ttl);
    }
  }
}

/**
 * Retrieve idempotent response
 */
async function retrieveResponse(
  key: string,
  options: IdempotencyOptions
): Promise<IdempotentResponse | null> {
  const redisKey = `${options.prefix}:${key}`;
  
  try {
    // Try Redis first
    if (redisClient) {
      const cached = await redisClient['get'](redisKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }
  } catch (error) {
    console.warn('[Idempotency] Failed to retrieve from Redis:', error);
  }
  
  // Fallback to memory if enabled
  if (options.memoryFallback) {
    return memoryStore['get'](key);
  }
  
  return null;
}

/**
 * Idempotency middleware factory
 */
export function idempotency(options: IdempotencyOptions = {}) {
  const config = {
    ttl: options.ttl || 300,
    prefix: options.prefix || 'idem',
    generateKey: options.generateKey,
    skipPaths: options.skipPaths || [],
    memoryFallback: options.memoryFallback !== false,
    includeStatusCodes: options.includeStatusCodes || [200, 201],
  };
  
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if path is excluded
    if (config.skipPaths.includes(req.path)) {
      return next();
    }
    
    // Get idempotency key
    const key = getIdempotencyKey(req, config);
    
    if (!key) {
      // No idempotency key, proceed normally
      return next();
    }
    
    // Check for existing response
    const cached = await retrieveResponse(key, config);
    
    if (cached) {
      // Return cached response
      console.log(`[Idempotency] Returning cached response for key: ${key}`);
      
      res['setHeader']('X-Idempotent-Replay', 'true');
      res['setHeader']('X-Idempotency-Key', key);
      
      // Restore headers
      Object.entries(cached.headers).forEach(([name, value]) => {
        if (!name.toLowerCase().startsWith('x-idempotent')) {
          res['setHeader'](name, value);
        }
      });
      
      return res.status(cached.statusCode).json(cached.body);
    }
    
    // Capture response for caching
    const originalSend = res.send;
    const originalJson = res.json;
    
    let responseBody: any;
    let responseCaptured = false;
    
    // Override send method
    res.send = function(body?: any) {
      if (!responseCaptured && config.includeStatusCodes.includes(res.statusCode)) {
        responseBody = body;
        responseCaptured = true;
        
        // Store response asynchronously
        const response: IdempotentResponse = {
          statusCode: res.statusCode,
          headers: res.getHeaders() as Record<string, string>,
          body: typeof body === 'string' ? JSON.parse(body) : body,
          timestamp: Date.now(),
        };
        
        storeResponse(key, response, config).catch(error => {
          console.error('[Idempotency] Failed to cache response:', error);
        });
      }
      
      res['setHeader']('X-Idempotency-Key', key);
      return originalSend.call(this, body);
    };
    
    // Override json method
    res.json = function(body?: any) {
      if (!responseCaptured && config.includeStatusCodes.includes(res.statusCode)) {
        responseBody = body;
        responseCaptured = true;
        
        // Store response asynchronously
        const response: IdempotentResponse = {
          statusCode: res.statusCode,
          headers: res.getHeaders() as Record<string, string>,
          body,
          timestamp: Date.now(),
        };
        
        storeResponse(key, response, config).catch(error => {
          console.error('[Idempotency] Failed to cache response:', error);
        });
      }
      
      res['setHeader']('X-Idempotency-Key', key);
      return originalJson.call(this, body);
    };
    
    next();
  };
}

/**
 * Clear idempotency cache (for testing)
 */
export function clearIdempotencyCache(): void {
  memoryStore.clear();
  console.log('[Idempotency] Memory cache cleared');
}

/**
 * Get idempotency cache statistics
 */
export function getIdempotencyStats() {
  return {
    memoryCacheSize: memoryStore.size(),
    ttl: 300,
    memoryFallbackEnabled: true,
  };
}

/**
 * Express route handler for idempotency status
 */
export function idempotencyStatusHandler(req: Request, res: Response) {
  res.json({
    status: 'active',
    stats: getIdempotencyStats(),
    timestamp: new Date().toISOString(),
  });
}

// Export default middleware with standard configuration
export default idempotency();