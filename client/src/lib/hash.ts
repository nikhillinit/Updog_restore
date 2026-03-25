// client/src/lib/hash.ts
/**
 * Simple FNV-1a hash for stable key generation
 * Fast and good enough for client-side deduplication
 */
import { stableSerialize } from './stable-serialize';

export async function stableHash(data: unknown): Promise<string> {
  const str = stableSerialize(data);

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
  const str = stableSerialize(data);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
