/**
 * JWT Authentication for Flag Admin API
 * Production-grade token validation with RS256/JWKS and strict validation
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import * as jose from 'node-jose';
import { getAuthToken } from '../headers-helper';

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

// Environment-specific configuration
const FLAG_ENV = process.env.FLAG_ENV || process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.FLAG_JWT_SECRET;
const JWKS_URI = process.env.FLAG_JWKS_URI;
const JWT_ISSUER = process.env.FLAG_JWT_ISSUER || `povc-fund-platform-${FLAG_ENV}`;
const JWT_AUDIENCE = process.env.FLAG_JWT_AUDIENCE || `flag-admin-${FLAG_ENV}`;
const ALLOWED_ISSUERS = process.env.FLAG_ALLOWED_ISSUERS?.split(',') || [JWT_ISSUER];
const ALLOWED_AUDIENCES = process.env.FLAG_ALLOWED_AUDIENCES?.split(',') || [JWT_AUDIENCE];
const CLOCK_SKEW_SECONDS = 60; // ±60s tolerance

// Production requires either JWKS or strong secret
if (process.env.NODE_ENV === 'production') {
  if (!JWKS_URI && !JWT_SECRET) {
    throw new Error('Production requires either FLAG_JWKS_URI (RS256) or FLAG_JWT_SECRET (HS256)');
  }
  if (JWT_SECRET && JWT_SECRET.length < 32) {
    throw new Error('FLAG_JWT_SECRET must be at least 32 characters in production');
  }
}

// JWKS cache
let jwksCache: jose.JWK.KeyStore | null = null;
let jwksCacheExpiry = 0;

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
 * Fetch and cache JWKS from remote endpoint
 */
async function getJWKS(): Promise<jose.JWK.KeyStore> {
  if (!JWKS_URI) {
    throw new Error('JWKS_URI not configured for RS256 verification');
  }
  
  const now = Date.now();
  if (jwksCache && now < jwksCacheExpiry) {
    return jwksCache;
  }
  
  try {
    console.log(`Fetching JWKS from ${JWKS_URI}`);
    const response = await fetch(JWKS_URI);
    if (!response.ok) {
      throw new Error(`JWKS fetch failed: ${response.status}`);
    }
    
    const jwks = await response.json();
    jwksCache = await jose.JWK.asKeyStore(jwks);
    jwksCacheExpiry = now + (5 * 60 * 1000); // Cache for 5 minutes
    
    return jwksCache;
  } catch (error) {
    console.error('JWKS fetch error:', error);
    // Use cached version if available, even if expired
    if (jwksCache) {
      console.warn('Using expired JWKS cache due to fetch failure');
      return jwksCache;
    }
    throw error;
  }
}

/**
 * Verify JWT token with comprehensive validation
 */
async function verifyToken(token: string): Promise<TokenClaims> {
  try {
    // Decode header to determine algorithm
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new Error('Invalid token format');
    }
    
    const { header, payload } = decoded;
    
    // Type guard to ensure payload is JwtPayload
    if (typeof payload === 'string' || !payload) {
      throw new Error('Invalid token payload format');
    }
    
    // Reject dangerous algorithms
    if (header.alg === 'none') {
      throw new Error('Algorithm "none" is not allowed');
    }
    
    // Validate issuer and audience before signature verification
    if (!payload.iss || !ALLOWED_ISSUERS.includes(payload.iss as string)) {
      throw new Error(`Invalid issuer: ${payload.iss}. Allowed: ${ALLOWED_ISSUERS.join(', ')}`);
    }
    
    if (!payload.aud || !ALLOWED_AUDIENCES.some(aud => 
      Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud
    )) {
      throw new Error(`Invalid audience: ${payload.aud}. Allowed: ${ALLOWED_AUDIENCES.join(', ')}`);
    }
    
    // Validate timing claims with clock skew
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp && payload.exp < (now - CLOCK_SKEW_SECONDS)) {
      throw new Error('Token has expired');
    }
    
    if (payload.nbf && payload.nbf > (now + CLOCK_SKEW_SECONDS)) {
      throw new Error('Token not yet valid (nbf)');
    }
    
    if (payload.iat && payload.iat > (now + CLOCK_SKEW_SECONDS)) {
      throw new Error('Token issued in the future');
    }
    
    let claims: TokenClaims;
    
    // Signature verification
    if (header.alg.startsWith('RS') && JWKS_URI) {
      // RS256 with JWKS
      const keyStore = await getJWKS();
      const key = keyStore.get(header.kid);
      if (!key) {
        throw new Error(`Key ID ${header.kid} not found in JWKS`);
      }
      
      const publicKey = key.toPEM(false);
      claims = jwt.verify(token, publicKey, {
        algorithms: [header.alg as jwt.Algorithm],
        clockTolerance: CLOCK_SKEW_SECONDS
      }) as TokenClaims;
    } else if (header.alg.startsWith('HS') && JWT_SECRET) {
      // HS256 with shared secret
      claims = jwt.verify(token, JWT_SECRET, {
        algorithms: [header.alg as jwt.Algorithm],
        clockTolerance: CLOCK_SKEW_SECONDS
      }) as TokenClaims;
    } else {
      throw new Error(`Unsupported algorithm ${header.alg} or missing verification key`);
    }
    
    // Validate required claims
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
  return async (req: Request, res: Response, next: NextFunction) => {
    // Allow local development bypass
    const isDev = FLAG_ENV === 'development';
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1';
    
    if (isDev && isLocal && !req.headers.authorization) {
      // Development mode: create mock user
      (req as AuthenticatedRequest).user = {
        sub: 'dev-user',
        email: 'dev@localhost',
        roles: ['flag_admin', 'flag_read'],
        ip: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };
      return next();
    }
    
    const token = getAuthToken(req.headers);
    if (!token) {
      return res.status(401).json({ 
        error: 'missing_token',
        message: 'Authorization header with Bearer token required' 
      });
    }
    
    try {
      const claims = await verifyToken(token);
      
      (req as AuthenticatedRequest).user = {
        sub: claims.sub,
        email: claims.email,
        roles: Array.isArray(claims.role) ? claims.role : [claims.role],
        ip: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };
      
      next();
    } catch (error) {
      console.warn(`JWT verification failed for ${req.ip}: ${error.message}`);
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