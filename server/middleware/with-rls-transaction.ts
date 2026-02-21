/**
 * Request-Scoped RLS Transaction Middleware
 * Ensures every request runs in a database transaction with proper RLS context
 */

import type { Request, Response, NextFunction } from 'express';
import { db, pool as dbPool } from '../db.js';
import type { UserContext } from '../lib/secure-context.js';
import type { Pool } from 'pg';

export interface RLSRequest extends Request {
  context?: UserContext;
  tx?: any;
  pgClient?: any;
}

/**
 * Middleware that wraps each request in a database transaction
 * with RLS context properly set via SET LOCAL
 */
export function withRLSTransaction() {
  return async (req: RLSRequest, res: Response, next: NextFunction) => {
    // Require authenticated context
    if (!req.context) {
      return res['status'](401)['json']({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    const { userId, orgId, fundId, email, role, partnerId } = req.context;

    // Require org context for tenant isolation
    if (!orgId) {
      return res['status'](403)['json']({
        error: 'missing_org_context',
        message: 'Organization context is required',
      });
    }

    // In memory/mock test mode there is no pg pool; skip transaction wrapping.
    const pool = dbPool as Pool | null;
    if (!pool || typeof pool.connect !== 'function') {
      req.tx = db;
      return next();
    }

    // Get a dedicated connection from the pool
    const client = await pool.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Set RLS context using LOCAL (scoped to this transaction)
      await client.query(
        `
        SELECT 
          set_config('app.current_user', $1, true),
          set_config('app.current_email', $2, true),
          set_config('app.current_org', $3, true),
          set_config('app.current_fund', $4, true),
          set_config('app.current_role', $5, true),
          set_config('app.current_partner', $6, true)
      `,
        [userId, email, orgId, fundId || '', role, partnerId || '']
      );

      // Set safety timeouts to prevent long-running queries
      await client.query(`SET LOCAL statement_timeout = '10s'`);
      await client.query(`SET LOCAL lock_timeout = '2s'`);
      await client.query(`SET LOCAL idle_in_transaction_session_timeout = '30s'`);

      // Attach client and transaction-aware db to request
      req.pgClient = client;
      req.tx = db; // This should be wrapped with the client

      // Track transaction completion
      let transactionCompleted = false;

      // Auto-commit on successful response
      const originalEnd = res.end.bind(res);
      res.end = function (this: Response, ...args: Parameters<Response['end']>) {
        if (!transactionCompleted) {
          transactionCompleted = true;

          // Commit or rollback based on response status
          const shouldCommit = res.statusCode < 400;

          client
            .query(shouldCommit ? 'COMMIT' : 'ROLLBACK')
            .catch((err) => console.error('Transaction finalization error:', err))
            .finally(() => {
              client.release();
            });
        }

        return originalEnd(...args);
      } as Response['end'];

      // Handle premature close
      res['on']('close', () => {
        if (!transactionCompleted) {
          transactionCompleted = true;
          client
            .query('ROLLBACK')
            .catch((err) => console.error('Rollback error on close:', err))
            .finally(() => {
              client.release();
            });
        }
      });

      // Continue to route handler
      next();
    } catch (error) {
      // Rollback and release on setup error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      } finally {
        client.release();
      }

      // Pass error to Express error handler
      next(error);
    }
  };
}

/**
 * Verify RLS context is properly set
 * Useful for debugging and tests
 */
export async function verifyRLSContext(req: RLSRequest): Promise<{
  current_user: string;
  current_org: string;
  current_fund: string;
  current_role: string;
}> {
  if (!req.pgClient) {
    throw new Error('No active RLS transaction');
  }

  const result = await req.pgClient.query(`
    SELECT 
      current_setting('app.current_user', true) as current_user,
      current_setting('app.current_org', true) as current_org,
      current_setting('app.current_fund', true) as current_fund,
      current_setting('app.current_role', true) as current_role
  `);

  return result.rows[0]!;
}

/**
 * Execute a query within the request's RLS transaction
 */
export async function executeInRLSContext<T>(
  req: RLSRequest,
  queryFn: (_client: any) => Promise<T>
): Promise<T> {
  if (!req.pgClient) {
    throw new Error('No active RLS transaction - ensure withRLSTransaction middleware is applied');
  }

  return queryFn(req.pgClient);
}

/**
 * Helper to check if user has access to a specific fund
 */
export async function checkFundAccess(req: RLSRequest, fundId: string): Promise<boolean> {
  if (!req.pgClient) {
    return false;
  }

  const result = await req.pgClient.query(
    `SELECT 1 FROM funds 
     WHERE id = $1 
     AND organization_id = current_setting('app.current_org')::uuid
     LIMIT 1`,
    [fundId]
  );

  return result.rowCount > 0;
}

/**
 * Log RLS context for debugging
 */
export function logRLSContext(req: RLSRequest, prefix: string = ''): void {
  if (process.env['NODE_ENV'] === 'development' || process.env['DEBUG_RLS'] === 'true') {
    verifyRLSContext(req)
      .then((context) => {
        console.log(`${prefix} RLS Context:`, context);
      })
      .catch((err) => {
        console.error(`${prefix} Failed to get RLS context:`, err);
      });
  }
}
