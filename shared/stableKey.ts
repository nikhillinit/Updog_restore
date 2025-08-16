// shared/stableKey.ts
// Utilities for generating stable, canonical keys for deduplication

/**
 * Generate a stable key for an HTTP request.
 * Normalizes URL, sorts query params, and canonicalizes JSON body.
 */
export function stableKeyForRequest(
  url: string,
  init: RequestInit & { method?: string } = {}
): string {
  // Normalize URL with sorted query params
  const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  u.search = new URLSearchParams([...u.searchParams.entries()].sort()).toString();

  const method = (init.method ?? 'GET').toUpperCase();

  // Canonicalize body
  let bodyString = '';
  if (init.body != null) {
    if (typeof init.body === 'string') {
      try {
        // Try to parse and re-stringify for stable ordering
        bodyString = stableStringify(JSON.parse(init.body));
      } catch {
        bodyString = init.body;
      }
    } else if (init.body instanceof FormData) {
      // FormData: sort entries
      const entries: Array<[string, string]> = [];
      init.body.forEach((value, key) => {
        entries.push([key, String(value)]);
      });
      bodyString = JSON.stringify(entries.sort());
    } else if (init.body instanceof URLSearchParams) {
      // URLSearchParams: sort entries
      bodyString = new URLSearchParams([...init.body.entries()].sort()).toString();
    } else {
      // Assume it's an object that needs stable stringification
      bodyString = stableStringify(init.body as any);
    }
  }

  return `${method} ${u.toString()} :: ${bodyString}`;
}

/**
 * Stable JSON stringification with sorted keys.
 * Ensures consistent string representation regardless of key order.
 */
export function stableStringify(value: any): string {
  const seen = new WeakSet();
  
  const walk = (v: any): any => {
    // Handle primitives
    if (v === null || typeof v !== 'object') return v;
    
    // Handle circular references
    if (seen.has(v)) return '[Circular]';
    seen.add(v);

    // Handle arrays
    if (Array.isArray(v)) {
      return v.map(walk);
    }

    // Handle objects: sort keys
    const obj = v as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = walk(obj[key]);
    }
    return sorted;
  };

  return JSON.stringify(walk(value));
}

/**
 * Generate a hash from a string using FNV-1a algorithm.
 * Fast, non-cryptographic hash suitable for deduplication.
 */
export function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Create a compact hash key from request parameters.
 */
export function hashKeyForRequest(
  url: string,
  init?: RequestInit & { method?: string }
): string {
  const stable = stableKeyForRequest(url, init);
  return fnv1aHash(stable);
}