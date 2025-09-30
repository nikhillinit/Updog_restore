/**
 * Structured Logging Configuration with Winston
 *
 * Production-ready logging system with:
 * - Structured JSON output for production
 * - Human-readable console output for development
 * - Log levels: error, warn, info, debug
 * - Performance metrics integration
 * - Security event tracking
 * - Audit trail support
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log levels for security and audit events
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    audit: 3,
    security: 4,
    performance: 5,
    debug: 6
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    audit: 'cyan',
    security: 'magenta',
    performance: 'blue',
    debug: 'gray'
  }
};

// Add colors to winston
winston.addColors(customLevels.colors);

// Production JSON formatter
const productionFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta,
      hostname: process.env['HOSTNAME'] || 'unknown',
      service: 'updog-vc-platform',
      version: process.env.npm_package_version || '1.0.0'
    });
  })
);

// Development human-readable formatter
const developmentFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, correlationId, userId, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const corrId = correlationId ? ` [${correlationId}]` : '';
    const user = userId ? ` (user:${userId})` : '';
    return `${timestamp} [${level}]${corrId}${user}: ${message}${metaStr}`;
  })
);

// File transport for production logs
const fileTransports = [
  // All logs
  new winston.transports.File({
    filename: path.join(logsDir, 'application.log'),
    level: 'info',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    format: productionFormat
  }),
  // Error logs only
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    format: productionFormat
  }),
  // Audit logs
  new winston.transports.File({
    filename: path.join(logsDir, 'audit.log'),
    level: 'audit',
    maxsize: 50 * 1024 * 1024, // 50MB
    maxFiles: 10,
    format: productionFormat
  }),
  // Security logs
  new winston.transports.File({
    filename: path.join(logsDir, 'security.log'),
    level: 'security',
    maxsize: 50 * 1024 * 1024, // 50MB
    maxFiles: 10,
    format: productionFormat
  })
];

// Console transport configuration
const consoleTransport = new winston.transports.Console({
  level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
  format: process.env['NODE_ENV'] === 'production' ? productionFormat : developmentFormat
});

// Create the main logger
const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env['LOG_LEVEL'] || (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true })
  ),
  defaultMeta: {
    service: 'updog-vc-platform'
  },
  transports: [
    consoleTransport,
    ...(process.env['NODE_ENV'] === 'production' ? fileTransports : [])
  ],
  exitOnError: false
});

// Create specialized loggers for different contexts
export const securityLogger = winston.createLogger({
  levels: customLevels.levels,
  level: 'security',
  format: productionFormat,
  defaultMeta: {
    service: 'updog-vc-platform',
    category: 'security'
  },
  transports: [
    consoleTransport,
    ...(process.env['NODE_ENV'] === 'production' ? [
      new winston.transports.File({
        filename: path.join(logsDir, 'security.log'),
        maxsize: 50 * 1024 * 1024,
        maxFiles: 10
      })
    ] : [])
  ]
});

export const auditLogger = winston.createLogger({
  levels: customLevels.levels,
  level: 'audit',
  format: productionFormat,
  defaultMeta: {
    service: 'updog-vc-platform',
    category: 'audit'
  },
  transports: [
    consoleTransport,
    ...(process.env['NODE_ENV'] === 'production' ? [
      new winston.transports.File({
        filename: path.join(logsDir, 'audit.log'),
        maxsize: 50 * 1024 * 1024,
        maxFiles: 10
      })
    ] : [])
  ]
});

export const performanceLogger = winston.createLogger({
  levels: customLevels.levels,
  level: 'performance',
  format: productionFormat,
  defaultMeta: {
    service: 'updog-vc-platform',
    category: 'performance'
  },
  transports: [
    consoleTransport,
    ...(process.env['NODE_ENV'] === 'production' ? [
      new winston.transports.File({
        filename: path.join(logsDir, 'performance.log'),
        maxsize: 20 * 1024 * 1024,
        maxFiles: 5
      })
    ] : [])
  ]
});

// Helper functions for structured logging
export const logContext = {
  addRequestContext: (req: Request) => ({
    correlationId: (req as Request & { correlationId?: string }).correlationId,
    userId: (req as Request & { user?: { id?: string | number } }).user?.id,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    method: req.method,
    path: req.path
  }),

  addUserContext: (userId: string | number) => ({
    userId
  }),

  addPerformanceContext: (operation: string, duration: number, metadata?: Record<string, unknown>) => ({
    operation,
    duration,
    ...metadata
  }),

  addSecurityContext: (event: string, severity: 'low' | 'medium' | 'high' | 'critical', metadata?: Record<string, unknown>) => ({
    securityEvent: event,
    severity,
    ...metadata
  }),

  addAuditContext: (action: string, entityType: string, entityId: string | number, changes?: Record<string, unknown>) => ({
    auditAction: action,
    entityType,
    entityId,
    changes
  })
};

// Utility functions for specific log types
export const logSecurity = (message: string, context: Record<string, unknown> = {}) => {
  securityLogger.log('security', message, context);
};

export const logAudit = (message: string, context: Record<string, unknown> = {}) => {
  auditLogger.log('audit', message, context);
};

export const logPerformance = (message: string, context: Record<string, unknown> = {}) => {
  performanceLogger.log('performance', message, context);
};

// Monte Carlo specific logging
export const logMonteCarloOperation = (operation: string, fundId: number, context: Record<string, unknown> = {}) => {
  logger.info(`Monte Carlo: ${operation}`, {
    operation: 'monte_carlo',
    fundId,
    ...context
  });
};

export const logMonteCarloError = (operation: string, fundId: number, error: Error, context: Record<string, unknown> = {}) => {
  logger.error(`Monte Carlo Error: ${operation}`, {
    operation: 'monte_carlo',
    fundId,
    error: error.message,
    stack: error.stack,
    ...context
  });
};

// Financial operation logging
export const logFinancialOperation = (operation: string, fundId: number, amount?: number, context: Record<string, unknown> = {}) => {
  auditLogger.log('audit', `Financial Operation: ${operation}`, {
    operation: 'financial',
    fundId,
    amount,
    ...context
  });
};

// Input validation logging
export const logValidationError = (field: string, value: unknown, error: string, context: Record<string, unknown> = {}) => {
  logger.warn(`Validation Error: ${field}`, {
    field,
    value: typeof value === 'object' ? JSON.stringify(value) : value,
    error,
    ...context
  });
};

// Rate limiting logging
export const logRateLimit = (identifier: string, limit: number, current: number, context: Record<string, unknown> = {}) => {
  securityLogger.log('security', `Rate limit exceeded`, {
    identifier,
    limit,
    current,
    securityEvent: 'rate_limit_exceeded',
    severity: 'medium',
    ...context
  });
};

// Performance monitoring
export class PerformanceMonitor {
  private startTime: number;
  private operation: string;
  private context: Record<string, unknown>;

  constructor(operation: string, context: Record<string, unknown> = {}) {
    this.startTime = Date.now();
    this.operation = operation;
    this.context = context;
  }

  end(additionalContext: Record<string, unknown> = {}) {
    const duration = Date.now() - this.startTime;
    logPerformance(`Operation completed: ${this.operation}`, {
      ...this.context,
      ...additionalContext,
      duration
    });
    return duration;
  }
}

// Express middleware for request logging
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const reqWithId = req as Request & { correlationId?: string };
  const correlationId = reqWithId.correlationId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  reqWithId.correlationId = correlationId;

  // Log request start
  logger.info('Request started', {
    ...logContext.addRequestContext(req),
    correlationId
  });

  // Log response when finished
  res['on']('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

    logger.log(logLevel, 'Request completed', {
      ...logContext.addRequestContext(req),
      correlationId,
      statusCode: res.statusCode,
      duration
    });

    // Log slow requests
    if (duration > 1000) {
      performanceLogger.log('performance', 'Slow request detected', {
        ...logContext.addRequestContext(req),
        correlationId,
        duration,
        statusCode: res.statusCode
      });
    }
  });

  next();
};

// Error logging middleware
export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Request error', {
    ...logContext.addRequestContext(req),
    error: err.message,
    stack: err.stack
  });
  next(err);
};

export default logger;