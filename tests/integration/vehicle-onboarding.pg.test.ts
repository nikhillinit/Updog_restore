import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VehicleOnboardingRequest } from '../../shared/contracts/lp-reporting/vehicle-onboarding.contract';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

type Service = typeof import('../../server/services/lp-reporting/vehicle-onboarding-service');
type Intercept = (text: string, next: () => Promise<unknown>) => Promise<unknown>;
let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer;
let admin: Pool;
let service: Service;
let modulePool: { end?: () => Promise<void> };
let access: { fundId: number; actorId: number };
const envKeys = ['DATABASE_URL', 'NEON_DATABASE_URL', 'USE_REAL_DB_IN_VITEST'] as const;
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const runDocker =
  process.env['RUN_DOCKER_VEHICLE_ONBOARDING'] === '1' ||
  ['1', 'true'].includes(process.env['CI'] ?? '');

function request(): VehicleOnboardingRequest {
  return {
    contractVersion: 'vehicle-onboarding/1.0.0',
    vehicleSlug: 'main-fund',
    name: 'Synthetic main fund',
    committedCapital: '1000000.00',
    source: { sourceType: 'manual', content: 'Synthetic commitment: USD 1,000,000.' },
    sourceLocator: 'Synthetic declaration, paragraph 1',
    attestation: 'source-supports-commitment/1.0.0',
  };
}
function command() {
  return {
    ...access,
    idempotencyKey: randomUUID(),
    request: request(),
    context: {
      userId: String(access.actorId),
      fundId: String(access.fundId),
      role: 'admin',
      orgId: '',
      email: 'onboarding@example.invalid',
    },
  };
}
function connect(intercept?: Intercept) {
  return async (): Promise<PoolClient> => {
    const client = await admin.connect();
    if (!intercept) return client;
    return new Proxy(client, {
      get(target, property) {
        if (property === 'query') {
          return (...args: Parameters<PoolClient['query']>) => {
            const raw = args[0] as unknown;
            const text = typeof raw === 'string' ? raw : (raw as { text: string }).text;
            const next = () => Reflect.apply(target.query, target, args) as Promise<unknown>;
            return intercept(text, next);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
}
function options(intercept?: Intercept) {
  return { connect: connect(intercept), readPilotFundId: () => access.fundId };
}
async function separateProcess(input: ReturnType<typeof command>) {
  const script = `
    import { Pool } from 'pg';
    import { onboardMainFundVehicle } from './server/services/lp-reporting/vehicle-onboarding-service.ts';
    import { pool as modulePool } from './server/db.ts';
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const input = ${JSON.stringify(input)};
      const result = await onboardMainFundVehicle(input, {
        connect: () => pool.connect(), readPilotFundId: () => input.fundId,
      });
      process.stdout.write('RECEIPT:' + JSON.stringify(result) + '\\n');
    } finally {
      await pool.end();
      await modulePool?.end?.();
    }
  `;
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    { cwd: process.cwd(), env: process.env, timeout: 20_000, maxBuffer: 1024 * 1024 }
  );
  const receipt = stdout.split('\n').find((line) => line.startsWith('RECEIPT:'));
  if (!receipt) throw new Error('Separate command process returned no receipt.');
  return JSON.parse(receipt.slice('RECEIPT:'.length)) as Awaited<
    ReturnType<Service['onboardMainFundVehicle']>
  >;
}
async function counts() {
  return (
    await admin.query(`SELECT
      (SELECT count(*)::int FROM vehicles) AS vehicles,
      (SELECT count(*)::int FROM source_artifacts) AS artifacts,
      (SELECT count(*)::int FROM vehicle_onboarding_commands) AS commands,
      (SELECT count(*)::int FROM cash_flow_events) AS cash,
      (SELECT count(*)::int FROM financial_facts_snapshots) AS snapshots`)
  ).rows[0];
}
async function seed() {
  const fund = await admin.query<{ id: number }>(
    `INSERT INTO funds (name,size,management_fee,carry_percentage,vintage_year,status,is_active,base_currency,data_origin)
     VALUES ('Synthetic onboarding fund',2000000,0.02,0.2,2026,'active',true,'USD','production') RETURNING id`
  );
  const actor = await admin.query<{ id: number }>(
    `INSERT INTO users (username,password,role,is_active,is_release_canary_principal)
     VALUES ('onboarding-admin','x','admin',true,false) RETURNING id`
  );
  access = { fundId: fund.rows[0]!.id, actorId: actor.rows[0]!.id };
  await admin.query('INSERT INTO user_fund_grants (user_id,fund_id) VALUES ($1,$2)', [
    access.actorId,
    access.fundId,
  ]);
}

describe.skipIf(!runDocker)('vehicle onboarding PostgreSQL', { retry: 0 }, () => {
  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('vehicle_onboarding')
      .start();
    const url = container.getConnectionUri();
    admin = new Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 2000 });
    await runMigrationsWithConnectionString(url, '0062_vehicle_onboarding_commands');
    await admin.query('CREATE ROLE onboarding_app NOLOGIN NOSUPERUSER NOBYPASSRLS');
    await admin.query('GRANT USAGE ON SCHEMA public TO onboarding_app');
    await admin.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO onboarding_app'
    );
    await admin.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO onboarding_app');
    Object.assign(process.env, { DATABASE_URL: url, USE_REAL_DB_IN_VITEST: '1' });
    delete process.env['NEON_DATABASE_URL'];
    vi.resetModules();
    service = await import('../../server/services/lp-reporting/vehicle-onboarding-service');
    modulePool = (await import('../../server/db')).pool as typeof modulePool;
  }, 120_000);
  afterAll(async () => {
    await modulePool?.end?.();
    await admin?.end();
    await container?.stop();
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }, 120_000);
  beforeEach(async () => {
    await admin.query('TRUNCATE funds, users RESTART IDENTITY CASCADE');
    await seed();
  });

  it('binds a live-granted fund on an ordinary request connection initially missing route fund context', async () => {
    const { applyRLSContext, requestDatabaseStorage } =
      await import('../../server/db/request-context');
    const { combinedSchema } = await import('../../server/db-schema');
    const input = command();
    const initialContext = {
      userId: input.context.userId,
      role: input.context.role,
      orgId: input.context.orgId,
      email: input.context.email,
    };
    async function inRequest() {
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE onboarding_app');
        await applyRLSContext(client, initialContext);
        expect(
          (await client.query("SELECT current_setting('app.current_fund') AS fund")).rows[0].fund
        ).toBe('');
        expect(
          (
            await client.query(
              'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
            )
          ).rows[0]
        ).toEqual({ rolsuper: false, rolbypassrls: false });
        const result = await requestDatabaseStorage.run(
          {
            context: initialContext,
            client,
            db: drizzle(client, { schema: combinedSchema }),
            completed: false,
            runOwnedTransaction: async () => {
              throw new Error('Unexpected nested transaction');
            },
          },
          () =>
            service.onboardMainFundVehicle(input, {
              readPilotFundId: () => access.fundId,
              connect: async () => {
                throw new Error('Unexpected independent connection');
              },
            })
        );
        expect(
          (await client.query("SELECT current_setting('app.current_fund') AS fund")).rows[0].fund
        ).toBe(String(access.fundId));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    const first = await inRequest();
    const replay = await inRequest();
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.responseBody).toBe(first.responseBody);
    expect(await counts()).toMatchObject({ vehicles: 1, artifacts: 1, commands: 1 });
    await admin.query('DELETE FROM user_fund_grants WHERE user_id = $1', [access.actorId]);
    await expect(inRequest()).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(await counts()).toMatchObject({ vehicles: 1, artifacts: 1, commands: 1 });
  });

  it('creates source, vehicle and receipt atomically without deriving commitment from fund size', async () => {
    const input = command();
    const first = await service.onboardMainFundVehicle(input, options());
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      fundId: access.fundId,
      committedCapital: '1000000.00',
      outcome: 'created',
    });
    expect(await counts()).toEqual({
      vehicles: 1,
      artifacts: 1,
      commands: 1,
      cash: 0,
      snapshots: 0,
    });
    const row = (
      await admin.query(
        'SELECT committed_capital::text AS amount, vehicle_slug, currency, status FROM vehicles'
      )
    ).rows[0];
    expect(row).toEqual({
      amount: '1000000.000000',
      vehicle_slug: 'main-fund',
      currency: 'USD',
      status: 'active',
    });
    expect((await admin.query('SELECT size::text FROM funds')).rows[0].size).toBe('2000000.00');
    const replay = await service.onboardMainFundVehicle(input, options());
    expect(replay.responseBody).toBe(first.responseBody);
    expect(replay.status).toBe(first.status);
    expect(await counts()).toEqual({
      vehicles: 1,
      artifacts: 1,
      commands: 1,
      cash: 0,
      snapshots: 0,
    });
  });

  it('preserves exact existing registry fields while recording a new declaration', async () => {
    const first = await service.onboardMainFundVehicle(command(), options());
    const before = (await admin.query('SELECT row_to_json(v) AS row FROM vehicles v')).rows[0].row;
    const second = await service.onboardMainFundVehicle(command(), options());
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ outcome: 'existing', vehicleId: first.body.vehicleId });
    expect((await admin.query('SELECT row_to_json(v) AS row FROM vehicles v')).rows[0].row).toEqual(
      before
    );
    expect(await counts()).toMatchObject({ vehicles: 1, artifacts: 2, commands: 2 });
  });

  it('converges simultaneous same-key requests on one effect and byte-equivalent receipt', async () => {
    const input = command();
    const results = await Promise.all([
      service.onboardMainFundVehicle(input, options()),
      service.onboardMainFundVehicle(input, options()),
    ]);
    expect(results[0]?.responseBody).toBe(results[1]?.responseBody);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(await counts()).toMatchObject({ vehicles: 1, artifacts: 1, commands: 1 });
  });

  it('converges different keys and same declaration without updating the vehicle', async () => {
    const results = await Promise.all([
      service.onboardMainFundVehicle(command(), options()),
      service.onboardMainFundVehicle(command(), options()),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 201]);
    expect(new Set(results.map((result) => result.body.vehicleId)).size).toBe(1);
    expect(await counts()).toMatchObject({ vehicles: 1, artifacts: 2, commands: 2 });
  });

  it.each([true, false])(
    'allows one winner for conflicting declarations (same key: %s)',
    async (sameKey) => {
      const first = command();
      const second = command();
      if (sameKey) second.idempotencyKey = first.idempotencyKey;
      second.request.committedCapital = '900000.00';
      const results = await Promise.allSettled([
        service.onboardMainFundVehicle(first, options()),
        service.onboardMainFundVehicle(second, options()),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const denied = results.find((result) => result.status === 'rejected');
      expect(denied).toMatchObject({
        status: 'rejected',
        reason: { code: sameKey ? 'IDEMPOTENCY_KEY_REUSE' : 'VEHICLE_DECLARATION_CONFLICT' },
      });
      expect(await counts()).toMatchObject({ vehicles: 1, artifacts: 1, commands: 1 });
    }
  );

  it.each(['vehicle', 'receipt'])(
    'rolls back the source and vehicle on %s insertion failure',
    async (step) => {
      const intercepted = options(async (text, next) => {
        if (
          text.includes(
            step === 'vehicle' ? 'INSERT INTO vehicles' : 'INSERT INTO vehicle_onboarding_commands'
          )
        ) {
          throw new Error(`Synthetic ${step} failure`);
        }
        return next();
      });
      await expect(service.onboardMainFundVehicle(command(), intercepted)).rejects.toThrow(
        `Synthetic ${step} failure`
      );
      expect(await counts()).toEqual({
        vehicles: 0,
        artifacts: 0,
        commands: 0,
        cash: 0,
        snapshots: 0,
      });
    }
  );

  it('replays an unknown commit outcome after purging source bytes', async () => {
    const input = command();
    const interrupted = options(async (text, next) => {
      const result = await next();
      if (text === 'COMMIT') throw new Error('Synthetic response loss after commit');
      return result;
    });
    await expect(service.onboardMainFundVehicle(input, interrupted)).rejects.toMatchObject({
      code: 'ONBOARDING_OUTCOME_UNKNOWN',
    });
    const stored = (await admin.query('SELECT response_body FROM vehicle_onboarding_commands'))
      .rows[0].response_body;
    await admin.query(
      'UPDATE source_artifacts SET payload = NULL, purged_at = now() WHERE purged_at IS NULL'
    );
    const replay = await service.onboardMainFundVehicle(input, options());
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(stored);
    const again = await service.onboardMainFundVehicle(input, options());
    expect(again.responseBody).toBe(replay.responseBody);
    expect(await counts()).toMatchObject({ vehicles: 1, artifacts: 1, commands: 1 });
  });

  it('replays identical status and raw body from a fresh OS process after source payload purge', async () => {
    const input = command();
    const first = await separateProcess(input);
    await admin.query(
      'UPDATE source_artifacts SET payload = NULL, purged_at = now() WHERE purged_at IS NULL'
    );
    const restarted = await separateProcess(input);
    expect(first.status).toBe(201);
    expect(restarted.status).toBe(first.status);
    expect(restarted.responseBody).toBe(first.responseBody);
    expect(await counts()).toMatchObject({ vehicles: 1, artifacts: 1, commands: 1 });
  });

  it('checks current grants before replay and refuses another actor using the same key', async () => {
    const input = command();
    await service.onboardMainFundVehicle(input, options());
    const other = (
      await admin.query<{ id: number }>(
        `INSERT INTO users (username,password,role,is_active) VALUES ('other-admin','x','admin',true) RETURNING id`
      )
    ).rows[0]!.id;
    await admin.query('INSERT INTO user_fund_grants (user_id,fund_id) VALUES ($1,$2)', [
      other,
      access.fundId,
    ]);
    await expect(
      service.onboardMainFundVehicle(
        { ...input, actorId: other, context: { ...input.context, userId: String(other) } },
        options()
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE' });
    await admin.query('DELETE FROM user_fund_grants WHERE user_id = $1', [access.actorId]);
    await expect(service.onboardMainFundVehicle(input, options())).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    expect(await counts()).toMatchObject({ vehicles: 1, artifacts: 1, commands: 1 });
  });

  it.each([
    'UPDATE users SET is_active = false',
    "UPDATE users SET role = 'partner'",
    'UPDATE users SET is_release_canary_principal = true',
    "UPDATE funds SET base_currency = 'EUR'",
  ])('refuses ineligible current state with no writes: %s', async (sql) => {
    await admin.query(sql);
    await expect(service.onboardMainFundVehicle(command(), options())).rejects.toBeDefined();
    expect(await counts()).toEqual({
      vehicles: 0,
      artifacts: 0,
      commands: 0,
      cash: 0,
      snapshots: 0,
    });
  });

  it.each([
    { type: 'main_fund', slug: 'main-fund', status: 'closed', amount: '1000000.00' },
    { type: 'main_fund', slug: 'main-fund', status: 'active', amount: null },
    { type: 'main_fund', slug: 'different', status: 'active', amount: '1000000.00' },
    { type: 'spv', slug: 'main-fund', status: 'active', amount: '1000000.00' },
  ])('refuses conflicting registry row %j without changing it', async (row) => {
    await admin.query(
      `INSERT INTO vehicles (fund_id,vehicle_slug,vehicle_type,name,status,committed_capital)
      VALUES ($1,$2,$3,'Synthetic main fund',$4,$5)`,
      [access.fundId, row.slug, row.type, row.status, row.amount]
    );
    const before = (await admin.query('SELECT row_to_json(v) AS row FROM vehicles v')).rows[0].row;
    await expect(service.onboardMainFundVehicle(command(), options())).rejects.toMatchObject({
      statusCode: 409,
    });
    expect((await admin.query('SELECT row_to_json(v) AS row FROM vehicles v')).rows[0].row).toEqual(
      before
    );
    expect(await counts()).toMatchObject({ vehicles: 1, artifacts: 0, commands: 0 });
  });

  it('bounds contention and permits the identical retry after the competing lock is released', async () => {
    const locker = await admin.connect();
    const input = command();
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM funds WHERE id = $1 FOR UPDATE', [access.fundId]);
    const started = Date.now();
    try {
      await expect(service.onboardMainFundVehicle(input, options())).rejects.toMatchObject({
        code: '55P03',
      });
      expect(Date.now() - started).toBeLessThan(6000);
      expect(await counts()).toMatchObject({ vehicles: 0, artifacts: 0, commands: 0 });
    } finally {
      await locker.query('ROLLBACK');
      locker.release();
    }
    expect((await service.onboardMainFundVehicle(input, options())).status).toBe(201);
  });
});
