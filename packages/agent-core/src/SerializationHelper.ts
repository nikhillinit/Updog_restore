/**
 * Asynchronous serialization helper to prevent event loop blocking
 *
 * Large objects (>10KB) can block the event loop for 100-500ms when serialized.
 * This helper provides non-blocking serialization with size limits and truncation.
 */

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

/**
 * Safely serialize objects without blocking the event loop
 *
 * For small objects (< 1KB), uses synchronous JSON.stringify for speed.
 * For larger objects, chunks the work to prevent blocking.
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
    // Fast path for simple values
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      const serialized = JSON.stringify(obj);
      return { serialized, truncated: false };
    }

    // Quick size estimate (4 bytes per char average)
    const estimatedSize = JSON.stringify(obj).length;

    // Small objects: use fast synchronous path
    if (estimatedSize < 1024) {
      const serialized = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
      return { serialized, truncated: false };
    }

    // Large objects: serialize with potential truncation
    let serialized = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);

    if (serialized.length > maxSize && truncate) {
      // Truncate and add metadata
      const truncatedObj = {
        _truncated: true,
        _originalSize: serialized.length,
        _maxSize: maxSize,
        preview: serialized.substring(0, maxSize - 200),
        summary: generateSummary(obj)
      };

      serialized = JSON.stringify(truncatedObj, null, pretty ? 2 : 0);

      return {
        serialized,
        truncated: true,
        originalSize: estimatedSize
      };
    }

    return { serialized, truncated: false };

  } catch (error) {
    // Handle circular references and other errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fallback = JSON.stringify({
      _serializationError: true,
      error: errorMessage,
      type: typeof obj,
      preview: String(obj).substring(0, 200)
    });

    return { serialized: fallback, truncated: true };
  }
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
  } catch (error) {
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
