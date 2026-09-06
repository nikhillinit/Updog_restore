/**
 * Request-Scoped RLS Transaction Middleware
 * Ensures every request runs in a database transaction with proper RLS context
 */

import type { Request, Response, NextFunction } from 'express';
import { db, pool as dbPool, runWithDatabaseContext } from '../db.js';
import { getRequestDatabaseScope } from '../db/request-context.js';
import { isPublicApiPath } from '../lib/public-api-boundary.js';
import { logger } from '../lib/logger.js';
import type { UserContext } from '../lib/secure-context.js';
import type { Pool, PoolClient } from 'pg';

const log =
  typeof logger.child === 'function'
    ? logger.child({ module: 'middleware:with-rls-transaction' })
    : logger;

export interface RLSRequest extends Request {
  context?: UserContext;
  tx?: typeof db;
  pgClient?: PoolClient;
}

/**
 * Middleware that wraps each request in a database transaction
 * with RLS context properly set via SET LOCAL
 */
export function withRLSTransaction() {
  return async (req: RLSRequest, res: Response, next: NextFunction) => {
    if (!req.context)
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    const pool = dbPool as Pool | null;
    if (!pool || typeof pool.connect !== 'function') {
      req.tx = db;
      return next();
    }

    const context = { ...req.context };
    const originalEnd = res.end;
    const originalWrite = res.write;
    const originalWriteHead = res.writeHead;
    const originalFlushHeaders = res.flushHeaders;
    const rejectedResponse = new Error('Request returned an error status');
    const disconnected = new Error('Request disconnected');
    let pendingEnd: Parameters<Response['end']> | undefined;
    let rejectResponse: (error: Error) => void = () => {};
    const onClose = () => rejectResponse(disconnected);
    const restoreResponse = () => {
      res.end = originalEnd;
      res.write = originalWrite;
      res.writeHead = originalWriteHead;
      res.flushHeaders = originalFlushHeaders;
      res.off('close', onClose);
    };

    try {
      await runWithDatabaseContext(context, async (tx, connection) => {
        if (res.destroyed) throw disconnected;
        req.pgClient = connection;
        req.tx = tx;
        const scope = getRequestDatabaseScope()!;
        await new Promise<void>((resolve, reject) => {
          rejectResponse = reject;
          res.end = ((...args: Parameters<Response['end']>) => {
            if (pendingEnd) return res;
            pendingEnd = args;
            if (res.statusCode >= 400) reject(rejectedResponse);
            else resolve();
            return res;
          }) as Response['end'];
          const denyEarlyWrite = () => {
            throw new Error('Streaming is not supported inside a request transaction');
          };
          res.write = denyEarlyWrite as Response['write'];
          res.writeHead = denyEarlyWrite as Response['writeHead'];
          res.flushHeaders = denyEarlyWrite;
          res.once('close', onClose);
          try {
            next();
          } catch (error) {
            reject(error);
          }
        });
        scope.completed = true;
      });
      restoreResponse();
      if (!res.destroyed && pendingEnd) originalEnd.apply(res, pendingEnd);
    } catch (error) {
      restoreResponse();
      if (error === disconnected || res.destroyed) return;
      if (error === rejectedResponse && pendingEnd) {
        originalEnd.apply(res, pendingEnd);
      } else {
        log.error({ err: error }, 'Request transaction failed');
        res.removeHeader('Content-Length');
        res.removeHeader('ETag');
        res
          .status(500)
          .json({ error: 'internal_error', code: 'TRANSACTION_FAILED', requestId: req.requestId });
      }
    } finally {
      restoreResponse();
    }
  };
}

/** Both HTTP assemblies use this boundary; streaming routes retain their own authorization. */
export function protectedRLSTransaction() {
  const transaction = withRLSTransaction();
  return (req: RLSRequest, res: Response, next: NextFunction) => {
    if (
      isPublicApiPath(req.method, req.path) ||
      (req.method === 'POST' && req.path === '/auth/logout')
    )
      return next();
    const streaming =
      req.method === 'GET' &&
      (/^\/(?:backtesting|monte-carlo)\/jobs\/[^/]+\/stream\/?$/i.test(req.path) ||
        /^\/events\/(?:fund|simulation)\/[^/]+\/?$/i.test(req.path) ||
        /^\/performance\/realtime\/?$/i.test(req.path));
    if (streaming) return next();
    // Explicit test/memory mode has no PostgreSQL connection to bind.
    if (!dbPool) return next();
    // These handlers carry verified context into short load/persist transactions around computation.
    const managedSimulation =
      (req.method === 'POST' &&
        /^\/monte-carlo\/(?:simulate(?:\/async)?|batch|multi-environment)\/?$/i.test(req.path)) ||
      (req.method === 'GET' && /^\/monte-carlo\/funds\/[^/]+\/simulate\/?$/i.test(req.path));
    if (managedSimulation && req.context?.userId) return next();
    return transaction(req, res, next);
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

  const result = await req.pgClient.query<{
    current_user: string;
    current_org: string;
    current_fund: string;
    current_role: string;
  }>(`
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
  queryFn: (_client: PoolClient) => Promise<T>
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

  return (result.rowCount ?? 0) > 0;
}

/**
 * Log RLS context for debugging
 */
export function logRLSContext(req: RLSRequest, prefix: string = ''): void {
  if (process.env['NODE_ENV'] === 'development' || process.env['DEBUG_RLS'] === 'true') {
    verifyRLSContext(req)
      .then((context) => {
        log.debug({ prefix, context }, 'RLS Context');
      })
      .catch((err) => {
        log.error({ prefix, err }, 'Failed to get RLS context');
      });
  }
}
