/**
 * JSON Diff Utility
 *
 * Computes differences between two JSON objects for version comparison.
 */

// ============================================================================
// Types
// ============================================================================

export type ChangeType = 'added' | 'removed' | 'modified';

export interface DiffEntry {
  path: string;
  changeType: ChangeType;
  baseValue?: unknown;
  comparisonValue?: unknown;
}

export interface DiffResult {
  addedKeys: string[];
  removedKeys: string[];
  modifiedKeys: string[];
  details: DiffEntry[];
  totalChanges: number;
}

// ============================================================================
// Diff Computation
// ============================================================================

/**
 * Compare two objects and return their differences
 *
 * @param base - The base object to compare from
 * @param comparison - The comparison object to compare to
 * @param prefix - Path prefix for nested keys (internal use)
 * @returns DiffResult with categorized changes
 */
export function computeDiff(
  base: Record<string, unknown>,
  comparison: Record<string, unknown>,
  prefix: string = ''
): DiffResult {
  const addedKeys: string[] = [];
  const removedKeys: string[] = [];
  const modifiedKeys: string[] = [];
  const details: DiffEntry[] = [];

  const baseKeys = new Set(Object.keys(base));
  const comparisonKeys = new Set(Object.keys(comparison));

  // Find added keys (in comparison but not in base)
  for (const key of comparisonKeys) {
    if (!baseKeys.has(key)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      addedKeys.push(fullPath);
      details.push({
        path: fullPath,
        changeType: 'added',
        comparisonValue: comparison[key],
      });
    }
  }

  // Find removed keys (in base but not in comparison)
  for (const key of baseKeys) {
    if (!comparisonKeys.has(key)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      removedKeys.push(fullPath);
      details.push({
        path: fullPath,
        changeType: 'removed',
        baseValue: base[key],
      });
    }
  }

  // Find modified keys (in both but different values)
  for (const key of baseKeys) {
    if (comparisonKeys.has(key)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const baseValue = base[key];
      const comparisonValue = comparison[key];

      if (isObject(baseValue) && isObject(comparisonValue)) {
        // Recursively diff nested objects
        const nestedDiff = computeDiff(
          baseValue as Record<string, unknown>,
          comparisonValue as Record<string, unknown>,
          fullPath
        );
        addedKeys.push(...nestedDiff.addedKeys);
        removedKeys.push(...nestedDiff.removedKeys);
        modifiedKeys.push(...nestedDiff.modifiedKeys);
        details.push(...nestedDiff.details);
      } else if (!isEqual(baseValue, comparisonValue)) {
        modifiedKeys.push(fullPath);
        details.push({
          path: fullPath,
          changeType: 'modified',
          baseValue,
          comparisonValue,
        });
      }
    }
  }

  return {
    addedKeys,
    removedKeys,
    modifiedKeys,
    details,
    totalChanges: addedKeys.length + removedKeys.length + modifiedKeys.length,
  };
}

/**
 * Check if a value is a plain object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep equality check for primitive values and arrays
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => isEqual(item, b[index]));
  }

  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => isEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Get a summary of changes for display
 */
export function getDiffSummary(diff: DiffResult): string {
  const parts: string[] = [];

  if (diff.addedKeys.length > 0) {
    parts.push(`+${diff.addedKeys.length} added`);
  }
  if (diff.removedKeys.length > 0) {
    parts.push(`-${diff.removedKeys.length} removed`);
  }
  if (diff.modifiedKeys.length > 0) {
    parts.push(`~${diff.modifiedKeys.length} modified`);
  }

  return parts.length > 0 ? parts.join(', ') : 'No changes';
}
