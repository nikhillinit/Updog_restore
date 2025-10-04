/**
 * Authentication Configuration
 * Provides validated auth config with fail-fast behavior on startup
 */

import { getConfig } from '../config';

export type JWTAlgorithm = 'HS256' | 'RS256';

export interface AuthConfig {
  algorithm: JWTAlgorithm;
  secret?: string;
  jwksUri?: string;
  issuer: string;
  audience: string;
}

let cachedAuthConfig: AuthConfig | null = null;

/**
 * Get validated authentication configuration
 * Validates on first call and caches the result
 * @throws {Error} If configuration is invalid or incomplete
 */
export function getAuthConfig(): AuthConfig {
  if (cachedAuthConfig) {
    return cachedAuthConfig;
  }

  const cfg = getConfig();

  const authConfig: AuthConfig = {
    algorithm: cfg.JWT_ALG,
    secret: cfg.JWT_SECRET,
    jwksUri: cfg.JWT_JWKS_URL,
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
  };

  // Validate algorithm-specific requirements
  if (authConfig.algorithm === 'HS256') {
    if (!authConfig.secret && !cfg.isTest) {
      throw new Error(
        'JWT_SECRET is required when JWT_ALG=HS256. Generate one with: npm run secret:gen'
      );
    }
    if (authConfig.secret && authConfig.secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters for HS256');
    }
  } else if (authConfig.algorithm === 'RS256') {
    if (!authConfig.jwksUri) {
      throw new Error('JWT_JWKS_URL is required when JWT_ALG=RS256');
    }
    // Validate JWKS URL format
    try {
      new URL(authConfig.jwksUri);
    } catch (e) {
      throw new Error(`Invalid JWT_JWKS_URL format: ${authConfig.jwksUri}`);
    }
  } else {
    throw new Error(`Unsupported JWT algorithm: ${authConfig.algorithm}`);
  }

  // Validate issuer and audience are set
  if (!authConfig.issuer || authConfig.issuer.trim() === '') {
    throw new Error('JWT_ISSUER must be configured');
  }
  if (!authConfig.audience || authConfig.audience.trim() === '') {
    throw new Error('JWT_AUDIENCE must be configured');
  }

  // Cache and return
  cachedAuthConfig = authConfig;
  return authConfig;
}

/**
 * Reset cached config (useful for testing)
 */
export function resetAuthConfig(): void {
  cachedAuthConfig = null;
}
