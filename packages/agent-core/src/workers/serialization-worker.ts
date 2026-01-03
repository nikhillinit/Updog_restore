/**
 * Worker thread for offloading JSON serialization from the main event loop
 *
 * This worker runs in a separate thread pool to prevent blocking on large objects.
 * Piscina automatically manages thread lifecycle and work distribution.
 */

import { parentPort } from 'worker_threads';

export interface SerializationTask {
  obj: unknown;
  pretty?: boolean;
  maxSize?: number;
  truncate?: boolean;
}

export interface SerializationWorkerResult {
  serialized: string;
  truncated: boolean;
  originalSize?: number;
  error?: string;
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
 * Main worker function - exported for Piscina
 * This runs in a worker thread, preventing event loop blocking
 */
export default function serializeInWorker(task: SerializationTask): SerializationWorkerResult {
  const { obj, pretty = false, maxSize = 50000, truncate = true } = task;

  try {
    // Serialize the object (this runs in worker thread, not main event loop)
    let serialized = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
    const originalSize = serialized.length;

    // Check if truncation is needed
    if (serialized.length > maxSize && truncate) {
      // Truncate and add metadata
      const truncatedObj = {
        _truncated: true,
        _originalSize: originalSize,
        _maxSize: maxSize,
        preview: serialized.substring(0, maxSize - 200),
        summary: generateSummary(obj)
      };

      serialized = JSON.stringify(truncatedObj, null, pretty ? 2 : 0);

      return {
        serialized,
        truncated: true,
        originalSize
      };
    }

    return {
      serialized,
      truncated: false
    };

  } catch (error: unknown) {
    // Handle circular references and other serialization errors
    const errorMessage = error instanceof Error ? error.message : String(error);

    const fallback = JSON.stringify({
      _serializationError: true,
      error: errorMessage,
      type: typeof obj,
      preview: String(obj).substring(0, 200)
    });

    return {
      serialized: fallback,
      truncated: true,
      error: errorMessage
    };
  }
}

// Support for direct worker_threads usage (if not using Piscina)
if (parentPort) {
  parentPort.on('message', (task: SerializationTask) => {
    const result = serializeInWorker(task);
    parentPort?.postMessage(result);
  });
}
