/**
 * Enhanced Audit Logging System
 *
 * Comprehensive audit trail for financial operations including:
 * - Financial transaction logging
 * - Data change tracking
 * - User action audit
 * - Compliance reporting
 * - Immutable audit records
 * - Real-time monitoring
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db.js';
import { fundEvents, auditLog } from '@shared/schema';
import { auditLogger, logAudit, securityLogger } from '../utils/logger.js';
import { z } from 'zod';
import crypto from 'crypto';

// =============================================================================
// AUDIT CONFIGURATION
// =============================================================================

interface AuditConfig {
  excludePaths?: string[];
  excludeMethods?: string[];
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  logSuccessOnly?: boolean;
  sensitiveFields?: string[];
  retentionDays?: number;
  encryptSensitiveData?: boolean;
}

const defaultAuditConfig: AuditConfig = {
  excludePaths: [
    '/health', '/metrics', '/ready', '/readyz', '/healthz',
    '/favicon.ico', '/robots.txt'
  ],
  excludeMethods: ['OPTIONS', 'HEAD'],
  includeRequestBody: true,
  includeResponseBody: false, // Too much data for most cases
  logSuccessOnly: false,
  sensitiveFields: [
    'password', 'token', 'secret', 'key', 'ssn', 'credit_card',
    'bank_account', 'routing_number', 'api_key', 'private_key'
  ],
  retentionDays: 2555, // 7 years for financial compliance
  encryptSensitiveData: true
};

// =============================================================================
// AUDIT SCHEMAS
// =============================================================================

const AuditEventSchema = z.object({
  userId: z.number().int().positive().optional(),
  sessionId: z.string().uuid().optional(),
  action: z.string().min(1).max(100),
  entityType: z.string().min(1).max(50),
  entityId: z.union([z.string(), z.number()]).optional(),
  changes: z.any().optional(),
  metadata: z.record(z.any()).optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional(),
  correlationId: z.string().uuid().optional(),
  requestPath: z.string().max(500),
  httpMethod: z.string().max(10),
  statusCode: z.number().int().min(100).max(599),
  executionTimeMs: z.number().int().min(0).optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('low')
});

const FinancialAuditSchema = z.object({
  fundId: z.number().int().positive(),
  operation: z.enum([
    'monte_carlo_simulation',
    'portfolio_valuation',
    'reserve_calculation',
    'pacing_analysis',
    'fund_creation',
    'investment_entry',
    'financial_report_generation',
    'data_export',
    'compliance_report'
  ]),
  amount: z.number().finite().optional(),
  currency: z.string().length(3).default('USD'),
  previousValue: z.number().finite().optional(),
  newValue: z.number().finite().optional(),
  calculationMethod: z.string().max(100).optional(),
  dataInputs: z.record(z.any()).optional(),
  outputs: z.record(z.any()).optional(),
  complianceFlags: z.array(z.string()).optional()
});

// =============================================================================
// AUDIT UTILITIES
// =============================================================================

class AuditEncryption {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly keyLength = 32;

  private static getEncryptionKey(): Buffer {
    const key = process.env['AUDIT_ENCRYPTION_KEY'];
    if (!key) {
      throw new Error('AUDIT_ENCRYPTION_KEY environment variable is required');
    }
    return crypto.scryptSync(key, 'audit-salt', AuditEncryption.keyLength);
  }

  static encrypt(data: any): { encrypted: string; iv: string; tag: string } {
    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      const jsonData = JSON.stringify(data);
      let encrypted = cipher.update(jsonData, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      securityLogger.error('Audit encryption failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Failed to encrypt audit data');
    }
  }

  static decrypt(encryptedData: { encrypted: string; iv: string; tag: string }): any {
    try {
      const key = this.getEncryptionKey();
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      securityLogger.error('Audit decryption failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Failed to decrypt audit data');
    }
  }
}

const sanitizeSensitiveData = (data: any, sensitiveFields: string[]): any => {
  if (!data || typeof data !== 'object') return data;

  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  const sanitizeValue = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(sanitizeValue);
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveFields.some(field =>
        lowerKey.includes(field.toLowerCase())
      );

      if (isSensitive) {
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        result[key] = sanitizeValue(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  return sanitizeValue(sanitized);
};

const generateAuditHash = (data: any): string => {
  const jsonString = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(jsonString).digest('hex');
};

// =============================================================================
// AUDIT MIDDLEWARE
// =============================================================================

export function enhancedAuditMiddleware(config: AuditConfig = {}) {
  const mergedConfig = { ...defaultAuditConfig, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip excluded paths and methods
    if (mergedConfig.excludePaths?.some(path => req.path.startsWith(path))) {
      return next();
    }

    if (mergedConfig.excludeMethods?.includes(req.method)) {
      return next();
    }

    // Capture request data
    const startTime = Date.now();
    const correlationId = (req as any).correlationId || crypto.randomUUID();
    const userId = (req as any).user?.id;
    const sessionId = (req as any).session?.id || req['get']('x-session-id');

    // Capture original response methods
    const originalJson = res.json;
    const originalSend = res.send;
    let responseBody: any;
    let responseSize = 0;

    // Override response methods to capture data
    res.json = function(body: any) {
      responseBody = body;
      responseSize = JSON.stringify(body).length;
      return originalJson.call(this, body);
    };

    res.send = function(body: any) {
      if (!responseBody) {
        responseBody = body;
        responseSize = typeof body === 'string' ? body.length : JSON.stringify(body).length;
      }
      return originalSend.call(this, body);
    };

    // Log audit entry when response finishes
    res['on']('finish', async () => {
      // Skip if configured to only log successes and this isn't a success
      if (mergedConfig["logSuccessOnly"] && res['statusCode'] >= 400) {
        return;
      }

      try {
        const executionTime = Date.now() - startTime;
        const riskLevel = determineRiskLevel(req, res, executionTime);

        // Prepare audit data
        const auditData: any = {
          timestamp: new Date(),
          correlationId,
          userId: userId || null,
          sessionId: sessionId || null,
          action: `${req.method} ${req.path}`,
          entityType: extractEntityType(req.path),
          entityId: extractEntityId(req.path),
          ipAddress: req["ip"] || req['connection'].remoteAddress || null,
          userAgent: req['get']('User-Agent') || null,
          requestPath: req.path,
          httpMethod: req.method,
          statusCode: res["statusCode"],
          executionTimeMs: executionTime,
          riskLevel,
          requestSize: JSON.stringify(req.body || {}).length,
          responseSize
        };

        // Add request/response data if configured
        if (mergedConfig.includeRequestBody) {
          auditData.requestBody = sanitizeSensitiveData(req.body, mergedConfig.sensitiveFields || []);
          auditData.queryParams = sanitizeSensitiveData(req.query, mergedConfig.sensitiveFields || []);
          auditData.routeParams = sanitizeSensitiveData(req.params, mergedConfig.sensitiveFields || []);
        }

        if (mergedConfig.includeResponseBody) {
          auditData.responseBody = sanitizeSensitiveData(responseBody, mergedConfig.sensitiveFields || []);
        }

        // Add metadata
        auditData.metadata = {
          headers: sanitizeSensitiveData(req.headers, mergedConfig.sensitiveFields || []),
          protocol: req["protocol"],
          secure: req["secure"],
          originalUrl: req.originalUrl,
          baseUrl: req["baseUrl"],
          hostname: req["hostname"]
        };

        // Generate integrity hash
        auditData.integrityHash = generateAuditHash(auditData);

        // Encrypt sensitive data if configured
        if (mergedConfig.encryptSensitiveData && (auditData.requestBody || auditData.responseBody)) {
          const sensitiveData = {
            requestBody: auditData.requestBody,
            responseBody: auditData.responseBody
          };

          const encrypted = AuditEncryption.encrypt(sensitiveData);
          auditData.encryptedData = encrypted;
          delete auditData.requestBody;
          delete auditData.responseBody;
        }

        // Validate audit data
        const validation = AuditEventSchema.safeParse(auditData);
        if (!validation.success) {
          securityLogger.error('Audit data validation failed', {
            correlationId,
            errors: validation.error.errors
          });
          return;
        }

        // Store audit record
        await storeAuditRecord(validation.data);

        // Log to audit logger
        logAudit('Request audited', {
          correlationId,
          userId,
          action: auditData.action,
          statusCode: res["statusCode"],
          executionTime,
          riskLevel
        });

      } catch (error) {
        securityLogger.error('Failed to create audit record', {
          correlationId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    });

    // Add correlation ID to request for tracking
    (req as any).correlationId = correlationId;
    next();
  };
}

// =============================================================================
// FINANCIAL AUDIT MIDDLEWARE
// =============================================================================

export function financialAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only apply to financial endpoints
  const financialPaths = [
    '/api/monte-carlo',
    '/api/simulations',
    '/api/funds',
    '/api/investments',
    '/api/valuations',
    '/api/reports'
  ];

  if (!financialPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  const startTime = Date.now();
  const correlationId = (req as any).correlationId || crypto.randomUUID();

  // Override response to capture financial operation results
  const originalJson = res.json;
  res.json = function(body: any) {
    // Log financial operation
    setImmediate(async () => {
      try {
        await logFinancialOperation(req, res, body, Date.now() - startTime, correlationId);
      } catch (error) {
        securityLogger.error('Failed to log financial operation', {
          correlationId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    return originalJson.call(this, body);
  };

  next();
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function determineRiskLevel(req: Request, res: Response, executionTime: number): 'low' | 'medium' | 'high' | 'critical' {
  // Critical risk indicators
  if (res['statusCode'] >= 500) return 'critical';
  if (req.path.includes('/admin') && req.method === 'DELETE') return 'critical';
  if (req.path.includes('/monte-carlo') && res['statusCode'] >= 400) return 'critical';

  // High risk indicators
  if (res['statusCode'] === 401 || res['statusCode'] === 403) return 'high';
  if (req.method === 'DELETE') return 'high';
  if (executionTime > 30000) return 'high'; // 30+ seconds
  if (req.path.includes('/financial') || req.path.includes('/simulation')) return 'high';

  // Medium risk indicators
  if (res['statusCode'] >= 400) return 'medium';
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') return 'medium';
  if (executionTime > 5000) return 'medium'; // 5+ seconds

  return 'low';
}

function extractEntityType(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length >= 2 && segments[0] === 'api') {
    return segments[1] ?? 'unknown';
  }
  return 'unknown';
}

function extractEntityId(path: string): string | null {
  // Look for UUID or numeric ID patterns
  const uuidPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
  const numericPattern = /\/(\d+)(?:\/|$)/;

  const uuidMatch = path.match(uuidPattern);
  if (uuidMatch) return uuidMatch[0] ?? null;

  const numericMatch = path.match(numericPattern);
  if (numericMatch) return numericMatch[1] ?? null;

  return null;
}

async function storeAuditRecord(auditData: any): Promise<void> {
  try {
    // Store in database
    await db.insert(auditLog).values({
      userId: auditData.userId,
      action: auditData.action,
      entityType: auditData.entityType,
      entityId: auditData.entityId?.toString(),
      changes: auditData.encryptedData || {
        requestBody: auditData.requestBody,
        responseBody: auditData.responseBody,
        metadata: auditData.metadata
      },
      ipAddress: auditData.ipAddress,
      userAgent: auditData.userAgent,
      correlationId: auditData.correlationId,
      sessionId: auditData.sessionId,
      requestPath: auditData.requestPath,
      httpMethod: auditData.httpMethod,
      statusCode: auditData.statusCode,
      metadata: {
        executionTimeMs: auditData.executionTimeMs,
        riskLevel: auditData.riskLevel,
        requestSize: auditData.requestSize,
        responseSize: auditData.responseSize,
        integrityHash: auditData.integrityHash,
        encrypted: !!auditData.encryptedData
      }
    });
  } catch (error) {
    // Log to file as fallback
    auditLogger.error('Failed to store audit record in database', {
      auditData,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function logFinancialOperation(
  req: Request,
  res: Response,
  responseBody: any,
  executionTime: number,
  correlationId: string
): Promise<void> {
  try {
    const fundId = req['body']?.['fundId'] || req['params']?.['fundId'] || responseBody?.['fundId'];
    if (!fundId) return;

    const operation = determineFinancialOperation(req.path, req.method);
    const amount = extractAmount(req.body, responseBody);

    const financialAudit = {
      fundId: parseInt(fundId),
      operation,
      amount,
      dataInputs: sanitizeSensitiveData(req.body, defaultAuditConfig.sensitiveFields || []),
      outputs: sanitizeSensitiveData(responseBody, defaultAuditConfig.sensitiveFields || []),
      calculationMethod: responseBody?.calculationMethod || req.body?.calculationMethod,
      complianceFlags: validateCompliance(req.body, responseBody)
    };

    const validation = FinancialAuditSchema.safeParse(financialAudit);
    if (!validation.success) {
      securityLogger.error('Financial audit validation failed', {
        correlationId,
        errors: validation.error.errors
      });
      return;
    }

    // Store financial event
    await db.insert(fundEvents).values({
      fundId: validation.data.fundId,
      eventType: 'FINANCIAL_OPERATION',
      payload: validation.data,
      userId: (req as any).user?.id,
      correlationId,
      eventTime: new Date(),
      operation: validation.data.operation,
      entityType: 'financial_operation',
      metadata: {
        executionTimeMs: executionTime,
        statusCode: res['statusCode'],
        ipAddress: req.ip,
        userAgent: req['get']('User-Agent')
      }
    });

    logAudit('Financial operation completed', {
      correlationId,
      fundId: validation.data.fundId,
      operation: validation.data.operation,
      amount: validation.data.amount,
      executionTime
    });

  } catch (error) {
    securityLogger.error('Financial audit logging failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function determineFinancialOperation(path: string, method: string): string {
  if (path.includes('monte-carlo')) return 'monte_carlo_simulation';
  if (path.includes('valuation')) return 'portfolio_valuation';
  if (path.includes('reserve')) return 'reserve_calculation';
  if (path.includes('pacing')) return 'pacing_analysis';
  if (path.includes('funds') && method === 'POST') return 'fund_creation';
  if (path.includes('investments')) return 'investment_entry';
  if (path.includes('reports')) return 'financial_report_generation';
  return 'financial_operation';
}

function extractAmount(requestBody: any, responseBody: any): number | undefined {
  const amountFields = ['amount', 'fundSize', 'investmentAmount', 'totalValue', 'value'];

  for (const field of amountFields) {
    if (requestBody?.[field] && typeof requestBody[field] === 'number') {
      return requestBody[field];
    }
    if (responseBody?.[field] && typeof responseBody[field] === 'number') {
      return responseBody[field];
    }
  }

  return undefined;
}

function validateCompliance(requestBody: any, responseBody: any): string[] {
  const flags: string[] = [];

  // Check for large amounts requiring additional approval
  const amount = extractAmount(requestBody, responseBody);
  if (amount && amount > 10000000) { // $10M threshold
    flags.push('LARGE_AMOUNT_TRANSACTION');
  }

  // Check for high-risk calculations
  if (responseBody?.riskMetrics?.probabilityOfLoss > 0.3) {
    flags.push('HIGH_RISK_SCENARIO');
  }

  // Check for unusual market conditions
  if (requestBody?.marketEnvironment?.scenario === 'bear' &&
      responseBody?.irr?.statistics?.mean < -0.1) {
    flags.push('SEVERE_LOSS_SCENARIO');
  }

  return flags;
}

// =============================================================================
// AUDIT QUERY AND REPORTING
// =============================================================================

export class AuditReporter {
  static async getAuditTrail(filters: {
    userId?: number;
    entityType?: string;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: string;
    limit?: number;
  }) {
    // Implementation would query the audit logs table
    // This is a placeholder for the actual implementation
    return [];
  }

  static async generateComplianceReport(fundId: number, startDate: Date, endDate: Date) {
    // Generate compliance report for regulatory requirements
    return {
      fundId,
      period: { startDate, endDate },
      totalTransactions: 0,
      highRiskTransactions: 0,
      complianceFlags: [],
      auditSummary: {}
    };
  }
}

export { AuditEncryption };