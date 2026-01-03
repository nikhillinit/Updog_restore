import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage.js';
import type { InsertAuditLog } from '../../shared/schema.js';

interface ExtendedRequest extends Request {
  correlationId?: string;
  user?: { id: number };
  session?: { id: string };
}

interface StorageWithAudit {
  insertAuditLog?: (entry: InsertAuditLog) => Promise<void>;
}

interface AuditConfig {
  excludePaths?: string[];
  excludeMethods?: string[];
  includeBody?: boolean;
  logSuccessOnly?: boolean;
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
    if (mergedConfig.excludePaths?.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    if (mergedConfig.excludeMethods?.includes(req.method)) {
      return next();
    }

    // Capture request data
    const extReq = req as ExtendedRequest;
    const correlationId = extReq.correlationId;
    const userId = extReq.user?.id; // Assumes auth middleware sets user
    const startTime = Date.now();

    // Override res.json to capture response
    const originalJson = res.json;
    let responseBody: unknown;

    res.json = function(body: unknown) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Log after response finishes
    res['on']('finish', async () => {
      // Skip logging if configured to only log successes and this isn't a success
      if (mergedConfig.logSuccessOnly && (res.statusCode >= 400)) {
        return;
      }

      try {
        const auditEntry: InsertAuditLog = {
          userId: userId ?? null,
          action: req.method,
          entityType: extractEntityType(req.path),
          entityId: extractEntityId(req.path),
          changes: mergedConfig.includeBody ? {
            request: req.body as Record<string, unknown>,
            response: responseBody,
            params: req.params,
            query: req.query,
          } : null,
          ipAddress: req.ip || req.connection.remoteAddress || null,
          userAgent: req['get']('User-Agent') || null,
          correlationId: correlationId ?? null,
          sessionId: extractSessionId(req),
          requestPath: req.path,
          httpMethod: req.method,
          statusCode: res.statusCode,
        };

        // Log asynchronously to avoid blocking the response
        await logAuditEntry(auditEntry);
      } catch (error) {
        console.error('Failed to log audit entry:', error);
        // Don't throw - audit logging failures shouldn't break the API
      }
    });

    next();
  };
}

async function logAuditEntry(entry: InsertAuditLog): Promise<void> {
  try {
    // Use your storage layer to insert the audit log
    // Note: You'll need to add an insertAuditLog method to your storage layer
    const storageWithAudit = storage as unknown as StorageWithAudit;
    if (storageWithAudit.insertAuditLog && typeof storageWithAudit.insertAuditLog === 'function') {
      await storageWithAudit.insertAuditLog(entry);
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
  const match = path.match(/^\/api\/([^\/]+)/);
  return match?.[1] ?? null;
}

function extractEntityId(path: string): string | null {
  // Extract entity ID from API path (assumes UUIDs or numeric IDs)
  const match = path.match(/\/([a-f0-9-]{36}|\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function extractSessionId(req: Request): string | null {
  // Extract session ID from request (cookie, header, etc.)
  const extReq = req as ExtendedRequest;
  return req['get']('x-session-id') ||
         extReq.session?.id ||
         req.cookies?.sessionId ||
         null;
}