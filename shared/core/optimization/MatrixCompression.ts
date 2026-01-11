/**
 * Matrix Compression for MOIC Scenario Storage
 *
 * Compresses large MOIC scenario matrices using Float32Array + zlib for efficient storage and transmission.
 * Critical for performance: 10,000 scenarios × 5 buckets = 50,000 floats = 200KB uncompressed, ~20KB compressed.
 *
 * Design rationale:
 * - Float32 instead of Float64: MOIC precision to 6 decimals sufficient, saves 50% memory
 * - Row-major layout: [s0b0, s0b1, ..., s1b0, s1b1, ...] for cache locality
 * - zlib deflate: ~90% compression ratio for typical MOIC distributions
 * - Browser/Node compatible: works in both environments
 *
 * Performance targets:
 * - Compression: <50ms for 10K scenarios × 5 buckets
 * - Decompression: <30ms for same
 * - Size reduction: >85% compression ratio
 *
 * References:
 * - Float32Array: MDN Web Docs
 * - zlib: Node.js built-in, pako for browser
 */

/**
 * Compressed matrix format with metadata
 */
export interface CompressedMatrix {
  /** Compressed binary data (zlib deflate) */
  data: Uint8Array;

  /** Number of scenarios (rows) */
  numScenarios: number;

  /** Number of buckets (columns) */
  numBuckets: number;

  /** Compression algorithm version */
  version: 1;

  /** Uncompressed size in bytes */
  uncompressedSize: number;

  /** Compressed size in bytes */
  compressedSize: number;
}

/**
 * Validate matrix dimensions
 */
export function validateMatrixDimensions(numScenarios: number, numBuckets: number): void {
  if (!Number.isInteger(numScenarios) || numScenarios <= 0) {
    throw new Error(`Invalid numScenarios: ${numScenarios} (must be positive integer)`);
  }

  if (!Number.isInteger(numBuckets) || numBuckets <= 0) {
    throw new Error(`Invalid numBuckets: ${numBuckets} (must be positive integer)`);
  }

  // Sanity check: prevent absurdly large matrices
  const maxElements = 100_000_000; // 100M floats = 400MB
  const totalElements = numScenarios * numBuckets;

  if (totalElements > maxElements) {
    throw new Error(
      `Matrix too large: ${numScenarios} × ${numBuckets} = ${totalElements} elements (max ${maxElements})`
    );
  }
}

/**
 * Validate MOIC values are finite and non-negative
 */
export function validateMOICValues(matrix: number[][]): void {
  for (let s = 0; s < matrix.length; s++) {
    const scenario = matrix[s];
    if (!Array.isArray(scenario)) {
      throw new Error(`Scenario ${s} is not an array`);
    }

    for (let b = 0; b < scenario.length; b++) {
      const moic = scenario[b];

      if (moic === undefined) {
        throw new Error(`Missing MOIC at scenario ${s}, bucket ${b}`);
      }

      if (!Number.isFinite(moic)) {
        throw new Error(`Invalid MOIC at scenario ${s}, bucket ${b}: ${moic} (must be finite)`);
      }

      if (moic < 0) {
        throw new Error(
          `Negative MOIC at scenario ${s}, bucket ${b}: ${moic} (must be non-negative)`
        );
      }
    }
  }
}

/**
 * Convert 2D MOIC matrix to Float32Array (row-major layout)
 *
 * @param matrix - 2D array of MOIC values [scenario][bucket]
 * @returns Float32Array in row-major order
 */
export function matrixToFloat32(matrix: number[][]): Float32Array {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('Matrix must be non-empty 2D array');
  }

  const numScenarios = matrix.length;
  const firstRow = matrix[0];
  if (!firstRow) {
    throw new Error('Matrix first row is undefined');
  }
  const numBuckets = firstRow.length;

  validateMatrixDimensions(numScenarios, numBuckets);
  validateMOICValues(matrix);

  // Check all rows have same length
  for (let s = 0; s < numScenarios; s++) {
    const row = matrix[s];
    if (!row) {
      throw new Error(`Matrix row ${s} is undefined`);
    }
    if (row.length !== numBuckets) {
      throw new Error(
        `Inconsistent row length at scenario ${s}: expected ${numBuckets}, got ${row.length}`
      );
    }
  }

  // Flatten to row-major Float32Array
  const flat = new Float32Array(numScenarios * numBuckets);
  let idx = 0;

  for (let s = 0; s < numScenarios; s++) {
    const row = matrix[s];
    if (!row) continue; // Already validated above
    for (let b = 0; b < numBuckets; b++) {
      const value = row[b];
      if (value === undefined) continue; // Already validated above
      flat[idx++] = value;
    }
  }

  return flat;
}

/**
 * Convert Float32Array back to 2D MOIC matrix
 *
 * @param flat - Float32Array in row-major order
 * @param numScenarios - Number of scenarios (rows)
 * @param numBuckets - Number of buckets (columns)
 * @returns 2D array [scenario][bucket]
 */
export function float32ToMatrix(
  flat: Float32Array,
  numScenarios: number,
  numBuckets: number
): number[][] {
  validateMatrixDimensions(numScenarios, numBuckets);

  const expectedLength = numScenarios * numBuckets;
  if (flat.length !== expectedLength) {
    throw new Error(`Float32Array length mismatch: expected ${expectedLength}, got ${flat.length}`);
  }

  const matrix: number[][] = [];
  let idx = 0;

  for (let s = 0; s < numScenarios; s++) {
    const scenario: number[] = [];
    for (let b = 0; b < numBuckets; b++) {
      scenario.push(flat[idx++]!);
    }
    matrix.push(scenario);
  }

  return matrix;
}

/**
 * Compress MOIC matrix using Float32Array + zlib
 *
 * @param matrix - 2D array of MOIC values [scenario][bucket]
 * @returns Compressed matrix with metadata
 */
export async function compressMatrix(matrix: number[][]): Promise<CompressedMatrix> {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('Matrix must be non-empty 2D array');
  }

  const numScenarios = matrix.length;
  const firstRow = matrix[0];
  if (!firstRow) {
    throw new Error('Matrix first row is undefined');
  }
  const numBuckets = firstRow.length;

  // Convert to Float32Array
  const flat = matrixToFloat32(matrix);
  const uncompressedSize = flat.byteLength;

  // Compress using zlib (Node.js) or pako (browser)
  let compressed: Uint8Array;

  if (typeof process !== 'undefined' && process.versions?.node) {
    // Node.js environment

    const zlib = await import('zlib');

    const { promisify } = await import('util');

    const deflate = promisify(zlib.deflate);

    const buffer = Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength);

    const compressedBuffer = await deflate(buffer);
    compressed = new Uint8Array(compressedBuffer);
  } else {
    // Browser environment - use pako

    const pako = await import('pako');

    compressed = pako.deflate(new Uint8Array(flat.buffer, flat.byteOffset, flat.byteLength));
  }

  return {
    data: compressed,
    numScenarios,
    numBuckets,
    version: 1,
    uncompressedSize,
    compressedSize: compressed.byteLength,
  };
}

/**
 * Decompress MOIC matrix from compressed format
 *
 * @param compressed - Compressed matrix with metadata
 * @returns 2D array of MOIC values [scenario][bucket]
 */
export async function decompressMatrix(compressed: CompressedMatrix): Promise<number[][]> {
  if (compressed.version !== 1) {
    throw new Error(`Unsupported compression version: ${compressed.version}`);
  }

  validateMatrixDimensions(compressed.numScenarios, compressed.numBuckets);

  // Decompress using zlib (Node.js) or pako (browser)
  let decompressed: Uint8Array;

  if (typeof process !== 'undefined' && process.versions?.node) {
    // Node.js environment

    const zlib = await import('zlib');

    const { promisify } = await import('util');

    const inflate = promisify(zlib.inflate);

    const compressedBuffer = Buffer.from(compressed.data);

    const decompressedBuffer = await inflate(compressedBuffer);
    decompressed = new Uint8Array(decompressedBuffer);
  } else {
    // Browser environment - use pako

    const pako = await import('pako');

    decompressed = pako.inflate(compressed.data);
  }

  // Verify decompressed size
  if (decompressed.byteLength !== compressed.uncompressedSize) {
    throw new Error(
      `Decompression size mismatch: expected ${compressed.uncompressedSize}, got ${decompressed.byteLength}`
    );
  }

  // Convert back to Float32Array
  const flat = new Float32Array(
    decompressed.buffer,
    decompressed.byteOffset,
    decompressed.byteLength / 4
  );

  // Convert to 2D matrix
  return float32ToMatrix(flat, compressed.numScenarios, compressed.numBuckets);
}

/**
 * Calculate compression ratio (percentage)
 *
 * @param compressed - Compressed matrix with metadata
 * @returns Compression ratio as percentage (e.g., 0.12 = 88% reduction)
 */
export function compressionRatio(compressed: CompressedMatrix): number {
  if (compressed.uncompressedSize === 0) return 0;
  return compressed.compressedSize / compressed.uncompressedSize;
}

/**
 * Format compression statistics for logging
 *
 * @param compressed - Compressed matrix with metadata
 * @returns Human-readable compression stats
 */
export function formatCompressionStats(compressed: CompressedMatrix): string {
  const ratio = compressionRatio(compressed);
  const reduction = (1 - ratio) * 100;

  return (
    `Compressed ${compressed.numScenarios}×${compressed.numBuckets} matrix: ` +
    `${(compressed.uncompressedSize / 1024).toFixed(1)}KB → ${(compressed.compressedSize / 1024).toFixed(1)}KB ` +
    `(${reduction.toFixed(1)}% reduction, ratio ${ratio.toFixed(3)})`
  );
}

/**
 * Serialize compressed matrix to JSON-safe format
 *
 * @param compressed - Compressed matrix
 * @returns JSON-serializable object
 */
export function serializeCompressedMatrix(compressed: CompressedMatrix): {
  data: number[];
  numScenarios: number;
  numBuckets: number;
  version: number;
  uncompressedSize: number;
  compressedSize: number;
} {
  return {
    data: Array.from(compressed.data),
    numScenarios: compressed.numScenarios,
    numBuckets: compressed.numBuckets,
    version: compressed.version,
    uncompressedSize: compressed.uncompressedSize,
    compressedSize: compressed.compressedSize,
  };
}

/**
 * Deserialize compressed matrix from JSON format
 *
 * @param serialized - JSON-serialized compressed matrix
 * @returns CompressedMatrix
 */
export function deserializeCompressedMatrix(serialized: {
  data: number[];
  numScenarios: number;
  numBuckets: number;
  version: number;
  uncompressedSize: number;
  compressedSize: number;
}): CompressedMatrix {
  return {
    data: new Uint8Array(serialized.data),
    numScenarios: serialized.numScenarios,
    numBuckets: serialized.numBuckets,
    version: serialized.version as 1,
    uncompressedSize: serialized.uncompressedSize,
    compressedSize: serialized.compressedSize,
  };
}
