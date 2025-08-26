/**
 * JWT Authentication for Flag Admin API
 * Production-grade token validation with RBAC
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface TokenClaims {
  sub: string;           // User ID
  email: string;         // User email
  role: string[];        // User roles
  aud: string;          // Audience
  iss: string;          // Issuer
  exp: number;          // Expiry
  iat: number;          // Issued at
}

export interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    roles: string[];
    ip: string;
    userAgent: string;
  };
}

const JWT_SECRET = process.env.FLAG_JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'povc-fund-platform';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'flag-admin';

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FLAG_JWT_SECRET is required in production');
}

/**
 * Extract and verify JWT token from Authorization header
 */
function extractToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.replace('Bearer ', '');
}

/**
 * Verify JWT token and extract claims
 */
function verifyToken(token: string): TokenClaims {
  const secret = JWT_SECRET || 'dev-secret-only-for-testing';
  
  try {
    const claims = jwt.verify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256']
    }) as TokenClaims;
    
    if (!claims.sub || !claims.email || !claims.role) {
      throw new Error('Missing required claims: sub, email, or role');
    }
    
    return claims;
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

/**
 * Authentication middleware for flag admin routes
 */
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Allow local development bypass
    const isDev = process.env.NODE_ENV === 'development';
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1';
    
    if (isDev && isLocal && !req.headers.authorization) {
      // Development mode: create mock user
      (req as AuthenticatedRequest).user = {
        sub: 'dev-user',
        email: 'dev@localhost',
        roles: ['flag_admin'],
        ip: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };
      return next();
    }
    
    const token = extractToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ 
        error: 'missing_token',
        message: 'Authorization header with Bearer token required' 
      });
    }
    
    try {
      const claims = verifyToken(token);
      
      (req as AuthenticatedRequest).user = {
        sub: claims.sub,
        email: claims.email,
        roles: Array.isArray(claims.role) ? claims.role : [claims.role],
        ip: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };
      
      next();
    } catch (error) {
      res.status(401).json({
        error: 'invalid_token',
        message: error.message
      });
    }
  };
}

/**
 * Authorization middleware - check for required role
 */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;
    
    if (!user) {
      return res.status(401).json({
        error: 'unauthenticated',
        message: 'Authentication required'
      });
    }
    
    if (!user.roles.includes(role)) {
      return res.status(403).json({
        error: 'insufficient_privileges',
        message: `Role '${role}' required`,
        userRoles: user.roles
      });
    }
    
    next();
  };
}

/**
 * Generate development JWT for testing
 */
export function generateDevToken(sub: string, email: string, roles: string[]): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dev token generation not allowed in production');
  }
  
  const secret = JWT_SECRET || 'dev-secret-only-for-testing';
  
  return jwt.sign(
    {
      sub,
      email,
      role: roles,
      aud: JWT_AUDIENCE,
      iss: JWT_ISSUER
    },
    secret,
    {
      expiresIn: '1h',
      algorithm: 'HS256'
    }
  );
}