import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Integration test authentication utilities
 *
 * Provides JWT token generation with correct claims structure for integration tests.
 * All tokens include required fields: iss, aud, email (per server/middleware/jwt.ts).
 *
 * SECURITY: Only available in NODE_ENV=test
 */

// Server requires min 32 chars (server/config.ts:16)
const JWT_SECRET =
  process.env.JWT_SECRET ||
  'test-jwt-secret-must-be-at-least-32-characters-long-for-hs256-validation';

const HMAC_SECRET =
  process.env.ALERTMANAGER_WEBHOOK_SECRET ||
  'test-alertmanager-webhook-secret-minimum-32-characters-long';

// Required by verifyAccessToken (server/middleware/jwt.ts:32-33)
const JWT_ISSUER = process.env.JWT_ISSUER || 'updog-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'updog-client';

// Security gate
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Integration auth utilities only available in NODE_ENV=test');
}

interface JwtPayload {
  userId?: string;
  email?: string; // REQUIRED by verifyAccessToken
  role?: 'flag_read' | 'flag_admin' | 'user' | 'lp'; // CORRECT roles (NOT 'admin')
  orgId?: string;
  org_id?: string;
  permissions?: string[];
  fundIds?: number[]; // Funds the user has access to
  lpId?: number; // LP-specific: Limited Partner ID for LP role users
}

const DEFAULT_TEST_ORG_ID = process.env.TEST_ORG_ID || '00000000-0000-0000-0000-000000000001';

/**
 * Generate a test JWT token with correct claims structure
 *
 * @param payload - Token payload (email, role, etc.)
 * @returns Signed JWT token
 */
export function makeJwt(payload: JwtPayload = {}) {
  const orgId = payload.orgId || payload.org_id || DEFAULT_TEST_ORG_ID;

  return jwt.sign(
    {
      sub: payload.userId || 'test-user-123',
      email: payload.email || 'test@example.com', // REQUIRED
      role: payload.role || 'user',
      orgId, // Backward-compatible claim
      org_id: orgId, // Required by secure-context middleware
      permissions: payload.permissions,
      fundIds: payload.fundIds || [1, 2, 3], // Default access to common test funds
      lpId: payload.lpId, // LP-specific: include if provided
    },
    JWT_SECRET,
    {
      expiresIn: '1h',
      algorithm: 'HS256',
      issuer: JWT_ISSUER, // REQUIRED by verifyAccessToken
      audience: JWT_AUDIENCE, // REQUIRED by verifyAccessToken
    }
  );
}

/**
 * Generate admin token (flag_admin role)
 * Grants access to /api/flags/admin endpoints
 */
export const asFlagAdmin = () =>
  makeJwt({
    role: 'flag_admin',
    email: 'admin@example.com',
    userId: 'admin-user',
  });

/**
 * Generate read-only token (flag_read role)
 * Grants read access to flag endpoints
 */
export const asFlagRead = () =>
  makeJwt({
    role: 'flag_read',
    email: 'reader@example.com',
    userId: 'read-user',
  });

/**
 * Generate regular user token
 * Basic authenticated access
 */
export const asUser = () =>
  makeJwt({
    role: 'user',
    email: 'user@example.com',
    userId: 'regular-user',
  });

/**
 * Generate LP (Limited Partner) token
 * Grants access to LP reporting endpoints
 *
 * @param lpId - Limited Partner ID (defaults to 1)
 * @param fundIds - Fund IDs this LP has access to (defaults to [1, 2])
 */
export const asLP = (lpId: number = 1, fundIds: number[] = [1, 2]) =>
  makeJwt({
    role: 'lp',
    email: `lp${lpId}@example.com`,
    userId: `lp-user-${lpId}`,
    lpId,
    fundIds,
  });

/**
 * Create Alertmanager webhook HMAC signature
 *
 * Used for ops endpoint authentication (/_ops/stage-validation/auto-downgrade)
 * Signature header: X-Alertmanager-Signature
 *
 * @param body - Request body object
 * @returns HMAC-SHA256 signature hex string
 */
export function createAlertmanagerSignature(body: object): string {
  const raw = JSON.stringify(body);
  return crypto.createHmac('sha256', HMAC_SECRET).update(raw).digest('hex');
}
