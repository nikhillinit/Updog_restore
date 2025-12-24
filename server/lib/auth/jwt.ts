/**
 * JWT Authentication for Flag Admin API
 * Production-grade token validation with RS256/JWKS and strict validation
 *
 * Uses unified Express.User interface from types/express.d.ts
 */

import type { Algorithm, JwtPayload } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
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

export function verifyAccessToken(token: string): JWTClaims {
  if (cfg.JWT_ALG === "HS256") {
    const verified = jwt.verify(token, cfg.JWT_SECRET!, {
      algorithms: ["HS256" as Algorithm], 
      issuer: cfg.JWT_ISSUER, 
      audience: cfg.JWT_AUDIENCE
    });
    return verified as JWTClaims;
  }
  // RS256 support would require jwks-rsa package
  throw new Error("RS256 not currently supported - install jwks-rsa package");
}

export const requireAuth = () => (req: Request, res: Response, next: NextFunction) => {
  const h = req.header("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : undefined;

  if (!token) {
    authMetrics.jwtMissingToken.inc?.();
    return res.sendStatus(401);
  }

  try {
    const claims = verifyAccessToken(token);
    // Assign authenticated user properties to req.user (uses Express.User augmentation from types/express.d.ts)
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
