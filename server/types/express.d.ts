/**
 * Central Express Request augmentation
 *
 * All custom properties added to req.* by middleware should be declared here
 * instead of using `(req as any)` casts throughout the codebase.
 */

import 'express-serve-static-core';

interface RequestLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

interface RUMv2Processor {
  processMetric: (name: string, value: number, labels: Record<string, unknown>) => boolean;
  getMetrics: () => Promise<string>;
}

interface RequestContext {
  userId: string;
  email: string;
  role: string;
  orgId: string;
  fundId?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    // requestId middleware
    requestId?: string;
    log?: RequestLogger;

    // correlation middleware
    correlationId?: string;

    // auth / secure-context middleware
    user?: {
      id: string;
      sub: string;
      email: string;
      role?: string;
      roles: string[];
      fundIds: number[];
      lpId?: number;
      ip: string;
      userAgent: string;
    };

    // dev context middleware (server.ts)
    context?: RequestContext;

    // version header middleware
    version?: string;

    // engineGuardExpress middleware
    guard?: {
      sanitizeResponse: (data: unknown) => unknown;
      injectFaults: <T>(fn: () => T | Promise<T>) => Promise<T>;
    };

    // RUM v2 enhancement middleware
    rumV2?: RUMv2Processor;
  }
}
