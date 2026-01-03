/**
 * Asynchronous serialization helper to prevent event loop blocking
 *
 * Large objects (>10KB) can block the event loop for 100-500ms when serialized.
 * This helper uses worker threads via Piscina to offload serialization work.
 *
 * Phase 2 Fix (Issue #1): Actually offloads work to worker threads instead of
 * wrapping synchronous JSON.stringify in async function.
 */

import Piscina from 'piscina';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import type { SerializationTask, SerializationWorkerResult } from './workers/serialization-worker';

// ESM-compatible __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SerializationOptions {
  maxSize?: number;
  pretty?: boolean;
  truncate?: boolean;
}

export interface SerializationResult {
  serialized: string;
  truncated: boolean;
  originalSize?: number;
}

// Singleton worker pool - shared across all serialization operations
let workerPool: Piscina | null = null;

/**
 * Initialize the worker thread pool
 * Called lazily on first use
 */
function getWorkerPool(): Piscina {
  if (!workerPool) {
    const workerPath = path.join(__dirname, 'workers', 'serialization-worker.js');

    workerPool = new Piscina({
      filename: workerPath,
      maxThreads: Math.max(2, Math.floor(os.cpus().length / 2)), // Use half CPU cores, min 2
      minThreads: 1,
      idleTimeout: 30000, // Keep workers alive for 30s
    });
  }
  return workerPool;
}

/**
 * Cleanup worker pool on process exit
 */
export async function shutdownSerializationPool(): Promise<void> {
  const pool = workerPool;
  if (pool) {
    await pool.destroy();
    // eslint-disable-next-line require-atomic-updates -- Safe: pool reference prevents race condition
    workerPool = null;
  }
}

/**
 * Safely serialize objects without blocking the event loop
 *
 * Small objects (< 1KB): Uses synchronous JSON.stringify for speed
 * Large objects (>= 1KB): Offloads to worker thread to prevent event loop blocking
 *
 * Phase 2 Fix: Now actually offloads work to worker threads instead of fake async
 *
 * @param obj - Object to serialize
 * @param options - Serialization options
 * @returns Promise resolving to serialized string and metadata
 */
export async function serializeAsync(
  obj: unknown,
  options: SerializationOptions = {}
): Promise<SerializationResult> {
  const {
    maxSize = 50000,
    pretty = false,
    truncate = true
  } = options;

  try {
    // Fast path for simple values (primitives)
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      const serialized = JSON.stringify(obj);
      return { serialized, truncated: false };
    }

    // Quick size estimate using char count heuristic (fast, synchronous)
    const estimatedSize = estimateSize(obj);

    // Small objects: use fast synchronous path (< 1KB threshold)
    if (estimatedSize < 1024) {
      const serialized = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
      return { serialized, truncated: false };
    }

    // Large objects: offload to worker thread (ACTUAL async, not fake)
    const pool = getWorkerPool();
    const task: SerializationTask = { obj, pretty, maxSize, truncate };

    const result: SerializationWorkerResult = await pool.run(task);

    // Handle worker errors
    if (result.error) {
      // Worker handled the error, but log it
      console.warn('[SerializationHelper] Worker serialization error:', result.error);
    }

    return {
      serialized: result.serialized,
      truncated: result.truncated,
      originalSize: result.originalSize
    };

  } catch (error: unknown) {
    // Fallback if worker pool fails - use synchronous serialization
    console.error('[SerializationHelper] Worker pool failure, falling back to sync:', error);

    try {
      const serialized = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
      return { serialized, truncated: false };
    } catch (syncError) {
      // Final fallback
      const errorMessage = syncError instanceof Error ? syncError.message : String(syncError);
      const fallback = JSON.stringify({
        _serializationError: true,
        error: errorMessage,
        type: typeof obj,
        preview: String(obj).substring(0, 200)
      });

      return { serialized: fallback, truncated: true };
    }
  }
}

/**
 * Estimate serialized size without actually serializing
 * Uses heuristic: avg 4 chars per primitive, recursively count fields
 */
function estimateSize(obj: unknown): number {
  if (obj === null || obj === undefined) return 4;
  if (typeof obj === 'string') return obj.length + 2; // quotes
  if (typeof obj === 'number' || typeof obj === 'boolean') return 8;

  if (Array.isArray(obj)) {
    // Estimate array size
    return obj.reduce((sum, item) => sum + estimateSize(item), 10);
  }

  if (typeof obj === 'object') {
    // Estimate object size
    const keys = Object.keys(obj);
    return keys.reduce((sum, key) => {
      return sum + key.length + estimateSize((obj as Record<string, unknown>)[key]);
    }, 20);
  }

  return 4;
}

/**
 * Synchronously serialize with safety checks
 * Useful when async is not needed but safety is still required
 */
export function serializeSafely(obj: unknown, maxSize = 50000): string {
  try {
    const serialized = JSON.stringify(obj, null, 2);

    if (serialized.length > maxSize) {
      return JSON.stringify({
        _truncated: true,
        _size: serialized.length,
        preview: serialized.substring(0, maxSize - 200),
        summary: generateSummary(obj)
      }, null, 2);
    }

    return serialized;
  } catch (error: unknown) {
    return JSON.stringify({
      _serializationError: true,
      error: error instanceof Error ? error.message : String(error),
      type: typeof obj
    });
  }
}

/**
 * Generate a summary of an object structure
 */
function generateSummary(obj: unknown): Record<string, unknown> {
  if (obj === null || obj === undefined) {
    return { type: String(obj) };
  }

  if (Array.isArray(obj)) {
    return {
      type: 'Array',
      length: obj.length,
      sample: obj.slice(0, 3)
    };
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    return {
      type: 'Object',
      keys: keys.length,
      keyNames: keys.slice(0, 10),
      ...(keys.length > 10 && { truncatedKeys: keys.length - 10 })
    };
  }

  return {
    type: typeof obj,
    value: String(obj).substring(0, 100)
  };
}

/**
 * Batch serialize multiple objects efficiently
 * Useful for logging or metrics collection
 */
export async function serializeBatch(
  objects: unknown[],
  options: SerializationOptions = {}
): Promise<SerializationResult[]> {
  // Process in parallel but limit concurrency to avoid memory spikes
  const BATCH_SIZE = 5;
  const results: SerializationResult[] = [];

  for (let i = 0; i < objects.length; i += BATCH_SIZE) {
    const batch = objects.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(obj => serializeAsync(obj, options))
    );
    results.push(...batchResults);
  }

  return results;
}
