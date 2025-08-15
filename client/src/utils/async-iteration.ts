/**
 * Async iteration utilities to replace problematic forEach patterns
 */

import { safeArray } from './array-safety';
import { logger } from '../lib/logger';

// Compile-time flag for metrics collection - dead-stripped in production builds
const withMetrics: boolean = import.meta.env?.MODE !== 'production';

export interface ProcessingOptions {
  parallel?: boolean;
  batchSize?: number;
  continueOnError?: boolean;
  delayBetweenBatches?: number;
}

/**
 * Process an array of items with proper async handling
 * @param items Array of items to process
 * @param processor Function to process each item
 * @param options Processing options
 */
export async function processAsync<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<void>,
  options: ProcessingOptions = {}
): Promise<void> {
  const { 
    parallel = false, 
    batchSize = 10, 
    continueOnError = false,
    delayBetweenBatches = 0
  } = options;
  
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  if (parallel) {
    if (batchSize >= items.length) {
      // Process all items in parallel
      if (continueOnError) {
        const results = await Promise.allSettled(items.map((item, index) => processor(item, index)));
        // Handle errors from Promise.allSettled
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'rejected') {
            logger.error(`Failed to process item ${i}:`, result.reason);
          }
        }
      } else {
        await Promise.all(items.map((item, index) => processor(item, index)));
      }
    } else {
      // Process in batches
      await processBatches(items, processor, batchSize, delayBetweenBatches, continueOnError);
    }
  } else {
    // Sequential processing
    for (let i = 0; i < items.length; i++) {
      try {
        await processor(items[i], i);
      } catch (error) {
        if (!continueOnError) throw error;
        logger.error(`Processing error at index ${i}:`, error as Error);
      }
    }
  }
}

/**
 * Process items in batches with optional delays
 */
async function processBatches<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<void>,
  batchSize: number,
  delay: number,
  continueOnError: boolean
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchStart = i;
    
    try {
      if (continueOnError) {
        const results = await Promise.allSettled(
          batch.map((item, batchIndex) => processor(item, batchStart + batchIndex))
        );
        
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'rejected') {
            logger.error(`Failed to process item ${batchStart + i}:`, result.reason);
          }
        }
      } else {
        await Promise.all(
          batch.map((item, batchIndex) => processor(item, batchStart + batchIndex))
        );
      }
    } catch (error) {
      if (!continueOnError) throw error;
      logger.error(`Batch processing error starting at index ${batchStart}:`, error as Error);
    }
    
    // Add delay between batches if specified
    if (delay > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Sequential async forEach replacement
 * @param items Array to iterate over
 * @param callback Async callback function
 */
export async function forEachAsync<T>(
  items: T[],
  callback: (item: T, index: number, array: T[]) => Promise<void>
): Promise<void> {
  if (!Array.isArray(items)) return;
  
  const start = withMetrics ? performance.now() : 0;
  
  for (let i = 0; i < items.length; i++) {
    await callback(items[i], i, items);
  }
  
  if (withMetrics && items.length > 100) {
    console.info(`[async-metrics] forEachAsync: ${items.length} items in ${(performance.now() - start).toFixed(1)}ms`);
  }
}

/**
 * Parallel async map with proper error handling
 * @param items Array to map over
 * @param callback Async mapping function
 * @param options Processing options
 */
export async function mapAsync<T, R>(
  items: T[],
  callback: (item: T, index: number, array: T[]) => Promise<R>,
  options: Omit<ProcessingOptions, 'continueOnError'> = {}
): Promise<R[]> {
  const { parallel = true, batchSize = 10, delayBetweenBatches = 0 } = options;
  
  if (!Array.isArray(items)) return [];
  
  const start = withMetrics ? performance.now() : 0;
  let results: R[];
  
  if (parallel && batchSize >= items.length) {
    // Process all items in parallel
    results = await Promise.all(items.map(callback));
  } else if (parallel) {
    // Process in batches
    results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((item, batchIndex) => callback(item, i + batchIndex, items))
      );
      results.push(...batchResults);
      
      // Add delay between batches if specified
      if (delayBetweenBatches > 0 && i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
  } else {
    // Sequential processing
    results = [];
    for (let i = 0; i < items.length; i++) {
      const result = await callback(items[i], i, items);
      results.push(result);
    }
  }
  
  if (withMetrics && items.length > 100) {
    const mode = parallel ? 'parallel' : 'sequential';
    console.info(`[async-metrics] mapAsync (${mode}): ${items.length} items in ${(performance.now() - start).toFixed(1)}ms`);
  }
  
  return results;
}


/**
 * Filter with async predicate
 */
export async function filterAsync<T>(
  items: T[],
  predicate: (item: T, index: number, array: T[]) => Promise<boolean>
): Promise<T[]> {
  if (!Array.isArray(items)) return [];
  
  const results = await mapAsync(items, predicate);
  return items.filter((_, index) => results[index]);
}

/**
 * Find with async predicate
 */
export async function findAsync<T>(
  items: T[],
  predicate: (item: T, index: number, array: T[]) => Promise<boolean>
): Promise<T | undefined> {
  if (!Array.isArray(items)) return undefined;
  
  for (let i = 0; i < items.length; i++) {
    if (await predicate(items[i], i, items)) {
      return items[i];
    }
  }
  return undefined;
}

/**
 * Reduce with async reducer
 */
export async function reduceAsync<T, R>(
  items: T[],
  reducer: (accumulator: R, currentValue: T, currentIndex: number, array: T[]) => Promise<R>,
  initialValue: R
): Promise<R> {
  if (!Array.isArray(items)) return initialValue;
  
  let accumulator = initialValue;
  for (let i = 0; i < items.length; i++) {
    accumulator = await reducer(accumulator, items[i], i, items);
  }
  return accumulator;
}

/**
 * Some with async predicate
 */
export async function someAsync<T>(
  items: T[],
  predicate: (item: T, index: number, array: T[]) => Promise<boolean>
): Promise<boolean> {
  if (!Array.isArray(items)) return false;
  
  for (let i = 0; i < items.length; i++) {
    if (await predicate(items[i], i, items)) {
      return true;
    }
  }
  return false;
}

/**
 * Every with async predicate
 */
export async function everyAsync<T>(
  items: T[],
  predicate: (item: T, index: number, array: T[]) => Promise<boolean>
): Promise<boolean> {
  if (!Array.isArray(items)) return true;
  
  for (let i = 0; i < items.length; i++) {
    if (!(await predicate(items[i], i, items))) {
      return false;
    }
  }
  return true;
}

// Example usage patterns
export const examples = {
  // Sequential processing (safest)
  sequential: async <T>(items: T[], processor: (item: T) => Promise<void>) => {
    await forEachAsync(items, processor);
  },

  // Parallel processing (fastest)
  parallel: async <T>(items: T[], processor: (item: T) => Promise<void>) => {
    await processAsync(items, processor, { parallel: true });
  },

  // Batched processing (balanced)
  batched: async <T>(items: T[], processor: (item: T) => Promise<void>) => {
    await processAsync(items, processor, { 
      parallel: true, 
      batchSize: 5, 
      delayBetweenBatches: 100 
    });
  },

  // Error-resilient processing
  resilient: async <T>(items: T[], processor: (item: T) => Promise<void>) => {
    await processAsync(items, processor, { 
      parallel: true, 
      continueOnError: true 
    });
  }
};
