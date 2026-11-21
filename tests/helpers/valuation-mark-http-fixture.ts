import type { Server } from 'node:http';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { vi } from 'vitest';
import { runMigrationsWithConnectionString } from './testcontainers-migration';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from './testcontainers';

export const VALUATION_HTTP_FACTORIES = ['makeApp', 'createServer'] as const;
export type ValuationHttpFactory = (typeof VALUATION_HTTP_FACTORIES)[number];
const BUSINESS_TABLES = [
  'valuation_marks',
  'cash_flow_events',
  'portfoliocompanies',
  'vehicles',
] as const;

export async function createValuationHttpFixture() {
  const originalEnvironment = { ...process.env };
  const cleanupSteps: Record<string, () => Promise<unknown> | void> = {
    environment: () => {
      for (const key of Object.keys(process.env))
        if (!(key in originalEnvironment)) delete process.env[key];
      Object.assign(process.env, originalEnvironment);
    },
  };
  async function cleanup() {
    const failures: unknown[] = [];
    for (const step of [
      'health',
      'server',
      'providers',
      'applicationPool',
      'observer',
      'database',
      'role',
      'admin',
      'spies',
      'containers',
      'environment',
    ]) {
      try {
        await cleanupSteps[step]?.();
      } catch (error) {
        failures.push(error);
      }
      delete cleanupSteps[step];
    }
    if (failures.length)
      throw new AggregateError(failures, 'Valuation import HTTP fixture cleanup failed');
  }
  try {
    const ownsContainers = !process.env.TEST_DATABASE_URL;
    if (ownsContainers) {
      cleanupSteps.containers = cleanupTestContainers;
      await setupTestContainers();
    }
    const url = new URL(process.env.TEST_DATABASE_URL ?? getPostgresConnectionString());
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('Owned local PostgreSQL required');
    const admin = new Pool({ connectionString: url.toString(), max: 1 });
    cleanupSteps.admin = () => admin.end();
    const databaseName = `valuation_g3_http_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    cleanupSteps.database = () =>
      admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    url.pathname = `/${databaseName}`;
    await runMigrationsWithConnectionString(url.toString());
    const observer = new Client({ connectionString: url.toString() });
    cleanupSteps.observer = () => observer.end();
    await observer.connect();
    // Use a non-superuser application role; the observer uses a separate connection.
    await admin.query(`CREATE ROLE "${databaseName}" LOGIN PASSWORD '${databaseName}'`);
    cleanupSteps.role = () => admin.query(`DROP ROLE IF EXISTS "${databaseName}"`);
    await observer.query(`GRANT USAGE ON SCHEMA public TO "${databaseName}";
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${databaseName}";
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${databaseName}"`);
    url.username = databaseName;
    url.password = databaseName;
    Object.assign(process.env, {
      DATABASE_URL: url.toString(),
      _EXPLICIT_DATABASE_URL: '1',
      USE_REAL_DB_IN_VITEST: '1',
      NODE_ENV: 'test',
      _EXPLICIT_NODE_ENV: 'test',
      REDIS_URL: 'memory://',
      _EXPLICIT_REDIS_URL: '1',
      ENABLE_QUEUES: '0',
      _EXPLICIT_ENABLE_QUEUES: '1',
      JWT_SECRET: 'valuation-http-synthetic-local-secret-at-least-32-bytes',
      _EXPLICIT_JWT_SECRET: '1',
    });
    delete process.env.NEON_DATABASE_URL;
    const db = await import('../../server/db');
    cleanupSteps.applicationPool = () => db.closeDatabasePool();
    const jwt = await import('../../server/lib/auth/jwt');
    const app = (await import('../../server/app')).makeApp();
    // These unrelated background schedulers are outside the HTTP command proof.
    const completion = await import('../../server/services/calc-run-completion-handlers');
    const variance = await import('../../server/services/variance-alert-automation');
    const retention =
      await import('../../server/services/financial-observations/artifact-retention-service');
    const checkpoint =
      await import('../../server/services/internal-analysis/analysis-checkpoint-service');
    const schedulers = [
      vi.spyOn(completion, 'registerCompletionHandlers').mockImplementation(() => {}),
      vi.spyOn(variance.varianceAlertAutomationService, 'start').mockImplementation(() => {}),
      vi.spyOn(retention.artifactRetentionService, 'start').mockImplementation(() => {}),
      vi.spyOn(checkpoint.internalAnalysisCheckpointService, 'start').mockImplementation(() => {}),
    ];
    cleanupSteps.spies = () => {
      for (const spy of schedulers) spy.mockRestore();
    };
    const config = (await import('../../server/config/index')).loadEnv();
    const providers = await (await import('../../server/providers')).buildProviders(config);
    cleanupSteps.providers = () => providers.teardown();
    const server: Server = await (
      await import('../../server/server')
    ).createServer(config, providers);
    cleanupSteps.server = async () => {
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
    };
    const health = await import('../../server/health/state');
    health.setReady(true);
    cleanupSteps.health = () => health.setReady(false);
    async function seed() {
      const fundId = Number(
        (
          await observer.query(
            `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
         VALUES ('valuation-http', 100000000, '0.0200', '0.2000', 2026) RETURNING id`
          )
        ).rows[0].id
      );
      const userId = Number(
        (
          await observer.query(
            "INSERT INTO users (username, password) VALUES ($1, 'unused') RETURNING id",
            [`valuation-http-${fundId}`]
          )
        ).rows[0].id
      );
      const companyId = Number(
        (
          await observer.query(
            `INSERT INTO portfoliocompanies (fund_id, name, sector, stage, investment_amount)
         VALUES ($1, $2, 'technology', 'seed', '1000000') RETURNING id`,
            [fundId, `protected-company-${fundId}`]
          )
        ).rows[0].id
      );
      const vehicleId = Number(
        (
          await observer.query(
            `INSERT INTO vehicles (fund_id, vehicle_slug, vehicle_type, name)
         VALUES ($1, 'main', 'main_fund', $2) RETURNING id`,
            [fundId, `protected-vehicle-${fundId}`]
          )
        ).rows[0].id
      );
      // Nonempty sentinels catch accidental updates/deletes as well as new rows.
      await observer.query(
        `INSERT INTO valuation_marks
         (fund_id, company_id, vehicle_id, mark_date, as_of_date, fair_value,
          mark_source, confidence_level, valuation_method, created_by)
         VALUES ($1, $2, $3, '2025-01-01', '2025-01-01', '1000000',
          'financing_round', 'high', 'priced_round', $4)`,
        [fundId, companyId, vehicleId, userId]
      );
      return { fundId, userId, companyId, vehicleId };
    }
    const token = (userId: number, fundIds: number[], role = 'partner', lpId?: number) =>
      jwt.signToken({
        sub: String(userId),
        email: 'valuation@example.invalid',
        orgId: 'valuation-http',
        role,
        fundIds,
        ...(lpId === undefined ? {} : { lpId }),
      });
    async function projection(fundId: number) {
      const values: Record<string, unknown[]> = {};
      for (const table of ['funds', ...BUSINESS_TABLES]) {
        values[table] = (
          await observer.query(
            `SELECT to_jsonb(row) AS value FROM ${table} AS row
           WHERE ${table === 'funds' ? 'id' : 'fund_id'} = $1 ORDER BY id`,
            [fundId]
          )
        ).rows.map((row) => row.value);
      }
      return values;
    }
    function sendPath(
      factory: ValuationHttpFactory,
      path: string,
      body: object,
      credential: string | null,
      ifMatch?: string
    ) {
      const call = request(factory === 'makeApp' ? app : server).post(path);
      if (credential !== null) call.set('Authorization', `Bearer ${credential}`);
      if (ifMatch !== undefined) call.set('If-Match', ifMatch);
      return call.send(body);
    }
    function send(
      factory: ValuationHttpFactory,
      fundId: number | string,
      body: object,
      credential: string | null
    ) {
      return sendPath(
        factory,
        `/api/funds/${fundId}/imports/valuation-marks/commit`,
        body,
        credential
      );
    }
    return { app, observer, token, seed, projection, send, sendPath, cleanup };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Valuation HTTP fixture setup and cleanup failed'
      );
    }
    throw error;
  }
}
