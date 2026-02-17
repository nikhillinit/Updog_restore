/**
 * Consolidated Express Type Augmentations
 * Single source of truth for Express.Request extensions and authenticated user
 *
 * Updated: 2025-12-19 - Consolidated 3 fragmented AuthenticatedRequest definitions:
 *   - server/lib/auth/jwt.ts (sub, role, ip, userAgent)
 *   - server/middleware/requireAuth.ts (id, email, orgId, fundIds)
 *   - server/middleware/audit.ts (id, email, orgId)
 */
import 'express-serve-static-core';
import type { UserContext } from '../server/lib/secure-context';

declare global {
  namespace Express {
    /**
     * Authenticated user attached to request after auth middleware
     * Unified from 3 fragmented definitions across the codebase
     *
     * Properties origin:
     * - id: user identifier (from JWT 'sub' claim, requireAuth, audit)
     * - sub: JWT subject claim (from jwt middleware)
     * - email: user email address (from JWT, requireAuth, audit)
     * - name: user display name (optional)
     * - role: single role string (from jwt middleware)
     * - roles: array of roles (alternative to role, for RBAC systems)
     * - ip: client IP address (from jwt middleware, request headers)
     * - userAgent: client user-agent header (from jwt middleware)
     * - orgId: organization identifier (from requireAuth, audit)
     * - fundIds: array of fund IDs user has access to (from requireAuth)
     */
    interface User {
      /** User identifier (required) - maps to JWT 'sub' claim */
      id: string;
      /** User email address (required for JWT middleware) */
      email: string;
      /** User display name (optional) */
      name?: string;
      /** JWT subject claim - same as id (required for JWT middleware) */
      sub: string;
      /** User role(s) - can be single string or array of role names */
      role?: string | string[] | undefined;
      /** Alternative field for role array (RBAC systems) */
      roles: string[];
      /** Client IP address (from JWT middleware) */
      ip: string;
      /** Client user-agent header (from JWT middleware) */
      userAgent: string;
      /** Organization ID (from requireAuth/audit middleware) */
      orgId?: string;
      /** Fund IDs user has access to (from requireAuth middleware) */
      fundIds?: number[];
      /** Limited Partner ID (LP-specific, from JWT claims for role='lp') */
      lpId?: number;
      /** Admin flag (for requireAuth middleware compatibility) */
      isAdmin?: boolean;
      /** Session data (optional, for JWT middleware) */
      session?: {
        id: string;
        [key: string]: any;
      };
    }

    interface Request {
      /** Authenticated user (populated by auth middleware) */
      user?: User;
      /** Session data (optional, for JWT middleware) */
      session?: {
        id: string;
        [key: string]: any;
      };
      /** Unique request identifier for tracing */
      requestId?: string;
      /** Request ID (short form) - alias for requestId (allocations.ts:348) */
      rid?: string;
      /** Request ID (alternate field) - same as rid (reserves-api.ts:250) */
      id?: string;
      /** Correlation ID for distributed tracing (correlation.ts:7) */
      correlationId?: string;
      /** API version from request header (server.ts:89) */
      version?: string;
      /** User security context (locks.ts:80) */
      context?: UserContext;
      /** Rate limit metadata (rateLimits.ts:120) */
      rateLimit?: {
        limit: number;
        remaining: number;
        reset: Date;
      };
      /** RUM v2 performance metrics (metrics-rum.ts:102) */
      rumV2?: {
        sessionId: string;
        pageLoadTime?: number;
        [key: string]: unknown;
      };
      /** Audit trail metadata */
      audit?: {
        event: string;
        meta?: Record<string, unknown>;
      };
      /** Request-scoped logger (optional) */
      log?: {
        info: (_obj: unknown, msg?: string) => void;
        error: (_obj: unknown, msg?: string) => void;
        warn: (_obj: unknown, msg?: string) => void;
      };
    }
  }
}

/**
 * Type alias for requests with guaranteed authenticated user
 * Use this when user authentication is required
 */
export interface AuthenticatedRequest extends Express.Request {
  user: Express.User;
}

export {};
