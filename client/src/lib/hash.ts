/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
// client/src/lib/hash.ts
/**
 * Simple FNV-1a hash for stable key generation
 * Fast and good enough for client-side deduplication
 */
export async function stableHash(data: unknown): Promise<string> {
  const str = JSON.stringify(data, Object.keys(data as any).sort());
  
  // FNV-1a hash implementation
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  
  // Convert to hex string
  return (hash >>> 0).toString(16);
}

/**
 * Alternative: Use Web Crypto API for stronger hash (if needed)
 */
export async function sha256Hash(data: unknown): Promise<string> {
  const str = JSON.stringify(data, Object.keys(data as any).sort());
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

