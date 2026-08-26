/**
 * LP Reporting Dashboard Health Check Endpoint
 *
 * Provides comprehensive health checks for the LP Reporting feature:
 * - Database connectivity for LP tables
 * - Redis cache availability
 * - Report storage directory accessibility
 *
 * Used by load balancers and monitoring systems to assess feature health.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { constants as fsConstants } from 'fs';
import { promises as fs } from 'fs';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface TableCheckResult {
  status: HealthStatus;
  error?: string;
}

interface DatabaseCheckResult {
  status: HealthStatus;
  latencyMs: number;
  tables: Record<string, TableCheckResult>;
  missingTables: string[];
  error?: string;
}

interface RedisCheckResult {
  status: HealthStatus;
  enabled: boolean;
  mode: string;
  latencyMs?: number;
  error?: string;
}

interface ReportStorageCheckResult {
  status: HealthStatus;
  path: string;
  exists: boolean;
  writable: boolean;
  error?: string;
}

interface LPHealthResponse {
  status: HealthStatus;
  checks: {
    database: DatabaseCheckResult;
    redis: RedisCheckResult;
    reportStorage: ReportStorageCheckResult;
  };
  timestamp: string;
}

const router = Router();

const lpTableNames = [
  'limited_partners',
  'lp_fund_commitments',
  'capital_activities',
  'lp_distributions',
  'lp_capital_accounts',
  'lp_performance_snapshots',
  'lp_reports',
  'report_templates',
];

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveOverallStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('unhealthy')) {
    return 'unhealthy';
  }
  if (statuses.includes('degraded')) {
    return 'degraded';
  }
  return 'healthy';
}

async function checkDatabase(): Promise<DatabaseCheckResult> {
  const start = Date.now();

  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      tables: {},
      missingTables: lpTableNames,
      error: formatError(error),
    };
  }

  const tables: Record<string, TableCheckResult> = {};
  const missingTables: string[] = [];

  for (const tableName of lpTableNames) {
    try {
      // eslint-disable-next-line povc-security/no-sql-raw-in-routes -- tableName from hardcoded constant array, not user input
      await db.execute(sql.raw(`SELECT 1 FROM "${tableName}" LIMIT 1`));
      tables[tableName] = { status: 'healthy' };
    } catch (error) {
      tables[tableName] = { status: 'degraded', error: formatError(error) };
      missingTables.push(tableName);
    }
  }

  return {
    status: missingTables.length > 0 ? 'degraded' : 'healthy',
    latencyMs: Date.now() - start,
    tables,
    missingTables,
  };
}

async function checkRedis(): Promise<RedisCheckResult> {
  const redisUrl = process.env['REDIS_URL'];
  const memoryMode = process.env['REDIS_URL']?.includes('memory://');

  if (!redisUrl || memoryMode) {
    return {
      status: 'healthy',
      enabled: false,
      mode: memoryMode ? 'memory' : 'disabled',
    };
  }

  const start = Date.now();
  try {
    // Import Redis dynamically to avoid hard dependency
    const { createClient } = await import('redis');
    const client = createClient({
      url: redisUrl,
      socket: { reconnectStrategy: () => new Error('No retry') },
    });

    await client.connect();
    const pong = await client.ping();
    await client.quit();

    return {
      status: pong ? 'healthy' : 'degraded',
      enabled: true,
      mode: 'cluster',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'degraded',
      enabled: true,
      mode: 'cluster',
      error: formatError(error),
    };
  }
}

async function checkReportStorage(): Promise<ReportStorageCheckResult> {
  const storagePath = process.env['LP_REPORT_STORAGE_PATH'] || '/tmp/reports';

  try {
    const stats = await fs.stat(storagePath);
    const isDirectory = stats.isDirectory();

    let writable = false;
    try {
      await fs.access(storagePath, fsConstants.R_OK | fsConstants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }

    const status: HealthStatus = !isDirectory ? 'unhealthy' : writable ? 'healthy' : 'degraded';

    return {
      status,
      path: storagePath,
      exists: true,
      writable,
      ...(!isDirectory
        ? { error: 'Report storage path is not a directory' }
        : !writable
          ? { error: 'Report storage path is not writable' }
          : {}),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      path: storagePath,
      exists: false,
      writable: false,
      error: formatError(error),
    };
  }
}

/**
 * GET /api/lp/health
 * Health check endpoint for LP Reporting feature
 *
 * Returns:
 * - 200: Feature is operational (all checks healthy or degraded)
 * - 503: Feature is unavailable (critical checks unhealthy)
 */
router.get('/api/lp/health', async (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');

  try {
    const [database, redis, reportStorage] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkReportStorage(),
    ]);

    const status = resolveOverallStatus([database.status, redis.status, reportStorage.status]);

    const response: LPHealthResponse = {
      status,
      checks: {
        database,
        redis,
        reportStorage,
      },
      timestamp: new Date().toISOString(),
    };

    // Return 503 if status is unhealthy, 200 otherwise
    const httpStatus = status === 'unhealthy' ? 503 : 200;
    res.status(httpStatus).json(response);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      checks: {
        database: {
          status: 'unhealthy',
          latencyMs: 0,
          tables: {},
          missingTables: lpTableNames,
          error: formatError(error),
        },
        redis: { status: 'unhealthy', enabled: false, mode: 'unknown', error: formatError(error) },
        reportStorage: {
          status: 'unhealthy',
          path: process.env['LP_REPORT_STORAGE_PATH'] || '/tmp/reports',
          exists: false,
          writable: false,
          error: formatError(error),
        },
      },
      timestamp: new Date().toISOString(),
    } as LPHealthResponse);
  }
});

export default router;
