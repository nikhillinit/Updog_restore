import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage.js';
import type { InsertAuditLog } from '../../shared/schema.js';

interface AuditConfig {
  excludePaths?: string[];
  excludeMethods?: string[];
  includeBody?: boolean;
  logSuccessOnly?: boolean;
}

// Extended request type for correlation/user context
interface ExtendedRequest {
  correlationId?: string;
  user?: { id: number };
  session?: { id: string };
}

// Type guard for checking if storage has insertAuditLog
interface StorageWithAuditLog {
  insertAuditLog: (entry: InsertAuditLog) => Promise<void>;
}

function hasInsertAuditLog(obj: typeof storage): obj is typeof storage & StorageWithAuditLog {
  return 'insertAuditLog' in obj && typeof obj.insertAuditLog === 'function';
}

const defaultConfig: AuditConfig = {
  excludePaths: ['/health', '/metrics', '/ready', '/readyz', '/healthz'],
  excludeMethods: ['OPTIONS'],
  includeBody: false,
  logSuccessOnly: false,
};

export function auditLog(config: AuditConfig = {}) {
  const mergedConfig = { ...defaultConfig, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip excluded paths and methods
    if (mergedConfig.excludePaths?.some((path) => req.path.startsWith(path))) {
      return next();
    }

    if (mergedConfig.excludeMethods?.includes(req.method)) {
      return next();
    }

    // Capture request data (cast to extended type for correlation/user context)
    const extReq = req as unknown as ExtendedRequest;
    const correlationId = extReq.correlationId;
    const userId = extReq.user?.id;
    // startTime removed - unused

    // Override res.json to capture response
    const originalJson = res.json;
    let responseBody: unknown;

    res.json = function (body: unknown) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Log after response finishes
    res.on('finish', () => {
      // Skip logging if configured to only log successes and this isn't a success
      if (mergedConfig.logSuccessOnly && res.statusCode >= 400) {
        return;
      }

      const auditEntry: InsertAuditLog = {
        userId: userId ?? null,
        action: req.method,
        entityType: extractEntityType(req.path),
        entityId: extractEntityId(req.path),
        changes: mergedConfig.includeBody
          ? {
              request: req.body as Record<string, unknown>,
              response: responseBody,
              params: req.params,
              query: req.query,
            }
          : null,
        ipAddress: req.ip || req.connection.remoteAddress || null,
        userAgent: req.get('User-Agent') || null,
        correlationId: correlationId ?? null,
        sessionId: extractSessionId(req),
        requestPath: req.path,
        httpMethod: req.method,
        statusCode: res.statusCode,
      };

      // Log asynchronously to avoid blocking the response
      logAuditEntry(auditEntry).catch((error: unknown) => {
        console.error('Failed to log audit entry:', error);
        // Don't throw - audit logging failures shouldn't break the API
      });
    });

    next();
  };
}

async function logAuditEntry(entry: InsertAuditLog) {
  try {
    // Use your storage layer to insert the audit log
    // Note: You'll need to add an insertAuditLog method to your storage layer
    if (hasInsertAuditLog(storage)) {
      await storage.insertAuditLog(entry);
    } else {
      // Fallback: direct console logging for development
      console.log('AUDIT:', JSON.stringify(entry));
    }
  } catch (error) {
    console.error('Failed to persist audit log:', error);
  }
}

function extractEntityType(path: string): string | null {
  // Extract entity type from API path
  const match = path.match(/^\/api\/([^/]+)/);
  return match?.[1] ?? null;
}

function extractEntityId(path: string): string | null {
  // Extract entity ID from API path (assumes UUIDs or numeric IDs)
  const match = path.match(/\/([a-f0-9-]{36}|\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function extractSessionId(req: Request): string | null {
  // Extract session ID from request (cookie, header, etc.)
  const extReq = req as unknown as ExtendedRequest;
  const headerSessionId = req.get('x-session-id');
  const sessionId = extReq.session?.id;
  const cookies = req.cookies as Record<string, string> | undefined;
  const cookieSessionId = cookies?.['sessionId'];
  return headerSessionId || sessionId || cookieSessionId || null;
}
