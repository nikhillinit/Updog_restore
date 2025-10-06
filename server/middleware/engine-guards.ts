/**
 * engine-guards.ts
 * Deep guard to ensure no NaN/Infinity escapes in API responses.
 *
 * Usage (Express):
 *   const g = assertFiniteDeep(result);
 *   if (!g.ok) return res.status(422).json({ error: 'ENGINE_NONFINITE', path: g.path });
 */

export type GuardFailureReason = 'non-finite-number' | 'too-deep' | 'too-broad';

export type GuardResult =
  | { ok: true }
  | { ok: false; path: string; value: unknown; reason: GuardFailureReason };

export interface GuardOptions {
  /** Max object/array nesting depth (default: 50) */
  maxDepth?: number;
  /** Max entries to scan per object/array level to avoid O(n^2) scans (default: 200) */
  maxBreadth?: number;
}

const isPlainObject = (v: unknown) =>
  Object.prototype.toString.call(v) === '[object Object]';

const isTypedArray = (v: unknown) =>
  typeof ArrayBuffer !== 'undefined' &&
  ArrayBuffer.isView(v as any) &&
  Object.prototype.toString.call(v) !== '[object DataView]';

/** Returns true if v is a number and non-finite (NaN, +∞, -∞). */
const isNonFiniteNumber = (v: unknown) =>
  typeof v === 'number' && (!Number.isFinite(v) || Number.isNaN(v));

/** Deeply verifies that there are no non-finite numbers (NaN/±Infinity) in the value. */
export function assertFiniteDeep(
  input: unknown,
  opts: GuardOptions = {},
): GuardResult {
  const maxDepth = opts.maxDepth ?? 50;
  const maxBreadth = opts.maxBreadth ?? 200;

  // Primitives fast path
  if (isNonFiniteNumber(input)) {
    return { ok: false, path: '$', value: input, reason: 'non-finite-number' };
  }
  if (input == null || typeof input !== 'object') return { ok: true };

  const seen = new WeakSet<object>();
  type Frame = { v: unknown; path: string; depth: number };
  const stack: Frame[] = [{ v: input, path: '$', depth: 0 }];

  while (stack.length) {
    const frame = stack.pop();
    if (!frame) break; // defensive in case of concurrent mutation
    const { v, path, depth } = frame;

    if (depth > maxDepth) {
      return { ok: false, path, value: v, reason: 'too-deep' };
    }
    if (v == null) continue;

    // Numbers
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Number.isNaN(v)) {
        return { ok: false, path, value: v, reason: 'non-finite-number' };
      }
      continue;
    }

    // Objects / Arrays / Maps / Sets / TypedArrays
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;

      if (seen.has(o)) continue;
      seen.add(o);

      if (Array.isArray(o)) {
        if (o.length > maxBreadth) {
          // Still spot-check breadth slice, but fail as too-broad to be safe
          for (let i = 0; i < Math.min(o.length, maxBreadth); i++) {
            stack.push({ v: o[i], path: `${path}[${i}]`, depth: depth + 1 });
          }
          return { ok: false, path, value: v, reason: 'too-broad' };
        }
        for (let i = 0; i < o.length; i++) {
          stack.push({ v: o[i], path: `${path}[${i}]`, depth: depth + 1 });
        }
        continue;
      }

      if (isTypedArray(o)) {
        const arr = o as unknown as { length: number; [idx: number]: number };
        const len = (arr.length ?? 0) as number;
        for (let i = 0; i < Math.min(len, maxBreadth); i++) {
          const val = arr[i];
          if (!Number.isFinite(val) || Number.isNaN(val)) {
            return { ok: false, path: `${path}[${i}]`, value: val, reason: 'non-finite-number' };
          }
        }
        continue;
      }

      if (o instanceof Map) {
        let i = 0;
        o.forEach((val: any, k: any) => {
          if (i++ > maxBreadth) {
            return;
          }
          stack.push({
            v: val,
            path: `${path}.(map:${String(k)})`,
            depth: depth + 1,
          });
        });
        if (o.size > maxBreadth) {
          return { ok: false, path, value: v, reason: 'too-broad' };
        }
        continue;
      }

      if (o instanceof Set) {
        let i = 0;
        o.forEach((val: any) => {
          if (i < maxBreadth) {
            stack.push({ v: val, path: `${path}.(set:${i})`, depth: depth + 1 });
          }
          i++;
        });
        if (o.size > maxBreadth) {
          return { ok: false, path, value: v, reason: 'too-broad' };
        }
        continue;
      }

      if (isPlainObject(o)) {
        const entries = Object.entries(o);
        if (entries.length > maxBreadth) {
          for (let i = 0; i < Math.min(entries.length, maxBreadth); i++) {
            const [k, val] = entries[i];
            stack.push({ v: val, path: `${path}.${k}`, depth: depth + 1 });
          }
          return { ok: false, path, value: v, reason: 'too-broad' };
        }
        for (const [k, val] of entries) {
          stack.push({ v: val, path: `${path}.${k}`, depth: depth + 1 });
        }
      }
    }
  }

  return { ok: true };
}

/** Throws an Error with path & reason if non-finite is found. */
export function assertFiniteDeepOrThrow(
  input: unknown,
  opts?: GuardOptions,
): void {
  const res = assertFiniteDeep(input, opts);
  if (!res.ok) {
    // TypeScript needs explicit type narrowing here
    const failureResult = res as { ok: false; path: string; value: unknown; reason: GuardFailureReason };
    const { path, reason, value } = failureResult;
    const v = typeof value === 'number' ? String(value) : '[complex]';
    throw new Error(`Non-finite guard failed at ${path} (${reason}): ${v}`);
  }
}