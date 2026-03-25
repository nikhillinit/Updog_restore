/**
 * Safe Path Traversal Utilities
 *
 * Handles edge cases:
 * - "a..b" → ["a", "b"]
 * - "a. b" → ["a", "b"]
 * - "a." → ["a"]
 * - ".a" → ["a"]
 * - "" → []
 * - "arr.0.name" → array index support
 *
 * Features:
 * - Primitive overwrite protection
 * - Array index support (numeric segments)
 * - Type-safe operations
 * - Never throws
 */

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if a string represents an array index
 */
const isIndex = (s: string): boolean => /^\d+$/.test(s);

type PathContainer = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is PathContainer {
  return typeof value === 'object' && value !== null;
}

function createContainer(shouldBeArray: boolean): PathContainer {
  return shouldBeArray ? [] : {};
}

function readContainerValue(container: PathContainer, key: string): unknown {
  if (Array.isArray(container) && isIndex(key)) {
    return container[Number(key)];
  }

  return (container as Record<string, unknown>)[key];
}

function writeContainerValue(container: PathContainer, key: string, value: unknown): void {
  if (Array.isArray(container) && isIndex(key)) {
    container[Number(key)] = value;
    return;
  }

  (container as Record<string, unknown>)[key] = value;
}

function hasContainerValue(container: PathContainer, key: string): boolean {
  if (Array.isArray(container) && isIndex(key)) {
    return Number(key) in container;
  }

  return key in container;
}

function deleteContainerValue(container: PathContainer, key: string): void {
  if (Array.isArray(container) && isIndex(key)) {
    delete container[Number(key)];
    return;
  }

  delete (container as Record<string, unknown>)[key];
}

/**
 * Normalize a dotted path into an array of parts
 *
 * @example
 * normalizePath('a..b')    // ['a', 'b']
 * normalizePath('a. b')    // ['a', 'b']
 * normalizePath('a.')      // ['a']
 * normalizePath('.a')      // ['a']
 * normalizePath('')        // []
 * normalizePath('arr.0')   // ['arr', '0']
 */
export function normalizePath(path: string): string[] {
  return path
    .split('.')
    .map(s => s.trim())
    .filter(Boolean);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Safely set a nested property by path
 *
 * Features:
 * - Creates intermediate objects/arrays as needed
 * - Overwrites primitives with objects/arrays
 * - Supports array indices (numeric segments)
 * - Type-safe return
 *
 * @example
 * const obj = {};
 * deepSet(obj, 'a.b.c', 42);
 * // { a: { b: { c: 42 } } }
 *
 * deepSet(obj, 'arr.0.name', 'Alice');
 * // { arr: [{ name: 'Alice' }] }
 *
 * deepSet(obj, 'a..b', 99);
 * // { a: { b: 99 } }  (double dots normalized)
 */
export function deepSet<T extends object>(
  obj: T,
  path: string,
  value: unknown
): T {
  const parts = normalizePath(path);
  if (!parts.length || !isContainer(obj)) return obj;

  let node: PathContainer = obj;

  // Traverse to second-to-last part, creating structure as needed
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!key) continue;
    const nextKey = parts[i + 1];
    if (!nextKey) continue;
    const shouldBeArray = isIndex(nextKey);
    const currentValue = readContainerValue(node, key);
    let nextNode: PathContainer;

    // Check if current node is not an object or is null
    if (!isContainer(currentValue)) {
      nextNode = createContainer(shouldBeArray);
    } else if (shouldBeArray && !Array.isArray(currentValue)) {
      // Normalize if prior type mismatched (object → array)
      nextNode = [];
    } else if (!shouldBeArray && Array.isArray(currentValue)) {
      // Normalize if prior type mismatched (array → object)
      nextNode = {};
    } else {
      nextNode = currentValue;
    }

    writeContainerValue(node, key, nextNode);
    node = nextNode;
  }

  // Set the final value
  const lastKey = parts[parts.length - 1];
  if (lastKey) {
    writeContainerValue(node, lastKey, value);
  }

  return obj;
}

/**
 * Safely get a nested property by path
 *
 * Features:
 * - Returns undefined (or default) for missing paths
 * - Supports array indices
 * - Type-safe return
 * - Never throws
 *
 * @example
 * const obj = { a: { b: { c: 42 } } };
 * deepGet(obj, 'a.b.c');           // 42
 * deepGet(obj, 'a.b.x');           // undefined
 * deepGet(obj, 'a.b.x', 'default'); // 'default'
 *
 * const arr = { items: [{ name: 'Alice' }] };
 * deepGet(arr, 'items.0.name');    // 'Alice'
 */
export function deepGet<T = unknown>(
  obj: unknown,
  path: string,
  defaultValue?: T
): T | undefined {
  const parts = normalizePath(path);
  if (!parts.length) return defaultValue;

  let node: unknown = obj;
  for (const part of parts) {
    if (!part || !isContainer(node)) return defaultValue;
    node = readContainerValue(node, part);
  }

  return (node ?? defaultValue) as T | undefined;
}

/**
 * Check if a path exists in an object
 *
 * @example
 * const obj = { a: { b: 0 } };
 * deepHas(obj, 'a.b');    // true (even though value is falsy)
 * deepHas(obj, 'a.x');    // false
 */
export function deepHas(obj: unknown, path: string): boolean {
  const parts = normalizePath(path);
  if (!parts.length) return false;

  let node: unknown = obj;
  for (const part of parts) {
    if (!part || !isContainer(node)) return false;
    if (!hasContainerValue(node, part)) return false;
    node = readContainerValue(node, part);
  }

  return true;
}

/**
 * Delete a nested property by path
 *
 * @example
 * const obj = { a: { b: { c: 42 } } };
 * deepDelete(obj, 'a.b.c');
 * // { a: { b: {} } }
 */
export function deepDelete<T extends object>(obj: T, path: string): T {
  const parts = normalizePath(path);
  if (!parts.length || !isContainer(obj)) return obj;

  let node: PathContainer = obj;

  // Traverse to parent
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!part) return obj;
    const nextNode = readContainerValue(node, part);
    if (!isContainer(nextNode)) return obj;
    node = nextNode;
  }

  // Delete the final key
  const lastKey = parts[parts.length - 1];
  if (lastKey) {
    deleteContainerValue(node, lastKey);
  }

  return obj;
}

/**
 * Merge a value at a path (for nested updates)
 *
 * @example
 * const obj = { a: { b: 1, c: 2 } };
 * deepMerge(obj, 'a', { c: 3, d: 4 });
 * // { a: { b: 1, c: 3, d: 4 } }
 */
export function deepMerge<T extends object>(
  obj: T,
  path: string,
  value: Record<string, unknown>
): T {
  const parts = normalizePath(path);
  if (!parts.length) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { ...obj, ...value }
      : obj;
  }

  const existing = deepGet(obj, path);
  const merged =
    typeof existing === 'object' && existing !== null && !Array.isArray(existing)
      ? { ...existing, ...value }
      : value;

  return deepSet(obj, path, merged);
}
