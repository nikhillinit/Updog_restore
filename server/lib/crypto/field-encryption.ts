/**
 * Field-Level Encryption for Sensitive PII
 *
 * Provides AES-256-GCM encryption/decryption for database fields containing
 * sensitive personally identifiable information (PII).
 *
 * Security Features:
 * - AES-256-GCM authenticated encryption
 * - Per-field random IV (96-bit nonce)
 * - Authentication tag prevents tampering
 * - PBKDF2 key derivation from master secret
 * - Constant-time MAC verification
 *
 * Usage:
 * ```typescript
 * const encrypted = await encryptField('123-45-6789');
 * const decrypted = await decryptField(encrypted); // '123-45-6789'
 * ```
 *
 * Environment Variables Required:
 * - FIELD_ENCRYPTION_KEY: Base64-encoded 256-bit key or passphrase
 *
 * @module server/lib/crypto/field-encryption
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2 } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = 'sha256';

// Cache for derived keys to avoid repeated PBKDF2
const keyCache = new Map<string, Buffer>();

/**
 * Derive encryption key from environment variable
 *
 * Uses PBKDF2 with 100,000 iterations if passphrase is provided,
 * or directly decodes if already a 256-bit base64 key.
 */
async function getDerivedKey(): Promise<Buffer> {
  const envKey = process.env['FIELD_ENCRYPTION_KEY'];

  if (!envKey) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY environment variable is required for field encryption'
    );
  }

  // Check cache first
  if (keyCache.has(envKey)) {
    return keyCache.get(envKey)!;
  }

  let derivedKey: Buffer;

  // Try to decode as base64 first
  try {
    const decoded = Buffer.from(envKey, 'base64');
    if (decoded.length === KEY_LENGTH) {
      // Valid 256-bit key
      derivedKey = decoded;
    } else {
      // Treat as passphrase and derive key
      const salt = Buffer.from('lp-field-encryption-salt', 'utf8');
      derivedKey = await pbkdf2Async(
        envKey,
        salt,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        PBKDF2_DIGEST
      );
    }
  } catch {
    // Decode failed, treat as passphrase
    const salt = Buffer.from('lp-field-encryption-salt', 'utf8');
    derivedKey = await pbkdf2Async(
      envKey,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST
    );
  }

  keyCache.set(envKey, derivedKey);
  return derivedKey;
}

/**
 * Encrypt a plaintext field value
 *
 * Returns base64-encoded ciphertext with format:
 * [iv:12 bytes][ciphertext:variable][authTag:16 bytes]
 *
 * @param plaintext - The sensitive data to encrypt
 * @returns Base64-encoded encrypted value
 * @throws Error if encryption fails
 */
export async function encryptField(plaintext: string | null): Promise<string | null> {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return null;
  }

  const key = await getDerivedKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: [iv][encrypted][authTag]
  const result = Buffer.concat([iv, encrypted, authTag]);

  return result.toString('base64');
}

/**
 * Decrypt an encrypted field value
 *
 * Expects base64-encoded ciphertext with format:
 * [iv:12 bytes][ciphertext:variable][authTag:16 bytes]
 *
 * @param encrypted - Base64-encoded encrypted value
 * @returns Decrypted plaintext
 * @throws Error if decryption fails or authentication tag is invalid
 */
export async function decryptField(encrypted: string | null): Promise<string | null> {
  if (encrypted === null || encrypted === undefined || encrypted === '') {
    return null;
  }

  const key = await getDerivedKey();
  const buffer = Buffer.from(encrypted, 'base64');

  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted field: data too short');
  }

  // Extract components
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(buffer.length - AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH, buffer.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Check if field encryption is configured
 *
 * @returns True if FIELD_ENCRYPTION_KEY is set
 */
export function isEncryptionConfigured(): boolean {
  return !!process.env['FIELD_ENCRYPTION_KEY'];
}

/**
 * Clear the key cache (useful for testing)
 */
export function clearKeyCache(): void {
  keyCache.clear();
}
