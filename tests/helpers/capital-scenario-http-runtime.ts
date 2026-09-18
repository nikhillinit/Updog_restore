import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { escapeIdentifier, escapeLiteral, Pool } from 'pg';
import type { Express } from 'express';
import {
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  type CapitalUnitDeclarationsV1,
} from '../../shared/contracts/capital-planning-v1.contract';
import type {
  CreateFundScenarioSetV3,
  FundScenarioCapitalRequestInputV1,
} from '../../shared/contracts/fund-scenario-sets-v1.contract';
import {
  fingerprintCapitalSource,
  type CapitalRawSource,
} from '../../shared/lib/capital-planning/materialize-from-fund-draft';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../fixtures/capital-planning/fixtures';
import {
  cookieHeader,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
} from './browser-auth';
import { runMigrationsWithConnectionString } from './testcontainers-migration';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXED_PUBLISHED_AT = '2026-07-01T00:00:00.000Z';
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const AUDIT_TABLES = [
  'funds',
  'fundconfigs',
  'users',
  'user_fund_grants',
  'revoked_tokens',
  'fund_scenario_sets',
  'fund_scenario_variants',
  'fund_scenario_calculation_runs',
  'fund_snapshots',
  'fund_scenario_set_events',
] as const;

export interface CapitalSourceSeed {
  rawConfig: unknown;
  fundSize: string;
  baseCurrency: string;
  publishedAt?: string;
}
export interface CapitalRuntimeOptions {
  label: string;
  evidenceDir: string;
  mode?: 'process' | 'in-process';
  source?: CapitalSourceSeed;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  rateLimitMax?: number;
  beforeAppImport?: () => Promise<void | (() => void | Promise<void>)>;
}
export interface CapitalActor {
  userId: number;
  role: string;
  fundIds: number[];
  bearer: string;
  sessionToken: string;
  csrfToken: string;
  bearerHeaders: Record<string, string>;
  cookieHeaders: Record<string, string>;
}
export interface CapitalHttpResponse {
  status: number;
  headers: Record<string, string | string[]>;
  rawBody: Buffer;
  body: unknown;
  elapsedMs: number;
}
export interface CapitalDatabaseState {
  tables: Record<string, Array<{ id: string; row: string; rowBinary: string }>>;
  payloads: Array<{ table: string; id: string; text: string; binary: string }>;
  sha256: string;
}
export interface RuntimeLifecycleReport {
  mode: 'process' | 'in-process';
  api: {
    graceful: boolean;
    exitCode: number | null;
    signal: string | null;
    forced: boolean;
    shutdownAcknowledged?: boolean;
    peakMemoryRssBytes?: number;
    activeResourcesAfterDrain?: string[];
  };
  adminPoolClosed: boolean;
  containerStopped: boolean;
  errors: string[];
}
interface ActorSeed {
  userId: number;
  role: string;
  fundIds: number[];
}
type ActorSeeds = Record<'writer' | 'deniedFund' | 'service' | 'dualFund', ActorSeed>;
type Actors = Record<keyof ActorSeeds, CapitalActor>;
export interface CapitalHttpRuntime {
  mode: 'process' | 'in-process';
  baseUrl: string;
  pool: Pool;
  fundId: number;
  secondFundId: number;
  source: CapitalRawSource;
  actors: Actors;
  identity: Record<string, unknown>;
  request(
    method: string,
    requestPath: string,
    options?: {
      headers?: Record<string, string>;
      body?: unknown;
      rawBody?: Buffer;
      actor?: CapitalActor;
      credential?: 'bearer' | 'cookie' | 'none';
      timeoutMs?: number;
    }
  ): Promise<CapitalHttpResponse>;
  snapshot(): Promise<CapitalDatabaseState>;
  close(): Promise<RuntimeLifecycleReport>;
}

async function bounded<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${milliseconds}ms`)),
          milliseconds
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function sanitizedEnvironment(databaseUrl: string, options: CapitalRuntimeOptions) {
  const env: NodeJS.ProcessEnv = {};
  const allowed =
    /^(?:PATH|HOME|TMPDIR|TEMP|TMP|USER|LOGNAME|SHELL|LANG|LC_[A-Z_]+|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|TESTCONTAINERS_[A-Z_]+|COLIMA_HOME|XDG_RUNTIME_DIR)$/;
  const removed: string[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (allowed.test(key)) env[key] = value;
    else removed.push(key);
  }
  const secret = `capital-runtime-${randomUUID()}-${randomUUID()}`;
  Object.assign(env, {
    NODE_ENV: 'test',
    _EXPLICIT_NODE_ENV: 'test',
    TZ: 'UTC',
    USE_REAL_DB_IN_VITEST: '1',
    ALLOW_MEMORY_STORAGE: '0',
    DATABASE_URL: databaseUrl,
    _EXPLICIT_DATABASE_URL: databaseUrl,
    REQUIRE_AUTH: '1',
    ENABLE_QUEUES: '0',
    _EXPLICIT_ENABLE_QUEUES: '0',
    ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
    _EXPLICIT_ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
    REDIS_URL: 'memory://',
    _EXPLICIT_REDIS_URL: 'memory://',
    QUEUE_REDIS_URL: 'memory://',
    _EXPLICIT_QUEUE_REDIS_URL: 'memory://',
    JWT_SECRET: secret,
    _EXPLICIT_JWT_SECRET: secret,
    SESSION_SECRET: secret,
    JWT_ISSUER: 'updog-api',
    _EXPLICIT_JWT_ISSUER: 'updog-api',
    JWT_AUDIENCE: 'updog-client',
    _EXPLICIT_JWT_AUDIENCE: 'updog-client',
    JWT_ALG: 'HS256',
    _EXPLICIT_JWT_ALG: 'HS256',
    TSX_TSCONFIG_PATH: path.join(ROOT, 'tsconfig.json'),
    LOG_LEVEL: 'error',
    COMMIT_REF: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  });
  if (options.rateLimitMax !== undefined) env['RATE_LIMIT_MAX'] = String(options.rateLimitMax);
  return { env, removed: removed.sort() };
}
function replaceEnvironment(env: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Runtime has no TCP address');
  return `http://127.0.0.1:${address.port}`;
}
async function stopHttp(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
}
export function requestCapitalHttp(
  url: string,
  method: string,
  options: {
    headers?: Record<string, string>;
    rawBody?: Buffer;
    timeoutMs?: number;
  } = {}
): Promise<CapitalHttpResponse> {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const headers = { ...options.headers };
    if (options.rawBody) headers['content-length'] = String(options.rawBody.byteLength);
    const req = httpRequest(url, { method, headers, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => {
        const rawBody = Buffer.concat(chunks);
        let body: unknown = null;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          body = rawBody.toString('utf8');
        }
        const presentHeaders: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(response.headers))
          if (value !== undefined) presentHeaders[key] = value;
        resolve({
          status: response.statusCode ?? 0,
          headers: presentHeaders,
          rawBody,
          body,
          elapsedMs: performance.now() - start,
        });
      });
    });
    req.setTimeout(options.timeoutMs ?? 30_000, () =>
      req.destroy(new Error('Capital HTTP request timed out'))
    );
    req.once('error', reject);
    req.end(options.rawBody);
  });
}

async function seed(pool: Pool, source: CapitalSourceSeed) {
  const fundIds: number[] = [];
  let rawSource: CapitalRawSource | undefined;
  for (let index = 0; index < 2; index += 1) {
    const fund = await pool.query<{ id: number }>(
      `INSERT INTO funds (id,name,size,base_currency,management_fee,carry_percentage,vintage_year)
       VALUES ($4,$1,$2,$3,'0.0200','0.2000',2026) RETURNING id`,
      [`Synthetic capital HTTP fund ${index}`, source.fundSize, source.baseCurrency, 101 + index]
    );
    const fundId = fund.rows[0]!.id;
    fundIds.push(fundId);
    const config = await pool.query<{ id: number; version: number; published_at: Date }>(
      `INSERT INTO fundconfigs (id,fund_id,version,config,is_draft,is_published,published_at)
       VALUES ($4,$1,1,$2,false,true,$3) RETURNING id,version,published_at`,
      [fundId, source.rawConfig, source.publishedAt ?? FIXED_PUBLISHED_AT, 11 + index]
    );
    if (index === 0)
      rawSource = {
        fund: { id: fundId, size: source.fundSize, baseCurrency: source.baseCurrency },
        config: {
          id: config.rows[0]!.id,
          version: 1,
          raw: structuredClone(source.rawConfig),
          publishedAt: config.rows[0]!.published_at.toISOString(),
        },
      };
  }
  const actors = {} as ActorSeeds;
  for (const [name, role, grants] of [
    ['writer', 'partner', [fundIds[0]!]],
    ['deniedFund', 'partner', [fundIds[1]!]],
    ['service', 'service', [fundIds[0]!]],
    ['dualFund', 'partner', fundIds],
  ] as const) {
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users (username,password,role,is_active) VALUES ($1,$2,$3,true) RETURNING id`,
      [`capital-${name}@example.invalid`, 'synthetic-non-login-password', role]
    );
    const userId = user.rows[0]!.id;
    for (const fundId of grants)
      await pool.query('INSERT INTO user_fund_grants(user_id,fund_id) VALUES($1,$2)', [
        userId,
        fundId,
      ]);
    actors[name] = { userId, role, fundIds: [...grants] };
  }
  return { fundId: fundIds[0]!, secondFundId: fundIds[1]!, source: rawSource!, actors };
}
async function bootApplication(
  actorSeeds: ActorSeeds,
  beforeAppImport?: CapitalRuntimeOptions['beforeAppImport']
) {
  const restore = await beforeAppImport?.();
  const { makeApp } = await import('../../server/app');
  const jwt = await import('../../server/lib/auth/jwt');
  const csrf = await import('../../server/lib/auth/csrf');
  const database = await import('../../server/db');
  const circuit = await import('../../server/db/pg-circuit');
  const redis = await import('../../server/db/redis-circuit');
  if (!database.pool) throw new Error('Real HTTP runtime unexpectedly booted memory database');
  const dbIdentity = await (database.pool as Pool).query(
    `SELECT current_database() AS database,current_user AS role,pg_backend_pid() AS backend_pid`
  );
  const actors = {} as Actors;
  for (const [key, actor] of Object.entries(actorSeeds)) {
    const claims = {
      sub: String(actor.userId),
      email: `capital-${key}@example.invalid`,
      role: actor.role,
      fundIds: actor.fundIds,
      org_id: 'synthetic-capital-org',
    };
    const bearer = jwt.signToken(claims);
    const sessionToken = jwt.signBrowserSessionToken(claims);
    const jti = jwt.verifyAccessToken(sessionToken).jti;
    if (!jti) throw new Error('Real session signer did not produce jti');
    const csrfToken = csrf.createSessionCsrfToken(jti);
    actors[key as keyof Actors] = {
      ...actor,
      bearer,
      sessionToken,
      csrfToken,
      bearerHeaders: { Authorization: `Bearer ${bearer}` },
      cookieHeaders: {
        Cookie: cookieHeader(
          { name: SESSION_COOKIE_NAME, value: sessionToken },
          { name: CSRF_COOKIE_NAME, value: csrfToken }
        ),
        [CSRF_HEADER_NAME]: csrfToken,
      },
    };
  }
  const app: Express = makeApp();
  const server = createServer(app);
  const baseUrl = await listen(server);
  return {
    baseUrl,
    actors,
    identity: {
      pid: process.pid,
      nodeVersion: process.version,
      startedAt: new Date().toISOString(),
      database: dbIdentity.rows[0],
    },
    async close() {
      await stopHttp(server);
      const results = await Promise.allSettled([
        database.closeDatabasePool(),
        circuit.closePool(),
        redis.closeRedis(),
      ]);
      await restore?.();
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failures.length)
        throw new AggregateError(
          failures.map((r) => r.reason),
          'Application resource cleanup failed'
        );
    },
  };
}

async function snapshotDatabase(pool: Pool): Promise<CapitalDatabaseState> {
  const tables: CapitalDatabaseState['tables'] = {};
  for (const table of AUDIT_TABLES) {
    const result = await pool.query<{ id: string; row: string; rowBinary: string }>(
      `SELECT COALESCE(to_jsonb(t)->>'id',to_jsonb(t)->>'jti',concat(to_jsonb(t)->>'user_id',':',to_jsonb(t)->>'fund_id')) AS id,
       row_to_json(t)::text AS row,encode(jsonb_send(to_jsonb(t)),'hex') AS "rowBinary"
       FROM ${escapeIdentifier(table)} t ORDER BY 1`
    );
    tables[table] = result.rows;
  }
  const payloads: CapitalDatabaseState['payloads'] = [];
  for (const [table, column] of [
    ['fund_scenario_variants', 'override_payload'],
    ['fund_snapshots', 'payload'],
  ] as const) {
    const result = await pool.query<{ id: string; text: string; binary: string }>(
      `SELECT id::text AS id,${column}::text AS text,encode(jsonb_send(${column}),'hex') AS binary FROM ${table} ORDER BY id`
    );
    payloads.push(...result.rows.map((row) => ({ table, ...row })));
  }
  return { tables, payloads, sha256: sha256(JSON.stringify({ tables, payloads })) };
}

export async function startCapitalScenarioHttpRuntime(
  options: CapitalRuntimeOptions
): Promise<CapitalHttpRuntime> {
  if (!path.isAbsolute(options.evidenceDir) || !/^[a-zA-Z0-9_-]+$/.test(options.label))
    throw new Error('Absolute evidenceDir and bounded runtime label required');
  const mode = options.mode ?? 'process';
  if (mode === 'process' && options.beforeAppImport)
    throw new Error('Process/capacity runtime forbids module fault hooks');
  await mkdir(options.evidenceDir, { recursive: true });
  const cwd = await mkdtemp(path.join(options.evidenceDir, `${options.label}-cwd-`));
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  const lifecycle: RuntimeLifecycleReport = {
    mode,
    api: { graceful: false, exitCode: null, signal: null, forced: false },
    adminPoolClosed: false,
    containerStopped: false,
    errors: [],
  };
  let postgres: StartedPostgreSqlContainer | undefined;
  let pool: Pool | undefined;
  let app: Awaited<ReturnType<typeof bootApplication>> | undefined;
  let child: ChildProcess | undefined;
  let childExit: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
  let closePromise: Promise<RuntimeLifecycleReport> | undefined;
  const close = () =>
    (closePromise ??= (async () => {
      try {
        if (app) {
          await bounded(app.close(), options.shutdownTimeoutMs ?? 10_000, 'API drain');
          lifecycle.api.graceful = true;
        }
        if (child && childExit) {
          child.send({ kind: 'shutdown' });
          try {
            const exit = await bounded(
              childExit,
              options.shutdownTimeoutMs ?? 10_000,
              'API process exit'
            );
            Object.assign(lifecycle.api, {
              exitCode: exit.code,
              signal: exit.signal,
              graceful:
                exit.code === 0 &&
                exit.signal === null &&
                lifecycle.api.shutdownAcknowledged === true,
            });
          } catch (error) {
            lifecycle.errors.push(String(error));
            lifecycle.api.forced = true;
            child.kill('SIGKILL');
            const exit = await childExit;
            Object.assign(lifecycle.api, { exitCode: exit.code, signal: exit.signal });
          }
        }
      } catch (error) {
        lifecycle.errors.push(String(error));
      }
      if (mode === 'in-process') {
        process.chdir(originalCwd);
        replaceEnvironment(originalEnv);
      }
      try {
        if (pool) await pool.end();
        Object.assign(lifecycle, { adminPoolClosed: true });
      } catch (error) {
        lifecycle.errors.push(String(error));
      }
      try {
        if (postgres) await postgres.stop();
        Object.assign(lifecycle, { containerStopped: true });
      } catch (error) {
        lifecycle.errors.push(String(error));
      }
      await writeFile(
        path.join(options.evidenceDir, `${options.label}-lifecycle.json`),
        `${JSON.stringify(lifecycle, null, 2)}\n`
      );
      return lifecycle;
    })());
  try {
    postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('capital_http')
      .withUsername('capital_owner')
      .withPassword(randomUUID())
      .withStartupTimeout(options.startupTimeoutMs ?? 90_000)
      .start();
    const ownerUrl = postgres.getConnectionUri();
    pool = new Pool({ connectionString: ownerUrl, max: 2 });
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    if (process.cwd() !== ROOT) process.chdir(ROOT);
    let migrationState;
    try {
      migrationState = await runMigrationsWithConnectionString(
        ownerUrl,
        '0058_capital_plan_override'
      );
    } finally {
      process.chdir(originalCwd);
    }
    if (migrationState.current !== '0058_capital_plan_override')
      throw new Error('Canonical B6 migration missing');
    const seedData = await seed(
      pool,
      options.source ?? {
        rawConfig: makeCapitalRawConfig(),
        fundSize: '100.00',
        baseCurrency: 'USD',
      }
    );
    const role = `capital_api_${randomUUID().replaceAll('-', '')}`;
    const password = randomUUID();
    await pool.query(
      `CREATE ROLE ${escapeIdentifier(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD ${escapeLiteral(password)}`
    );
    await pool.query(`GRANT CONNECT ON DATABASE capital_http TO ${escapeIdentifier(role)}`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${escapeIdentifier(role)}`);
    await pool.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${escapeIdentifier(role)}`
    );
    await pool.query(
      `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${escapeIdentifier(role)}`
    );
    const apiUrl = new URL(ownerUrl);
    apiUrl.username = role;
    apiUrl.password = password;
    const { env, removed } = sanitizedEnvironment(apiUrl.toString(), options);
    const roleState = await pool.query(
      'SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',
      [role]
    );
    const policyState = await pool.query(
      `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`
    );
    const policies = await pool.query(
      "SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname"
    );
    const databaseVersion = await pool.query(
      "SELECT version() AS version, current_setting('server_version_num') AS server_version_num"
    );
    const databaseSettings = await pool.query(
      'SELECT name,setting,unit,source FROM pg_settings WHERE name=ANY($1) ORDER BY name',
      [
        [
          'max_connections',
          'shared_buffers',
          'work_mem',
          'maintenance_work_mem',
          'fsync',
          'synchronous_commit',
          'full_page_writes',
          'jit',
          'max_parallel_workers_per_gather',
          'timezone',
        ],
      ]
    );
    const migrationLedger = await pool.query('SELECT * FROM drizzle_migrations ORDER BY id');
    const containerInspect = JSON.parse(
      execFileSync('docker', ['inspect', '--format', '{{json .}}', postgres.getId()], {
        encoding: 'utf8',
      })
    ) as {
      Image: string;
      Config: { Image: string };
      HostConfig: { Memory: number; NanoCpus: number };
    };
    const imageInspect = JSON.parse(
      execFileSync(
        'docker',
        ['image', 'inspect', '--format', '{{json .RepoDigests}}', containerInspect.Image],
        { encoding: 'utf8' }
      )
    ) as string[];
    type Ready = Pick<
      Awaited<ReturnType<typeof bootApplication>>,
      'baseUrl' | 'actors' | 'identity'
    >;
    let ready: Ready;
    if (mode === 'in-process') {
      replaceEnvironment(env);
      process.chdir(cwd);
      app = await bootApplication(seedData.actors, options.beforeAppImport);
      ready = app;
    } else {
      const require = createRequire(path.join(ROOT, 'package.json'));
      child = spawn(
        process.execPath,
        [
          '--import',
          pathToFileURL(require.resolve('tsx')).href,
          fileURLToPath(import.meta.url),
          '--capital-runtime-child',
        ],
        { cwd, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
      );
      const output: Buffer[] = [];
      child.stdout?.on('data', (b: Buffer) => output.push(b));
      child.stderr?.on('data', (b: Buffer) => output.push(b));
      childExit = new Promise((resolve) =>
        child!.once('exit', (code, signal) => resolve({ code, signal }))
      );
      const readiness = new Promise<Ready>((resolve, reject) => {
        child!.once('error', reject);
        child!.on('message', (value: unknown) => {
          const message = value as {
            kind?: string;
            ready?: Ready;
            error?: string;
            peakMemoryRssBytes?: number;
            activeResources?: string[];
          };
          if (message.kind === 'ready' && message.ready) resolve(message.ready);
          if (message.kind === 'shutdown-complete')
            Object.assign(lifecycle.api, {
              shutdownAcknowledged: true,
              peakMemoryRssBytes: message.peakMemoryRssBytes,
              activeResourcesAfterDrain: message.activeResources,
            });
          if (message.kind === 'error') reject(new Error(message.error));
        });
        childExit!
          .then((exit) => reject(new Error(`API exited before readiness: ${JSON.stringify(exit)}`)))
          .catch(reject);
      });
      child.send({ kind: 'boot', actors: seedData.actors });
      try {
        ready = await bounded(readiness, options.startupTimeoutMs ?? 90_000, 'API readiness');
      } finally {
        await writeFile(
          path.join(options.evidenceDir, `${options.label}-api-startup.log`),
          Buffer.concat(output)
        );
      }
      childExit
        .then(async () => {
          await writeFile(
            path.join(options.evidenceDir, `${options.label}-api.log`),
            Buffer.concat(output)
          );
        })
        .catch(() => {});
    }
    const identity = {
      ...ready.identity,
      mode,
      containerId: postgres.getId(),
      databaseName: 'capital_http',
      migratedThrough: migrationState.current,
      roleState: roleState.rows,
      relations: policyState.rows,
      policies: policies.rows,
      postgres: { version: databaseVersion.rows, settings: databaseSettings.rows },
      image: {
        requested: containerInspect.Config.Image,
        id: containerInspect.Image,
        digests: imageInspect,
        memoryLimitBytes: containerInspect.HostConfig.Memory,
        nanoCpus: containerInspect.HostConfig.NanoCpus,
      },
      migrationLedger: migrationLedger.rows,
      migrationLedgerSha256: sha256(JSON.stringify(migrationLedger.rows)),
      rawSourceSha256: sha256(JSON.stringify(seedData.source)),
      removedEnvironmentVariableNames: removed,
      sourceBundleHash: fingerprintCapitalSource(seedData.source).sourceBundleHash,
      globalRateLimitMax: options.rateLimitMax ?? 60,
      scenarioWriteRateLimit: { max: 100, windowMs: 900_000 },
      nodeBinarySha256: sha256(await readFile(process.execPath)),
      startedAtUtc: new Date().toISOString(),
    };
    await writeFile(
      path.join(options.evidenceDir, `${options.label}-identity.json`),
      `${JSON.stringify(identity, null, 2)}\n`
    );
    const runtime: CapitalHttpRuntime = {
      mode,
      baseUrl: ready.baseUrl,
      pool,
      fundId: seedData.fundId,
      secondFundId: seedData.secondFundId,
      source: seedData.source,
      actors: ready.actors,
      identity,
      request(method, requestPath, requestOptions = {}) {
        const actor = requestOptions.actor ?? ready.actors.writer;
        const credential = requestOptions.credential ?? 'bearer';
        const auth =
          credential === 'cookie'
            ? actor.cookieHeaders
            : credential === 'bearer'
              ? actor.bearerHeaders
              : {};
        const rawBody =
          requestOptions.rawBody ??
          (requestOptions.body === undefined
            ? undefined
            : Buffer.from(JSON.stringify(requestOptions.body)));
        return requestCapitalHttp(new URL(requestPath, ready.baseUrl).href, method, {
          headers: {
            ...(rawBody ? { 'Content-Type': 'application/json' } : {}),
            ...auth,
            ...requestOptions.headers,
          },
          ...(rawBody ? { rawBody } : {}),
          ...(requestOptions.timeoutMs !== undefined
            ? { timeoutMs: requestOptions.timeoutMs }
            : {}),
        });
      },
      snapshot: () => snapshotDatabase(pool!),
      close,
    };
    const guard = await runtime.request('GET', `/api/funds/${runtime.fundId}/scenario-sets`, {
      credential: 'none',
    });
    if (guard.status !== 401)
      throw new Error(`Actual app authentication sanity failed: ${guard.status}`);
    const sourceResponse = await runtime.request(
      'GET',
      `/api/funds/${runtime.fundId}/scenario-sets/source-config?representation=capital-plan-v1`
    );
    if (
      sourceResponse.status !== 200 ||
      (sourceResponse.body as { sourceBundleHash?: string }).sourceBundleHash !==
        identity.sourceBundleHash
    )
      throw new Error(
        `Actual app source identity sanity failed: ${sourceResponse.status} ${sourceResponse.rawBody}`
      );
    return runtime;
  } catch (error) {
    lifecycle.errors.push(String(error));
    await close();
    throw error;
  }
}

export function makeCapitalCreateBody(
  runtime: Pick<CapitalHttpRuntime, 'source'>,
  options: {
    name?: string;
    inputs?: FundScenarioCapitalRequestInputV1[];
    variantIds?: string[];
    unitDeclarations?: CapitalUnitDeclarationsV1;
  } = {}
): CreateFundScenarioSetV3 {
  const inputs = options.inputs ?? [makeCapitalInput()];
  const variantIds = options.variantIds ?? inputs.map(() => randomUUID());
  if (variantIds.length !== inputs.length || !variantIds[0])
    throw new Error('One stable variant ID per input required');
  return {
    contractVersion: 'fund-scenario-set-create/3.0.0',
    name: options.name ?? `Capital ${randomUUID()}`,
    variants: inputs.map((input, index) => ({
      variantId: variantIds[index]!,
      name: index === 0 ? 'Baseline' : `Variant ${index}`,
      override: { overrideType: 'capital_plan', payload: structuredClone(input) },
    })),
    baselineVariantId: variantIds[0],
    expectedSourceConfigId: runtime.source.config.id,
    expectedSourceConfigVersion: runtime.source.config.version,
    expectedSourceBundleHash: fingerprintCapitalSource(runtime.source).sourceBundleHash,
    expectedInterpretationVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
    unitDeclarations: structuredClone(options.unitDeclarations ?? makeCapitalDeclarations()),
  };
}

export async function startCapitalResponseLossProxy(
  runtime: CapitalHttpRuntime,
  options: {
    method: string;
    path: string;
    verifyCommitted(response: CapitalHttpResponse): Promise<unknown>;
  }
) {
  let resolveLost: (value: {
    upstream: CapitalHttpResponse;
    committed: unknown;
  }) => void = () => {};
  let rejectLost: (error: unknown) => void = () => {};
  const lostResponse = new Promise<{ upstream: CapitalHttpResponse; committed: unknown }>(
    (resolve, reject) => {
      resolveLost = resolve;
      rejectLost = reject;
    }
  );
  let consumed = false;
  const server = createServer(async (incoming, downstream) => {
    try {
      if (consumed || incoming.method !== options.method || incoming.url !== options.path) {
        downstream.writeHead(404);
        downstream.end();
        return;
      }
      consumed = true;
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(incoming.headers))
        if (typeof value === 'string' && !['host', 'connection', 'content-length'].includes(key))
          headers[key] = value;
      const upstream = await requestCapitalHttp(
        new URL(options.path, runtime.baseUrl).href,
        options.method,
        { headers, rawBody: Buffer.concat(chunks) }
      );
      if (upstream.status < 200 || upstream.status >= 300)
        throw new Error(`Loss injection requires committed success; got ${upstream.status}`);
      const committed = await options.verifyCommitted(upstream);
      resolveLost({ upstream, committed });
      downstream.destroy();
    } catch (error) {
      rejectLost(error);
      downstream.destroy();
    }
  });
  const baseUrl = await listen(server);
  return { baseUrl, lostResponse, close: () => stopHttp(server) };
}

if (process.argv.includes('--capital-runtime-child')) {
  let childApp: Awaited<ReturnType<typeof bootApplication>> | undefined;
  process.on('message', (value: unknown) => {
    const message = value as { kind: string; actors: ActorSeeds };
    if (message.kind === 'boot')
      void bootApplication(message.actors)
        .then((started) => {
          childApp = started;
          process.send?.({
            kind: 'ready',
            ready: { baseUrl: started.baseUrl, actors: started.actors, identity: started.identity },
          });
        })
        .catch((error: unknown) => {
          process.send?.({ kind: 'error', error: String(error) });
          process.exitCode = 1;
          process.disconnect();
        });
    if (message.kind === 'shutdown')
      void (async () => {
        try {
          await childApp?.close();
          process.send?.(
            {
              kind: 'shutdown-complete',
              peakMemoryRssBytes: process.resourceUsage().maxRSS * 1024,
              activeResources: process.getActiveResourcesInfo(),
            },
            undefined,
            undefined,
            () => process.exit(0)
          );
        } catch (error) {
          process.send?.({ kind: 'error', error: String(error) });
          process.exitCode = 1;
        }
        if (process.exitCode === 1) process.disconnect();
      })();
  });
}
