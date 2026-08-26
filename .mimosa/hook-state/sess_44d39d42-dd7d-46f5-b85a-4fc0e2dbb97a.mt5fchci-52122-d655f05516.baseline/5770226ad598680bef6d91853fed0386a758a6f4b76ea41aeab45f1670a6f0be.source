import pLimit from './pLimit';

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
  const { concurrency = 4, maxFailures = 3, resetOnSuccess = true } = options;

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
          const circuitBreakerError = new Error(
            `Migration halted - too many failures (${consecutiveFailures}/${maxFailures})`
          );

          console.error(
            `Circuit breaker tripped: ${error instanceof Error ? error.message : String(error)}`
          );

          console.warn(`Circuit breaker tripped ${breakerTrips} times`);

          throw circuitBreakerError;
        }

        console.warn('Task failed in resilient limit', {
          consecutiveFailures,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    });
  };
}

// Convenience factory for common use cases
export const createResilientLimit = (concurrency: number) =>
  resilientLimit({ concurrency, maxFailures: 3, resetOnSuccess: true });
