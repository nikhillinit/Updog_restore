/**
 * Consolidated Express Type Augmentations
 * Single source of truth for Express.Request extensions
 *
 * Updated: 2025-12-19 - Merged from server/types/express-extension.d.ts
 */
import 'express-serve-static-core';

declare global {
  namespace Express {
    /**
     * Authenticated user attached to request after auth middleware
     * Consolidated from AuthenticatedUser (server/types/express-extension.d.ts)
     */
    interface User {
      id: string;
      email?: string;
      name?: string;
      role?: 'admin' | 'user' | string;
    }

    interface Request {
      /** Authenticated user (populated by auth middleware) */
      user?: User;
      /** Unique request identifier for tracing */
      requestId?: string;
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

export {};