/**
 * Quick Wins Implementation
 * Small correctness improvements that can be done immediately
 * These fixes prevent common errors and improve data integrity
 */

import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import type { Worker } from 'worker_threads';

/**
 * 1. APPROVAL SIGNER UNIQUENESS
 * Ensure two distinct partner identities (not just two signatures)
 */
export function validateDistinctSigners(
  approvals: Array<{ partnerId: string; partnerEmail: string }>
): { valid: boolean; uniqueCount: number; duplicates?: string[] } {
  const signerIds = new Set(approvals.map(a => a.partnerId));
  const signerEmails = new Set(approvals.map(a => a.partnerEmail));
  
  // Check both ID and email uniqueness (in case of shared accounts)
  const uniqueCount = Math.min(signerIds.size, signerEmails.size);
  
  if (uniqueCount < 2) {
    // Find duplicates for better error messages
    const idCounts = new Map<string, number>();
    approvals.forEach(a => {
      idCounts['set'](a.partnerId, (idCounts['get'](a.partnerId) || 0) + 1);
    });
    
    const duplicates = Array.from(idCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id);
    
    return {
      valid: false,
      uniqueCount,
      duplicates
    };
  }
  
  return {
    valid: true,
    uniqueCount
  };
}

/**
 * 2. CANONICAL JSON HASHING
 * Ensures consistent hashing regardless of property order
 */
export function canonicalJsonHash(obj: unknown): string {
  // Deep sort object keys recursively
  const sortedObj = deepSortKeys(obj);

  // Use stable stringify with sorted keys
  const jsonStr = JSON.stringify(sortedObj, Object.keys(sortedObj as Record<string, unknown>).sort());

  // SHA-256 hash
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

function deepSortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepSortKeys);
  if (obj instanceof Date) return obj.toISOString();

  // Sort object keys and rebuild
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((sorted: Record<string, unknown>, key) => {
      sorted[key] = deepSortKeys((obj as Record<string, unknown>)[key]);
      return sorted;
    }, {});
}

/**
 * 3. RATE LIMITED APPROVALS
 * Throttle approval creation per strategy/inputs combination
 */
export class ApprovalRateLimiter {
  private cache: LRUCache<string, number[]>;
  
  constructor(
    private maxRequests: number = 3,
    private windowMs: number = 60000 // 1 minute default
  ) {
    this.cache = new LRUCache<string, number[]>({
      max: 1000,
      ttl: this.windowMs
    });
  }
  
  canCreateApproval(strategyId: string, inputsHash: string): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const key = `approval:${strategyId}:${inputsHash}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get existing timestamps
    let timestamps = this.cache['get'](key) || [];
    
    // Filter out expired timestamps
    timestamps = timestamps.filter(t => t > windowStart);
    
    if (timestamps.length >= this.maxRequests) {
      const oldestTimestamp = Math.min(...timestamps);
      const resetAt = oldestTimestamp + this.windowMs;
      
      return {
        allowed: false,
        remaining: 0,
        resetAt
      };
    }
    
    // Add current timestamp
    timestamps.push(now);
    this.cache['set'](key, timestamps);
    
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetAt: now + this.windowMs
    };
  }
  
  clear(): void {
    this.cache.clear();
  }
}

/**
 * 4. WORKER KILL BEHAVIOR
 * Ensure partial results are NOT persisted if worker times out
 */
export interface WorkerGuard {
  worker: Worker;
  timeoutMs: number;
  onTimeout?: () => void;
}

export function createGuardedWorker(config: WorkerGuard): {
  execute: (_data: unknown) => Promise<unknown>;
  cleanup: () => void;
} {
  let timeoutId: NodeJS.Timeout | null = null;
  let resultPromise: Promise<unknown> | null = null;
  let isTimedOut = false;

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    config.worker.terminate();
  };

  const execute = (data: unknown): Promise<unknown> => {
    if (resultPromise) {
      throw new Error('Worker is already executing');
    }

    resultPromise = new Promise((resolve, reject) => {
      // Set up timeout
      timeoutId = setTimeout(() => {
        isTimedOut = true;
        cleanup();

        if (config.onTimeout) {
          config.onTimeout();
        }

        reject(new Error(`Worker timed out after ${config.timeoutMs}ms`));
      }, config.timeoutMs);

      // Listen for worker messages
      config.worker['on']('message', (result: unknown) => {
        if (!isTimedOut) {
          cleanup();
          resolve(result);
        }
        // Ignore messages after timeout
      });

      config.worker['on']('error', (error: Error) => {
        if (!isTimedOut) {
          cleanup();
          reject(error);
        }
      });

      // Send data to worker
      config.worker.postMessage(data);
    });

    return resultPromise;
  };

  return { execute, cleanup };
}

/**
 * 5. FLAGS ENDPOINT PRIVACY
 * Ensure proper cache headers for user-specific flags
 */
export function getPrivateCacheHeaders(
  orgId?: string,
  fundId?: string,
  userId?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': 'private, max-age=15, must-revalidate',
    'Surrogate-Control': 'no-store' // Prevent CDN caching
  };
  
  // Build Vary header based on context
  const varyParts: string[] = [];
  if (orgId) varyParts.push('X-Org-Id');
  if (fundId) varyParts.push('X-Fund-Id');
  if (userId) varyParts.push('X-User-Id');
  
  if (varyParts.length > 0) {
    headers['Vary'] = varyParts.join(', ');
  }
  
  return headers;
}

/**
 * 6. NON-FINITE NUMBER GUARDS
 * Prevent NaN/Infinity from corrupting calculations
 */
export function sanitizeNumber(value: number, fallback: number = 0): number {
  if (!Number.isFinite(value)) {
    console.warn(`Non-finite number detected: ${value}, using fallback: ${fallback}`);
    return fallback;
  }
  return value;
}

export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  numericFields: Array<keyof T>
): T {
  const sanitized = { ...obj };

  for (const field of numericFields) {
    const value = sanitized[field];
    if (typeof value === 'number') {
      sanitized[field] = sanitizeNumber(value) as T[typeof field];
    }
  }

  return sanitized;
}

/**
 * 7. DETERMINISTIC SEED GENERATION
 * Generate reproducible seeds from input parameters
 */
export function generateDeterministicSeed(
  params: unknown,
  version: string,
  salt: string = 'reserves_v1.1'
): bigint {
  const hash = canonicalJsonHash({
    params,
    version,
    salt
  });

  // Convert first 8 bytes of hash to bigint
  const seedBytes = Buffer.from(hash.substring(0, 16), 'hex');
  return BigInt(`0x${  seedBytes.toString('hex')}`);
}

/**
 * 8. TRANSACTION RESULT VALIDATION
 * Ensure calculation results are valid before persisting
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateCalculationResult(result: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required fields
  if (!result || typeof result !== 'object') {
    errors.push('Result must be an object');
    return { valid: false, errors, warnings };
  }

  const resultObj = result as Record<string, unknown>;

  // Check for non-finite numbers in allocations
  if (Array.isArray(resultObj.allocations)) {
    resultObj.allocations.forEach((allocation: unknown, index: number) => {
      const alloc = allocation as Record<string, unknown>;
      if (typeof alloc.recommendedAllocation === 'number') {
        if (!Number.isFinite(alloc.recommendedAllocation)) {
          errors.push(`Allocation ${index} has non-finite recommendedAllocation`);
        }
        if (alloc.recommendedAllocation < 0) {
          errors.push(`Allocation ${index} has negative recommendedAllocation`);
        }
      }
    });
  }

  // Check for total allocation exceeding available
  const inputSummary = resultObj.inputSummary as Record<string, unknown> | undefined;
  if (
    inputSummary &&
    typeof inputSummary.totalAllocated === 'number' &&
    typeof inputSummary.availableReserves === 'number' &&
    inputSummary.totalAllocated > inputSummary.availableReserves
  ) {
    warnings.push('Total allocated exceeds available reserves');
  }

  // Check for timestamp validity
  const metadata = resultObj.metadata as Record<string, unknown> | undefined;
  if (metadata?.calculationDate) {
    const date = new Date(metadata.calculationDate as string);
    if (isNaN(date.getTime())) {
      errors.push('Invalid calculation date');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Combined quick wins utility class for easy integration
 */
export class QuickWinsUtility {
  private approvalRateLimiter: ApprovalRateLimiter;
  
  constructor() {
    this.approvalRateLimiter = new ApprovalRateLimiter();
  }
  
  // Re-export all utilities as methods
  validateDistinctSigners = validateDistinctSigners;
  canonicalJsonHash = canonicalJsonHash;
  createGuardedWorker = createGuardedWorker;
  getPrivateCacheHeaders = getPrivateCacheHeaders;
  sanitizeNumber = sanitizeNumber;
  sanitizeObject = sanitizeObject;
  generateDeterministicSeed = generateDeterministicSeed;
  validateCalculationResult = validateCalculationResult;
  
  canCreateApproval(strategyId: string, inputsHash: string) {
    return this.approvalRateLimiter.canCreateApproval(strategyId, inputsHash);
  }
}