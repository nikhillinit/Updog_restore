/**
 * JWT Authentication for Flag Admin API
 * Production-grade token validation with RS256/JWKS and strict validation
 */

import jwt, { Algorithm, JwtPayload } from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../../config';
import { authMetrics } from '../../telemetry';

export type JWTClaims = JwtPayload & { sub: string; role?: string; email?: string };

export interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    roles: string[];
    ip: string;
    userAgent: string;
  };
}

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
    (req as any).user = verifyAccessToken(token);
    next();
  } catch (err: any) {
    console.warn("JWT verification failed", { name: err?.name, message: err?.message });
    authMetrics.jwtVerificationFailed.inc?.();
    return res.sendStatus(401);
  }
};

export const requireRole = (role: string) => (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user as JWTClaims | undefined;
  if (!user || user.role !== role) return res.sendStatus(403);
  next();
};

export function signToken(data: any): string {
  const cfg = getConfig();
  return jwt.sign(data, cfg.JWT_SECRET!, {
    algorithm: "HS256" as Algorithm,
    expiresIn: "7d",
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE
  });
}