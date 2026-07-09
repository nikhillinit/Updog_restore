/**
 * JWT Authentication for Flag Admin API
 * Production-grade token validation with RS256/JWKS and strict validation
 *
 * Supports both HS256 (symmetric) and RS256 (asymmetric) algorithms:
 * - HS256: Uses JWT_SECRET for signing and verification
 * - RS256: Uses JWKS endpoint (JWT_JWKS_URL) for public key retrieval
 *
 * Uses unified Express.User interface from types/express.d.ts
 */

import type { Algorithm, JwtPayload } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { parseFundIdParam } from '@shared/number';
import { getConfig } from '../../config';
import { authMetrics } from '../../telemetry';
import { firstString } from '../request-values';

export type JWTClaims = JwtPayload & {
  sub: string;
  role?: string;
  email?: string;
  fundIds?: number[];
  orgId?: string;
  org_id?: string;
  lpId?: number; // LP-specific: Limited Partner ID for LP role users
};

function getJwtConfig() {
  return getConfig();
}

// JWKS client singleton for RS256 (lazy initialized)
type JwksClientInstance = import('jwks-rsa').JwksClient;
type JwksClientOptions = import('jwks-rsa').Options;
type JwksClientFactory = (options: JwksClientOptions) => JwksClientInstance;
type JwksRsaModule = {
  default?: JwksClientFactory;
} & JwksClientFactory;

let jwksClientPromise: Promise<JwksClientInstance> | null = null;

async function createJwksClient(jwksUri: string): Promise<JwksClientInstance> {
  const jwksRsaModule = (await import('jwks-rsa')) as unknown as JwksRsaModule;
  const createJwksClientInstance = jwksRsaModule.default ?? jwksRsaModule;
  return createJwksClientInstance({
    jwksUri,
    cache: true,
    cacheMaxAge: 600000, // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });
}

function getJwksClient(): Promise<JwksClientInstance> {
  if (jwksClientPromise) {
    return jwksClientPromise;
  }

  const cfg = getJwtConfig();
  if (!cfg.JWT_JWKS_URL) {
    throw new Error('JWKS client not initialized - JWT_JWKS_URL required for RS256');
  }

  jwksClientPromise = createJwksClient(cfg.JWT_JWKS_URL).catch((err: unknown) => {
    jwksClientPromise = null;
    throw err;
  });
  return jwksClientPromise;
}

/**
 * Get signing key from JWKS endpoint for RS256 verification
 */
async function getSigningKey(kid: string): Promise<string> {
  const client = await getJwksClient();
  const key = await client.getSigningKey(kid);
  return key.getPublicKey();
}

/**
 * Verify JWT token - supports both HS256 and RS256 algorithms
 *
 * For HS256: Synchronous verification using JWT_SECRET
 * For RS256: Async verification using JWKS public keys
 */
export function verifyAccessToken(token: string): JWTClaims {
  const cfg = getJwtConfig();
  if (cfg.JWT_ALG === 'HS256') {
    const verified = jwt.verify(token, cfg.JWT_SECRET!, {
      algorithms: ['HS256' as Algorithm],
      issuer: cfg.JWT_ISSUER,
      audience: cfg.JWT_AUDIENCE,
    });
    return verified as JWTClaims;
  }

  // RS256: Need to handle async key retrieval
  // For sync API compatibility, we throw here and use verifyAccessTokenAsync for RS256
  throw new Error('Use verifyAccessTokenAsync for RS256');
}

/**
 * Async token verification - required for RS256 with JWKS
 * Falls back to sync verification for HS256
 */
export async function verifyAccessTokenAsync(token: string): Promise<JWTClaims> {
  const cfg = getJwtConfig();
  if (cfg.JWT_ALG === 'HS256') {
    return verifyAccessToken(token);
  }

  // RS256: Decode header to get kid, then fetch public key
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('Invalid token: missing kid in header');
  }

  const publicKey = await getSigningKey(decoded.header.kid);
  const verified = jwt.verify(token, publicKey, {
    algorithms: ['RS256' as Algorithm],
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
  });

  return verified as JWTClaims;
}

type FundIdsParseResult = { valid: true; fundIds: number[] } | { valid: false; reason: string };

function parseFundIds(value: unknown): FundIdsParseResult {
  if (value == null) {
    return { valid: true, fundIds: [] };
  }

  if (!Array.isArray(value)) {
    return { valid: false, reason: 'fundIds must be an array' };
  }

  const fundIds: number[] = [];
  for (const fundId of value) {
    if (typeof fundId !== 'number' || !Number.isInteger(fundId)) {
      return { valid: false, reason: 'fundIds must contain only integer IDs' };
    }
    fundIds.push(fundId);
  }

  return { valid: true, fundIds };
}

function fundIdsFromClaims(value: unknown): number[] {
  const result = parseFundIds(value);
  if (!result.valid) {
    throw new Error(`Invalid JWT fund scope: ${result.reason}`);
  }
  return result.fundIds;
}

/**
 * JWT fund-scope contract:
 * - Missing or empty fundIds means unrestricted admin/service access.
 * - Non-empty fundIds restrict access to the listed fund IDs only.
 *
 * Empty scope is privileged. Issuers must mint fundIds: [] only for trusted
 * admin or service identities, and every route helper must call this function
 * instead of reimplementing the empty-array branch locally.
 */
export function hasFundAccess(fundIds: unknown, fundId: number): boolean {
  const result = parseFundIds(fundIds);
  if (!result.valid) {
    return false;
  }

  return result.fundIds.length === 0 || result.fundIds.includes(fundId);
}

export function userFromClaims(req: Request, claims: JWTClaims): Express.User {
  const role = typeof claims.role === 'string' ? claims.role : undefined;
  const orgId =
    typeof claims.orgId === 'string'
      ? claims.orgId
      : typeof claims.org_id === 'string'
        ? claims.org_id
        : undefined;

  return {
    id: claims.sub,
    sub: claims.sub,
    email: claims.email ?? claims.sub,
    ...(role !== undefined && { role }),
    roles: role ? [role] : [],
    fundIds: fundIdsFromClaims(claims.fundIds),
    ...(orgId !== undefined && { orgId }),
    ...(claims.lpId != null && { lpId: claims.lpId }),
    ip: req.ip || 'unknown',
    userAgent: req.header('user-agent') || 'unknown',
  };
}

/**
 * Assign verified claims to request user object
 */
function assignUserFromClaims(req: Request, claims: JWTClaims): void {
  req.user = userFromClaims(req, claims);
}

function getJwtErrorDetails(err: unknown): { name?: string; message: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }

  return { message: String(err ?? 'Unknown error') };
}

function assignDevelopmentUser(req: Request): void {
  if (req.user) {
    return;
  }

  const cfg = getJwtConfig();
  const developmentUserId = String(cfg.DEFAULT_USER_ID);

  req.user = {
    id: developmentUserId,
    sub: 'dev-user',
    email: 'dev@example.com',
    role: 'admin',
    roles: ['admin'],
    fundIds: [],
    ip: req.ip || 'unknown',
    userAgent: req.header('user-agent') || 'unknown',
  };
}

export const requireAuth = () => async (req: Request, res: Response, next: NextFunction) => {
  const cfg = getJwtConfig();
  const h = req.header('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : undefined;

  if (cfg.NODE_ENV === 'development' && !cfg.REQUIRE_AUTH && !token) {
    assignDevelopmentUser(req);
    return next();
  }

  if (!token) {
    authMetrics.jwtMissingToken.inc?.();
    return res.sendStatus(401);
  }

  try {
    // Use async verification to support both HS256 and RS256
    const claims = await verifyAccessTokenAsync(token);
    assignUserFromClaims(req, claims);
    next();
  } catch (err: unknown) {
    console.warn('JWT verification failed', getJwtErrorDetails(err));
    authMetrics.jwtVerificationFailed.inc?.();
    return res.sendStatus(401);
  }
};

export const requireRole = (role: string) => (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user || user.role !== role) return res.sendStatus(403);
  next();
};

export const requireAnyRole =
  (roles: readonly string[]) => (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (typeof role !== 'string' || !roles.includes(role)) return res.sendStatus(403);
    next();
  };

/**
 * Require user to have access to a specific fund
 * Use after requireAuth to check fund-level permissions
 */
export const requireFundAccess = (req: Request, res: Response, next: NextFunction) => {
  const fundIdParam = firstString(req.params['fundId']);
  const fundId = parseFundIdParam(fundIdParam);

  if (fundId === null) {
    return res.status(400).json({
      error: 'Bad Request',
      message: fundIdParam ? 'Invalid fund ID' : 'Fund ID is required',
    });
  }

  if (hasFundAccess(req.user?.fundIds, fundId)) {
    return next();
  }

  // User doesn't have access to this fund
  return res.status(403).json({
    error: 'Forbidden',
    message: `You do not have access to fund ${fundId}`,
  });
};

export const requireExportFundGrant = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role === 'admin') {
    return next();
  }

  const fundIds = fundIdsFromClaims(req.user?.fundIds);
  if (fundIds.length === 0) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Export routes require an explicit fund grant.',
    });
  }

  return next();
};

export function signToken(data: string | Buffer | object): string {
  const cfg = getJwtConfig();
  return jwt.sign(data, cfg.JWT_SECRET!, {
    algorithm: 'HS256' as Algorithm,
    expiresIn: '7d',
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
  });
}
