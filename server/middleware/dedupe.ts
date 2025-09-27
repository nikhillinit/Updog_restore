/**
 * Request Deduplication Middleware
 * Prevents duplicate processing of identical requests within a time window
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { redis as redisClient } from '../db/redis-circuit';

interface DedupeOptions {
  ttl?: number;                    // TTL in seconds (default: 300 = 5 minutes)
  prefix?: string;                 // Redis key prefix (default: 'dedupe')
  methods?: string[];              // HTTP methods to dedupe (default: ['POST', 'PUT'])
  skipPaths?: string[];            // Paths to skip deduplication
  includeHeaders?: string[];       // Headers to include in hash
  memoryFallback?: boolean;        // Use memory if Redis unavailable
  useSingleflight?: boolean;       // Use singleflight for in-flight dedup
  hashAlgorithm?: string;          // Hash algorithm (default: 'sha256')
}

interface DedupedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  timestamp: number;
  requestCount: number;
}

// In-memory deduplication store
class MemoryDedupeStore {
  private store = new Map<string, { data: DedupedResponse; expiry: number }>();
  private readonly maxSize = 500;
  
  set(key: string, data: DedupedResponse, ttl: number): void {
    // Cleanup expired entries
    this.cleanup();
    
    // Evict oldest if at capacity
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      this.store.delete(firstKey);
    }
    
    const expiry = Date.now() + (ttl * 1000);
    this.store.set(key, { data, expiry });
  }
  
  get(key: string): DedupedResponse | null {
    const entry = this.store.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }
    
    // Increment request count
    entry.data.requestCount++;
    
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

const memoryStore = new MemoryDedupeStore();

// Track in-flight requests for singleflight pattern
const inflightRequests = new Map<string, Promise<any>>();

/**
 * Generate deduplication key from request
 */
function generateDedupeKey(req: Request, options: DedupeOptions): string {
  const parts: any = {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
  };
  
  // Include specific headers if configured
  if (options.includeHeaders && options.includeHeaders.length > 0) {
    parts.headers = {};
    for (const header of options.includeHeaders) {
      const value = req.headers[header.toLowerCase()];
      if (value) {
        parts.headers[header] = value;
      }
    }
  }
  
  // Include user ID if authenticated
  const userId = (req as any).user?.id;
  if (userId) {
    parts.userId = userId;
  }
  
  const data = JSON.stringify(parts);
  return crypto
    .createHash(options.hashAlgorithm || 'sha256')
    .update(data)
    .digest('hex');
}

/**
 * Store deduplicated response
 */
async function storeResponse(
  key: string,
  response: DedupedResponse,
  options: DedupeOptions
): Promise<void> {
  const redisKey = `${options.prefix}:${key}`;
  const ttl = options.ttl || 300;
  
  try {
    // Try Redis first
    if (redisClient) {
      await redisClient.setex(redisKey, ttl, JSON.stringify(response));
    }
  } catch (error) {
    console.warn('[Dedupe] Failed to store in Redis:', error);
    
    // Fallback to memory if enabled
    if (options.memoryFallback) {
      memoryStore.set(key, response, ttl);
    }
  }
}

/**
 * Retrieve deduplicated response
 */
async function retrieveResponse(
  key: string,
  options: DedupeOptions
): Promise<DedupedResponse | null> {
  const redisKey = `${options.prefix}:${key}`;
  
  try {
    // Try Redis first
    if (redisClient) {
      const cached = await redisClient.get(redisKey);
      if (cached) {
        const response = JSON.parse(cached);
        response.requestCount = (response.requestCount || 0) + 1;
        
        // Update count in Redis
        await redisClient.setex(redisKey, options.ttl || 300, JSON.stringify(response));
        
        return response;
      }
    }
  } catch (error) {
    console.warn('[Dedupe] Failed to retrieve from Redis:', error);
  }
  
  // Fallback to memory if enabled
  if (options.memoryFallback) {
    return memoryStore.get(key);
  }
  
  return null;
}

/**
 * Request deduplication middleware factory
 */
export function dedupe(options: DedupeOptions = {}) {
  const config = {
    ttl: options.ttl || 300,
    prefix: options.prefix || 'dedupe',
    methods: options.methods || ['POST', 'PUT'],
    skipPaths: options.skipPaths || [],
    includeHeaders: options.includeHeaders || [],
    memoryFallback: options.memoryFallback !== false,
    useSingleflight: options.useSingleflight !== false,
    hashAlgorithm: options.hashAlgorithm || 'sha256',
  };
  
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if method not configured for deduplication
    if (!config.methods.includes(req.method)) {
      return next();
    }
    
    // Skip if path is excluded
    if (config.skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Generate deduplication key
    const key = generateDedupeKey(req, config);
    
    // Check for existing response
    const cached = await retrieveResponse(key, config);
    
    if (cached) {
      // Return cached response
      console.log(`[Dedupe] Returning cached response for request hash: ${key.substring(0, 8)}...`);
      
      res.setHeader('X-Request-Dedup', 'true');
      res.setHeader('X-Dedup-Count', String(cached.requestCount));
      res.setHeader('X-Dedup-Key', key.substring(0, 8));
      
      // Restore headers
      Object.entries(cached.headers).forEach(([name, value]) => {
        if (!name.toLowerCase().startsWith('x-request-dedup') && 
            !name.toLowerCase().startsWith('x-dedup')) {
          res.setHeader(name, value);
        }
      });
      
      return res.status(cached.statusCode).json(cached.body);
    }
    
    // Use singleflight pattern for in-flight deduplication
    if (config.useSingleflight && inflightRequests.has(key)) {
      console.log(`[Dedupe] Request in-flight, waiting for completion: ${key.substring(0, 8)}...`);
      
      try {
        const result = await inflightRequests.get(key);
        
        res.setHeader('X-Request-Dedup', 'inflight');
        res.setHeader('X-Dedup-Key', key.substring(0, 8));
        
        return res.status(result.statusCode).json(result.body);
      } catch (error) {
        // If in-flight request failed, proceed normally
        console.error('[Dedupe] In-flight request failed:', error);
      }
    }
    
    // Create promise for in-flight tracking
    let resolveInflight: (value: any) => void;
    let rejectInflight: (reason?: any) => void;
    
    if (config.useSingleflight) {
      const inflightPromise = new Promise((resolve, reject) => {
        resolveInflight = resolve;
        rejectInflight = reject;
      });
      
      inflightRequests.set(key, inflightPromise);
    }
    
    // Capture response for caching
    const originalSend = res.send;
    const originalJson = res.json;
    
    let responseBody: any;
    let responseCaptured = false;
    
    // Override send method
    res.send = function(body?: any) {
      if (!responseCaptured && [200, 201].includes(res.statusCode)) {
        responseBody = body;
        responseCaptured = true;
        
        // Store response asynchronously
        const response: DedupedResponse = {
          statusCode: res.statusCode,
          headers: res.getHeaders() as Record<string, string>,
          body: typeof body === 'string' ? JSON.parse(body) : body,
          timestamp: Date.now(),
          requestCount: 1,
        };
        
        storeResponse(key, response, config).catch(error => {
          console.error('[Dedupe] Failed to cache response:', error);
        });
        
        // Resolve in-flight promise
        if (config.useSingleflight) {
          resolveInflight!(response);
          inflightRequests.delete(key);
        }
      } else if (config.useSingleflight && !responseCaptured) {
        // Reject in-flight promise on error
        rejectInflight!(new Error(`Request failed with status ${res.statusCode}`));
        inflightRequests.delete(key);
      }
      
      res.setHeader('X-Dedup-Key', key.substring(0, 8));
      return originalSend.call(this, body);
    };
    
    // Override json method
    res.json = function(body?: any) {
      if (!responseCaptured && [200, 201].includes(res.statusCode)) {
        responseBody = body;
        responseCaptured = true;
        
        // Store response asynchronously
        const response: DedupedResponse = {
          statusCode: res.statusCode,
          headers: res.getHeaders() as Record<string, string>,
          body,
          timestamp: Date.now(),
          requestCount: 1,
        };
        
        storeResponse(key, response, config).catch(error => {
          console.error('[Dedupe] Failed to cache response:', error);
        });
        
        // Resolve in-flight promise
        if (config.useSingleflight) {
          resolveInflight!(response);
          inflightRequests.delete(key);
        }
      } else if (config.useSingleflight && !responseCaptured) {
        // Reject in-flight promise on error
        rejectInflight!(new Error(`Request failed with status ${res.statusCode}`));
        inflightRequests.delete(key);
      }
      
      res.setHeader('X-Dedup-Key', key.substring(0, 8));
      return originalJson.call(this, body);
    };
    
    // Clean up in-flight on error
    if (config.useSingleflight) {
      res.on('finish', () => {
        if (!responseCaptured && inflightRequests.has(key)) {
          rejectInflight!(new Error('Request finished without response'));
          inflightRequests.delete(key);
        }
      });
    }
    
    next();
  };
}

/**
 * Clear deduplication cache (for testing)
 */
export function clearDedupeCache(): void {
  memoryStore.clear();
  inflightRequests.clear();
  console.log('[Dedupe] Memory cache and in-flight requests cleared');
}

/**
 * Get deduplication statistics
 */
export function getDedupeStats() {
  return {
    memoryCacheSize: memoryStore.size(),
    inflightRequests: inflightRequests.size,
    ttl: 300,
    memoryFallbackEnabled: true,
  };
}

/**
 * Express route handler for deduplication status
 */
export function dedupeStatusHandler(req: Request, res: Response) {
  res.json({
    status: 'active',
    stats: getDedupeStats(),
    timestamp: new Date().toISOString(),
  });
}

// Export default middleware with standard configuration
export default dedupe();