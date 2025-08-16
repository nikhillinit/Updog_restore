// client/src/lib/dedupedFetch.ts
// HTTP fetch wrapper with automatic deduplication of concurrent requests

import { createSingleFlight } from '../../../shared/singleflight';
import { stableKeyForRequest, hashKeyForRequest } from '../../../shared/stableKey';

// Create a single-flight instance for HTTP requests
const httpSingleFlight = createSingleFlight({
  capacity: 500,
  holdForMs: import.meta.env?.MODE === 'test' ? 1 : 0, // Small hold in tests only
});

export interface DedupedFetchOptions extends RequestInit {
  dedupe?: boolean;        // Enable deduplication (default: true for GET, false for POST/PUT/DELETE)
  dedupeKey?: string;      // Custom deduplication key (overrides automatic key generation)
  parseResponse?: boolean; // Parse JSON response (default: true)
}

/**
 * Fetch wrapper with automatic deduplication of concurrent identical requests.
 * Returns the same promise for all concurrent calls with the same key.
 */
export async function dedupedFetch<T = unknown>(
  url: string,
  options: DedupedFetchOptions = {}
): Promise<T> {
  const {
    dedupe = shouldDedupe(options.method),
    dedupeKey,
    parseResponse = true,
    ...fetchOptions
  } = options;

  // Generate or use provided deduplication key
  const key = dedupe
    ? (dedupeKey ?? hashKeyForRequest(url, fetchOptions))
    : `${hashKeyForRequest(url, fetchOptions)}-${Date.now()}-${Math.random()}`;

  return httpSingleFlight.do<T>(key, async (signal) => {
    // Track dedup attempts
    if (dedupe && httpSingleFlight.has(key)) {
      try {
        (window as any).Telemetry?.track?.('http_dedup_hit', {
          url,
          method: fetchOptions.method ?? 'GET',
          key,
        });
      } catch {
        // Silent fail for telemetry
      }
    }

    const response = await fetch(url, {
      ...fetchOptions,
      signal: fetchOptions.signal ?? signal, // Prefer user's signal if provided
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).response = response;
      (error as any).status = response.status;
      
      // Don't cache retriable errors
      if (isRetriableError(response.status)) {
        httpSingleFlight.cancel(key);
      }
      
      throw error;
    }

    if (!parseResponse) {
      return response as unknown as T;
    }

    // Parse based on content-type
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json() as T;
    } else if (contentType?.includes('text/')) {
      return await response.text() as unknown as T;
    } else {
      return await response.blob() as unknown as T;
    }
  });
}

/**
 * Non-deduped fetch for actions that must always execute independently.
 */
export async function nonDedupedFetch<T = unknown>(
  url: string,
  options: Omit<DedupedFetchOptions, 'dedupe' | 'dedupeKey'> = {}
): Promise<T> {
  return dedupedFetch<T>(url, { ...options, dedupe: false });
}

/**
 * Cancel an in-flight request by its key.
 */
export function cancelRequest(url: string, options?: RequestInit): boolean {
  const key = hashKeyForRequest(url, options);
  return httpSingleFlight.cancel(key);
}

/**
 * Check if a request is currently in-flight.
 */
export function isRequestInFlight(url: string, options?: RequestInit): boolean {
  const key = hashKeyForRequest(url, options);
  return httpSingleFlight.has(key);
}

/**
 * Get the number of in-flight requests.
 */
export function getInflightCount(): number {
  return httpSingleFlight.size();
}

/**
 * Determine if a request should be deduped by default based on method.
 * GET/HEAD/OPTIONS are safe to dedupe; POST/PUT/DELETE/PATCH are not.
 */
function shouldDedupe(method?: string): boolean {
  const safeMethod = (method ?? 'GET').toUpperCase();
  return ['GET', 'HEAD', 'OPTIONS'].includes(safeMethod);
}

/**
 * Determine if an error is retriable.
 * 429 (Too Many Requests), 502 (Bad Gateway), 503 (Service Unavailable), 504 (Gateway Timeout)
 */
function isRetriableError(status: number): boolean {
  return [429, 502, 503, 504].includes(status);
}

// Export the single-flight instance for advanced use cases
export { httpSingleFlight };