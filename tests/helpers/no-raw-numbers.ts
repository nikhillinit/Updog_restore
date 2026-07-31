/**
 * Deep-walk utility that detects raw number values in result objects
 * where canonical decimal strings are required.
 *
 * Engine-independent — no dependency on WP-L2 or internal-economics modules.
 */

/** A single violation found during deep-walk inspection. */
export interface RawNumberViolation {
  /** Dot-delimited path to the offending value, e.g. "totals.carry" */
  path: string;
  /** The raw number value found */
  value: number;
}

/** Result of a no-raw-numbers sweep. */
export interface NoRawNumbersResult {
  /** All paths where typeof value === 'number' was found outside the allowlist */
  violations: RawNumberViolation[];
}

/** Options for the deep-walk sweep. */
export interface NoRawNumbersOptions {
  /**
   * Dot-delimited paths where raw numbers are acceptable.
   * Supports exact match and prefix-wildcard match (trailing ".*");
   * a wildcard also covers array descendants ("rows.*" matches
   * "rows[0].fee").
   * Examples: ["meta.version", "pagination.*"]
   */
  allowlist?: string[];
}

/**
 * Check whether a path is covered by the allowlist.
 *
 * Supports:
 * - Exact match: "meta.version" matches path "meta.version"
 * - Prefix wildcard: "pagination.*" matches "pagination.page", "pagination.total",
 *   and array descendants such as "pagination[0]" or "rows[0].fee" for "rows.*"
 * - Plain prefix without wildcard: "pagination" matches "pagination" only (not children)
 */
function isAllowed(path: string, allowlist: string[]): boolean {
  for (const entry of allowlist) {
    if (entry === path) return true;
    if (entry.endsWith('.*')) {
      const base = entry.slice(0, -2); // "pagination.*" -> "pagination"
      // Object children ("pagination.page") and array descendants
      // ("rows[0].fee") are both covered by the wildcard.
      if (path.startsWith(`${base}.`) || path.startsWith(`${base}[`)) return true;
    }
  }
  return false;
}

/**
 * Recursively walk an arbitrary value, collecting paths where
 * typeof value === 'number'.
 */
function walk(
  value: unknown,
  path: string,
  allowlist: string[],
  violations: RawNumberViolation[]
): void {
  if (value === null || value === undefined) return;

  if (typeof value === 'number') {
    if (!isAllowed(path, allowlist)) {
      violations.push({ path, value });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], `${path}[${i}]`, allowlist, violations);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      walk(child, childPath, allowlist, violations);
    }
  }
}

/**
 * Deep-walk an arbitrary result object and collect all paths where
 * a raw number value exists. Returns a structured result for assertion.
 *
 * @param obj - The object to inspect
 * @param options - Optional configuration (allowlist of paths where numbers are OK)
 * @returns NoRawNumbersResult with violation paths
 *
 * @example
 * ```ts
 * const result = assertNoRawNumbers(engineOutput, {
 *   allowlist: ['meta.version', 'pagination.*'],
 * });
 * expect(result.violations).toEqual([]);
 * ```
 */
export function findRawNumbers(obj: unknown, options?: NoRawNumbersOptions): NoRawNumbersResult {
  const violations: RawNumberViolation[] = [];
  const allowlist = options?.allowlist ?? [];
  walk(obj, '', allowlist, violations);
  return { violations };
}

/**
 * Convenience assertion: throws if any raw numbers are found outside the allowlist.
 * Returns the result for further inspection if needed.
 */
export function assertNoRawNumbers(
  obj: unknown,
  options?: NoRawNumbersOptions
): NoRawNumbersResult {
  const result = findRawNumbers(obj, options);
  if (result.violations.length > 0) {
    const summary = result.violations.map((v) => `  ${v.path}: ${v.value}`).join('\n');
    throw new Error(
      `Found ${result.violations.length} raw number(s) where decimal strings are required:\n${summary}`
    );
  }
  return result;
}
