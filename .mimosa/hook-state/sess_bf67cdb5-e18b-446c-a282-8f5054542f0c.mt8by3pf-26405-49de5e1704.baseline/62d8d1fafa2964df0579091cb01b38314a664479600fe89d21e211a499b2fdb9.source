/**
 * Cursor Signing for Pagination Security
 *
 * Prevents SQL injection and cursor tampering by signing pagination cursors
 * with HMAC-SHA256. Tampered cursors are rejected before database queries.
 *
 * Security Features:
 * - HMAC-SHA256 signature prevents tampering
 * - Base64url encoding (URL-safe, no padding)
 * - Constant-time signature verification
 * - Opaque cursor format (no exposed internals)
 *
 * Cursor Format:
 * ```
 * base64url(json_payload).base64url(hmac_signature)
 * ```
 *
 * Usage:
 * ```typescript
 * const cursor = createCursor({ limit: 50, offset: 100 });
 * const payload = verifyCursor<{ limit: number; offset: number }>(cursor);
 * ```
 *
 * Environment Variables Required:
 * - CURSOR_SIGNING_KEY: Secret key for HMAC (min 32 bytes recommended)
 *
 * @module server/lib/crypto/cursor-signing
 */

import { createHmac, timingSafeEqual } from 'crypto';

const SIGNING_KEY_ENV = 'CURSOR_SIGNING_KEY';
const HMAC_ALGORITHM = 'sha256';

/**
 * Get cursor signing key from environment
 *
 * @throws Error if CURSOR_SIGNING_KEY is not configured
 */
function getSigningKey(): string {
  const key = process.env[SIGNING_KEY_ENV];

  if (!key) {
    throw new Error(
      `${SIGNING_KEY_ENV} environment variable is required for cursor signing`
    );
  }

  if (key.length < 32) {
    throw new Error(
      `${SIGNING_KEY_ENV} must be at least 32 characters for secure signing`
    );
  }

  return key;
}

/**
 * Base64url encode (URL-safe, no padding)
 */
function base64urlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64url decode
 */
function base64urlDecode(str: string): Buffer {
  // Add back padding
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
  return Buffer.from(base64, 'base64');
}

/**
 * Compute HMAC signature for payload
 */
function computeSignature(payload: string): string {
  const key = getSigningKey();
  const hmac = createHmac(HMAC_ALGORITHM, key);
  hmac.update(payload);
  return base64urlEncode(hmac.digest());
}

/**
 * Create a signed cursor from payload
 *
 * @param payload - Arbitrary JSON-serializable cursor data
 * @returns Signed cursor string (base64url format)
 *
 * @example
 * ```typescript
 * const cursor = createCursor({ afterId: 123, limit: 50 });
 * // Returns: "eyJhZnRlcklkIjoxMjMsImxpbWl0Ijo1MH0.aGFzaA"
 * ```
 */
export function createCursor<T>(payload: T): string {
  const json = JSON.stringify(payload);
  const encodedPayload = base64urlEncode(Buffer.from(json, 'utf8'));
  const signature = computeSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

/**
 * Verify and decode a signed cursor
 *
 * @param cursor - Signed cursor string
 * @returns Decoded payload if signature is valid
 * @throws Error if cursor is invalid or signature doesn't match
 *
 * @example
 * ```typescript
 * const payload = verifyCursor<{ afterId: number; limit: number }>(cursor);
 * // Returns: { afterId: 123, limit: 50 }
 * ```
 */
export function verifyCursor<T>(cursor: string): T {
  const parts = cursor.split('.');

  if (parts.length !== 2) {
    throw new Error('Invalid cursor format: must contain exactly one dot separator');
  }

  const [encodedPayload, providedSignature] = parts;

  if (!encodedPayload || !providedSignature) {
    throw new Error('Invalid cursor format: missing payload or signature');
  }

  // Compute expected signature
  const expectedSignature = computeSignature(encodedPayload);

  // Constant-time comparison to prevent timing attacks
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length) {
    throw new Error('Invalid cursor signature: length mismatch');
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('Invalid cursor signature: verification failed');
  }

  // Signature is valid, decode payload
  try {
    const json = base64urlDecode(encodedPayload).toString('utf8');
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(
      `Invalid cursor payload: ${error instanceof Error ? error.message : 'malformed JSON'}`
    );
  }
}

/**
 * Check if cursor signing is configured
 *
 * @returns True if CURSOR_SIGNING_KEY is set
 */
export function isCursorSigningConfigured(): boolean {
  return !!process.env[SIGNING_KEY_ENV] && process.env[SIGNING_KEY_ENV]!.length >= 32;
}

/**
 * Validate cursor format without verifying signature
 * (useful for pre-flight checks)
 *
 * @returns True if cursor has valid format (payload.signature)
 */
export function hasValidCursorFormat(cursor: string): boolean {
  const parts = cursor.split('.');
  return parts.length === 2 && !!parts[0] && !!parts[1];
}
