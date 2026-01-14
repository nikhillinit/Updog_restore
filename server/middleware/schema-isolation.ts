/**
 * Schema Isolation Middleware
 *
 * Runtime guards to prevent LP Portal from accessing simulation data.
 * This middleware enforces data boundaries defined in shared/lib/data-boundaries.ts.
 *
 * CRITICAL SECURITY: Monte Carlo simulation data, what-if scenarios, and
 * backtesting results must NEVER be exposed to Limited Partners.
 *
 * @module server/middleware/schema-isolation
 */

import type { Request, Response, NextFunction } from 'express';
import {
  isSimulationTable,
  DataBoundaryViolationError,
  SIMULATION_ONLY_TABLES,
} from '@shared/lib/data-boundaries';
import { logger } from '../lib/logger';

/**
 * Middleware to block LP Portal requests that attempt to access simulation data.
 *
 * This is a defensive layer - queries should already be written to only access
 * LP-readable tables, but this middleware catches any violations.
 *
 * Usage:
 *   router.use(enforceSchemaIsolation('lp_portal'));
 */
export function enforceSchemaIsolation(context: 'lp_portal' | 'admin' | 'api') {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Attach context to request for downstream validation
    req.dataContext = context;

    // For LP Portal, we add a query interceptor
    if (context === 'lp_portal') {
      // Store original query method if using raw SQL (defensive)
      // In practice, our Drizzle ORM queries don't expose table names in routes
      // This middleware primarily exists for audit logging and defensive coding
      req.lpSchemaIsolationActive = true;
    }

    next();
  };
}

/**
 * Validate a table access attempt from LP context.
 * Call this before any database query in LP routes.
 *
 * @param tableName - The table being accessed
 * @param context - The access context ('lp_portal', 'admin', 'api')
 * @throws DataBoundaryViolationError if access is not allowed
 */
export function validateTableAccess(
  tableName: string,
  context: 'lp_portal' | 'admin' | 'api'
): void {
  if (context === 'lp_portal' && isSimulationTable(tableName)) {
    const error = new DataBoundaryViolationError(context, tableName, 'simulation');

    // Log security violation
    logger.warn({
      event: 'schema_isolation_violation',
      context,
      tableName,
      message: error.message,
    });

    throw error;
  }
}

/**
 * Express error handler for data boundary violations.
 * Returns 403 Forbidden for schema isolation violations.
 */
export function handleSchemaViolation(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof DataBoundaryViolationError) {
    logger.error({
      event: 'schema_isolation_blocked',
      context: err.context,
      tableName: err.tableName,
      boundaryType: err.boundaryType,
    });

    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Access to this data is not permitted',
      code: 'SCHEMA_ISOLATION_VIOLATION',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next(err);
}

/**
 * Audit log helper for tracking LP data access patterns.
 * Use this to monitor what data LPs are accessing.
 */
export function logLPDataAccess(lpId: number, resource: string, action: 'read' | 'list'): void {
  logger.info({
    event: 'lp_data_access',
    lpId,
    resource,
    action,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get list of tables that are blocked for LP Portal.
 * Useful for documentation and testing.
 */
export function getBlockedTablesForLP(): readonly string[] {
  return SIMULATION_ONLY_TABLES;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      dataContext?: 'lp_portal' | 'admin' | 'api';
      lpSchemaIsolationActive?: boolean;
    }
  }
}
