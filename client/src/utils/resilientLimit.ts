/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import pLimit from './pLimit';
import { logger } from '../lib/logger';

export interface ResilientLimitOptions {
  concurrency?: number;
  maxFailures?: number;
  resetOnSuccess?: boolean;
}

// Circuit breaker metrics
let breakerTrips = 0;
export const getBreakerTrips = () => breakerTrips;

/**
 * Circuit breaker wrapper around pLimit
 * Halts execution if too many consecutive failures occur
 */
export function resilientLimit(options: ResilientLimitOptions = {}) {
  const {
    concurrency = 4,
    maxFailures = 3,
    resetOnSuccess = true
  } = options;
  
  const limit = pLimit(concurrency);
  let consecutiveFailures = 0;

  return async <T>(task: () => Promise<T>): Promise<T> => {
    return limit(async () => {
      try {
        const result = await task();
        if (resetOnSuccess) {
          consecutiveFailures = 0;
        }
        return result;
      } catch (error) {
        consecutiveFailures++;
        
        if (consecutiveFailures >= maxFailures) {
          breakerTrips++;
          // Create a custom error object
          const circuitBreakerError = new Error(`Migration halted - too many failures (${consecutiveFailures}/${maxFailures})`);
          
          // Log the error with relevant information
          logger.error('Circuit breaker tripped: ' + 
            (error instanceof Error ? error.message : String(error)));
          
          // Track the number of trips separately
          console.warn(`Circuit breaker tripped ${breakerTrips} times`);
          
          // Throw the custom error
          throw circuitBreakerError;
        }
        
        logger.warn('Task failed in resilient limit', {
          consecutiveFailures,
          error: error instanceof Error ? error.message : String(error)
        });
        
        throw error;
      }
    });
  };
}

// Convenience factory for common use cases
export const createResilientLimit = (concurrency: number) => 
  resilientLimit({ concurrency, maxFailures: 3, resetOnSuccess: true });

