/**
 * JWT Authentication for Flag Admin API
 * Production-grade token validation with RS256/JWKS and HS256 support
 *
 * Security Features:
 * - Algorithm whitelist enforcement (prevents algorithm spoofing)
 * - JWKS client with automatic key rotation for RS256
 * - Issuer and audience validation
 * - Timing claim checks (exp, nbf, iat) with 30s clock skew tolerance
 * - Fail-fast configuration validation on startup
 */

import { jwtVerify, createRemoteJWKSet, type JWTPayload, type JWTVerifyResult } from 'jose';
import * as jsonwebtoken from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { getAuthConfig } from '../../config/auth';
import { authMetrics } from '../../telemetry';

export type JWTClaims = JWTPayload & {
  sub: string;
  role?: string;
  email?: string;
};

export interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    roles: string[];
    ip: string;
    userAgent: string;
  };
}

/**
 * Custom error class for token validation failures
 */
export class InvalidTokenError extends Error {
  constructor(
    message: string,
    public readonly reason: 'missing' | 'expired' | 'invalid' | 'malformed',
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

// Initialize configuration and clients on module load (fail-fast)
const authConfig = getAuthConfig();

// JWKS client for RS256 (lazy-initialized on first use)
let jwksClient: ReturnType<typeof createRemoteJWKSet> | null = null;

// HMAC secret for HS256 (initialized once)
const hmacSecret = authConfig.secret
  ? new TextEncoder().encode(authConfig.secret)
  : null;

/**
 * Get or create JWKS client for RS256
 * Client is created on first use and cached
 */
function getJWKSClient(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksClient) {
    if (!authConfig.jwksUri) {
      throw new Error('JWKS URI not configured for RS256');
    }

    // Create JWKS client with caching and rotation support
    jwksClient = createRemoteJWKSet(new URL(authConfig.jwksUri), {
      cooldownDuration: 30000, // 30 seconds between refetches
      cacheMaxAge: 600000, // 10 minutes cache
    });
  }
  return jwksClient;
}

/**
 * Verify JWT access token
 *
 * @param token - JWT token string (without 'Bearer ' prefix)
 * @returns Verified JWT claims
 * @throws {InvalidTokenError} If token is invalid, expired, or malformed
 *
 * @example
 * ```typescript
 * try {
 *   const claims = await verifyAccessToken(token);
 *   console.log('User:', claims.sub);
 * } catch (error) {
 *   if (error instanceof InvalidTokenError) {
 *     console.error('Token error:', error.reason);
 *   }
 * }
 * ```
 */
export async function verifyAccessToken(token: string): Promise<JWTClaims> {
  if (!token || token.trim() === '') {
    throw new InvalidTokenError('Token is missing or empty', 'missing');
  }

  const options = {
    issuer: authConfig.issuer,
    audience: authConfig.audience,
    algorithms: [authConfig.algorithm], // CRITICAL: Prevents algorithm spoofing
    clockTolerance: 30, // 30 seconds clock skew tolerance
  };

  try {
    let result: JWTVerifyResult;

    if (authConfig.algorithm === 'RS256') {
      // Verify with JWKS (remote public keys)
      result = await jwtVerify(token, getJWKSClient(), options);
    } else if (authConfig.algorithm === 'HS256') {
      // Verify with HMAC secret
      if (!hmacSecret) {
        throw new Error('HMAC secret not configured for HS256');
      }
      result = await jwtVerify(token, hmacSecret, options);
    } else {
      throw new Error(`Unsupported algorithm: ${authConfig.algorithm}`);
    }

    // Additional validation
    const payload = result.payload as JWTClaims;

    if (!payload.sub) {
      throw new InvalidTokenError('Token missing required "sub" claim', 'invalid');
    }

    return payload;

  } catch (error: any) {
    // Map jose errors to our custom error types
    if (error instanceof InvalidTokenError) {
      throw error;
    }

    if (error.code === 'ERR_JWT_EXPIRED') {
      throw new InvalidTokenError(
        'Token has expired',
        'expired',
        error
      );
    }

    if (error.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
      throw new InvalidTokenError(
        `Token claim validation failed: ${error.message}`,
        'invalid',
        error
      );
    }

    if (error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
      throw new InvalidTokenError(
        'Token signature verification failed',
        'invalid',
        error
      );
    }

    if (error.code?.startsWith('ERR_JW')) {
      throw new InvalidTokenError(
        `Token validation failed: ${error.message}`,
        'malformed',
        error
      );
    }

    // Unknown error
    throw new InvalidTokenError(
      `Token verification failed: ${error.message || 'Unknown error'}`,
      'invalid',
      error
    );
  }
}

/**
 * Express middleware to require JWT authentication
 * Extracts token from Authorization header and validates it
 *
 * @example
 * ```typescript
 * router.get('/protected', requireAuth(), (req, res) => {
 *   const user = (req as AuthenticatedRequest).user;
 *   res.json({ message: `Hello ${user.sub}` });
 * });
 * ```
 */
export const requireAuth = () => (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    authMetrics.jwtMissingToken.inc?.();
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No authentication token provided'
    });
  }

  verifyAccessToken(token)
    .then((claims) => {
      // Attach user info to request
      (req as any).user = {
        sub: claims.sub,
        email: claims.email || '',
        roles: claims.role ? [claims.role] : [],
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
      };
      next();
    })
    .catch((error: InvalidTokenError) => {
      console.warn('JWT verification failed', {
        reason: error.reason,
        message: error.message,
        ip: req.ip,
      });
      authMetrics.jwtVerificationFailed.inc?.();

      const statusCode = error.reason === 'expired' ? 401 : 401;
      return res.status(statusCode).json({
        error: 'Unauthorized',
        message: error.message,
        reason: error.reason,
      });
    });
};

/**
 * Express middleware to require specific role
 * Must be used after requireAuth()
 *
 * @param role - Required role name
 *
 * @example
 * ```typescript
 * router.delete('/admin', requireAuth(), requireRole('admin'), (req, res) => {
 *   // Only users with 'admin' role can access
 * });
 * ```
 */
export const requireRole = (role: string) => (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user as JWTClaims | undefined;

  if (!user || user.role !== role) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `Required role: ${role}`,
    });
  }

  next();
};

/**
 * Sign a new JWT token (for testing or internal use)
 * Note: Only works with HS256 algorithm
 *
 * @param data - Token payload data
 * @returns Signed JWT token string
 * @throws {Error} If algorithm is not HS256 or secret is missing
 *
 * @example
 * ```typescript
 * const token = signToken({ sub: 'user123', role: 'admin' });
 * ```
 */
export function signToken(data: any): string {
  if (authConfig.algorithm !== 'HS256') {
    throw new Error('Token signing only supported with HS256 algorithm');
  }

  if (!authConfig.secret) {
    throw new Error('JWT_SECRET required for token signing');
  }

  return jsonwebtoken.sign(data, authConfig.secret, {
    algorithm: 'HS256',
    expiresIn: '7d',
    issuer: authConfig.issuer,
    audience: authConfig.audience,
  });
}
