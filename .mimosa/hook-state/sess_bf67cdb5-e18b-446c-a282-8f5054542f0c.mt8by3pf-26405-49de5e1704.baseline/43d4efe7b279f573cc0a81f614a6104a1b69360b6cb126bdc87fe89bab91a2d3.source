/**
 * Test authentication helpers for HTTP/middleware integration tests.
 */

import type { Request, RequestHandler } from 'express';
import type { JWTClaims } from '../../server/lib/auth/jwt';

export type { JWTClaims };

const DEV_TOKEN_VALUE = 'dev-token';
const DEV_USER_SUB = 'dev-admin';
const DEV_USER_EMAIL = 'dev-admin@test.local';
const DEV_USER_ROLE = 'admin';
const DEV_USER_ROLES: string[] = ['flag_read', 'flag_admin'];

let tokenSequence = 0;
const tokenRegistries: Set<MockTokenRegistry> = new Set();

function nextToken(): string {
  tokenSequence += 1;
  return `test-token-${tokenSequence}`;
}

function buildUserFromClaims(claims: JWTClaims, req: Request): Express.User {
  const role = claims.role;
  return {
    id: claims.sub,
    sub: claims.sub,
    email: claims.email ?? claims.sub,
    role,
    roles: role ? [role] : [],
    fundIds: claims.fundIds ?? [],
    lpId: claims.lpId,
    ip: req.ip || 'unknown',
    userAgent: req.header('user-agent') || 'unknown',
  };
}

function buildDevUser(req: Request): Express.User {
  return {
    id: DEV_USER_SUB,
    sub: DEV_USER_SUB,
    email: DEV_USER_EMAIL,
    role: DEV_USER_ROLE,
    roles: [...DEV_USER_ROLES],
    fundIds: [],
    ip: req.ip || 'unknown',
    userAgent: req.header('user-agent') || 'unknown',
  };
}

/**
 * Registry for mock access tokens and their claims.
 */
export class MockTokenRegistry {
  private tokens = new Map<string, JWTClaims>();

  constructor() {
    tokenRegistries.add(this);
  }

  /**
   * Register a token and its claims.
   */
  addToken(token: string, claims: JWTClaims): void {
    this.tokens.set(token, claims);
  }

  /**
   * Resolve claims for a token, or null if not found.
   */
  verifyToken(token: string): JWTClaims | null {
    return this.tokens.get(token) ?? null;
  }

  /**
   * Clear all registered tokens.
   */
  clear(): void {
    this.tokens.clear();
  }
}

/**
 * Configuration for the test auth middleware.
 */
export interface TestAuthOptions {
  devMode?: boolean;
  devToken?: string;
}

/**
 * Create a test auth middleware backed by a mock token registry.
 */
export function createTestAuthMiddleware(
  registry: MockTokenRegistry,
  options: TestAuthOptions = {}
): RequestHandler {
  const devMode = options.devMode ?? false;
  const devToken = options.devToken ?? DEV_TOKEN_VALUE;

  return (req, res, next) => {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token) {
      res.sendStatus(401);
      return;
    }

    const claims = registry.verifyToken(token);
    if (claims) {
      req.user = buildUserFromClaims(claims, req);
      next();
      return;
    }

    if (devMode && token === devToken) {
      req.user = buildDevUser(req);
      next();
      return;
    }

    res.sendStatus(401);
  };
}

/**
 * Create and register an admin token.
 */
export function createAdminToken(registry: MockTokenRegistry): string {
  return createCustomToken(registry, { role: 'admin' });
}

/**
 * Create and register a read-only token for flag access.
 */
export function createReadOnlyToken(registry: MockTokenRegistry): string {
  return createCustomToken(registry, { role: 'flag_read' });
}

/**
 * Create and register a token with custom claims.
 */
export function createCustomToken(registry: MockTokenRegistry, claims: Partial<JWTClaims>): string {
  const token = nextToken();
  const sub = claims.sub ?? `test-user-${tokenSequence}`;
  const fullClaims = { ...claims, sub } as JWTClaims;
  registry.addToken(token, fullClaims);
  return token;
}

/**
 * Clear all registered mock token registries.
 */
export function clearMockTokenRegistries(): void {
  for (const registry of tokenRegistries) {
    registry.clear();
  }
}
