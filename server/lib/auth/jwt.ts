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
import jwksClient from 'jwks-rsa';
import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../../config';
import { authMetrics } from '../../telemetry';

export type JWTClaims = JwtPayload & {
  sub: string;
  role?: string;
  email?: string;
  fundIds?: number[];
  lpId?: number; // LP-specific: Limited Partner ID for LP role users
};

const cfg = getConfig();

// JWKS client singleton for RS256 (lazy initialized)
let jwksClientInstance: jwksClient.JwksClient | null = null;

function getJwksClient(): jwksClient.JwksClient {
  if (!jwksClientInstance && cfg.JWT_JWKS_URL) {
    jwksClientInstance = jwksClient({
      jwksUri: cfg.JWT_JWKS_URL,
      cache: true,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  if (!jwksClientInstance) {
    throw new Error('JWKS client not initialized - JWT_JWKS_URL required for RS256');
  }
  return jwksClientInstance;
}

/**
 * Get signing key from JWKS endpoint for RS256 verification
 */
async function getSigningKey(kid: string): Promise<string> {
  const client = getJwksClient();
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
  if (cfg.JWT_ALG === "HS256") {
    const verified = jwt.verify(token, cfg.JWT_SECRET!, {
      algorithms: ["HS256" as Algorithm],
      issuer: cfg.JWT_ISSUER,
      audience: cfg.JWT_AUDIENCE
    });
    return verified as JWTClaims;
  }

  // RS256: Need to handle async key retrieval
  // For sync API compatibility, we throw here and use verifyAccessTokenAsync for RS256
  throw new Error("Use verifyAccessTokenAsync for RS256");
}

/**
 * Async token verification - required for RS256 with JWKS
 * Falls back to sync verification for HS256
 */
export async function verifyAccessTokenAsync(token: string): Promise<JWTClaims> {
  if (cfg.JWT_ALG === "HS256") {
    return verifyAccessToken(token);
  }

  // RS256: Decode header to get kid, then fetch public key
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('Invalid token: missing kid in header');
  }

  const publicKey = await getSigningKey(decoded.header.kid);
  const verified = jwt.verify(token, publicKey, {
    algorithms: ["RS256" as Algorithm],
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
  });

  return verified as JWTClaims;
}

/**
 * Assign verified claims to request user object
 */
function assignUserFromClaims(req: Request, claims: JWTClaims): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  (req as any).user = {
    id: claims.sub,
    sub: claims.sub,
    email: claims.email ?? claims.sub,
    role: claims.role,
    roles: claims.role ? [claims.role] : [],
    fundIds: claims.fundIds || [],
    lpId: claims.lpId, // LP-specific: attach if present in token
    ip: req.ip || 'unknown',
    userAgent: req.header("user-agent") || 'unknown',
  };
}

export const requireAuth = () => async (req: Request, res: Response, next: NextFunction) => {
  const h = req.header("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : undefined;

  if (!token) {
    authMetrics.jwtMissingToken.inc?.();
    return res.sendStatus(401);
  }

  try {
    // Use async verification to support both HS256 and RS256
    const claims = await verifyAccessTokenAsync(token);
    assignUserFromClaims(req, claims);
    next();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.warn("JWT verification failed", { name: err?.name, message: err?.message });
    authMetrics.jwtVerificationFailed.inc?.();
    return res.sendStatus(401);
  }
};

export const requireRole = (role: string) => (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user || user.role !== role) return res.sendStatus(403);
  next();
};

/**
 * Require user to have access to a specific fund
 * Use after requireAuth to check fund-level permissions
 */
export const requireFundAccess = (req: Request, res: Response, next: NextFunction) => {
  const fundIdParam = req.params['fundId'];

  if (!fundIdParam) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Fund ID is required',
    });
  }

  const fundId = parseInt(fundIdParam, 10);

  if (isNaN(fundId)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid fund ID',
    });
  }

  // Check if user has access to this fund
  const userFundIds = req.user?.fundIds || [];

  // Empty fundIds array means access to all funds (admin/superuser pattern)
  if (userFundIds.length === 0) {
    return next();
  }

  if (userFundIds.includes(fundId)) {
    return next();
  }

  // User doesn't have access to this fund
  return res.status(403).json({
    error: 'Forbidden',
    message: `You do not have access to fund ${fundId}`,
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function signToken(data: any): string {
  const cfg = getConfig();
  return jwt.sign(data, cfg.JWT_SECRET!, {
    algorithm: "HS256" as Algorithm,
    expiresIn: "7d",
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE
  });
}
