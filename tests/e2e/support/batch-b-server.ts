/**
 * Built mode proves the makeApp route and middleware surface and the built Preact client.
 * It does not prove the Neon driver (the neon-lane job owns that), Vercel static-tier
 * headers (no vercel.json headers are applied, so static responses carry no CSP;
 * helmet covers only /api responses here), a shared rate-limit store, or production
 * cookie attributes. Routing mirrors Vercel's order: static files, then any other api/
 * function file by its exact path, then the vercel.json rewrites; a dynamic function file
 * other than api/[...slug].ts fails the start.
 */
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import bcrypt from 'bcryptjs';
import express, { type Request, type Response } from 'express';
import { Pool } from 'pg';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

// Own the database and both listeners. Never connect this acceptance run to a saved .env.
const runtimeFile = process.env.BATCH_B_RUNTIME_FILE ?? path.resolve('.cache/batch-b-runtime.json');
const children: ChildProcess[] = [];
let listener: Server | undefined;
const postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
const databaseUrl = postgres.getConnectionUri();
const pool = new Pool({ connectionString: databaseUrl });
let stopping = false;

async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode !== null) return;
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 5_000);
      await exited;
      clearTimeout(force);
    })
  );
  if (listener?.listening) {
    await new Promise<void>((resolve, reject) => {
      listener!.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await pool.end();
  await postgres.stop();
  await rm(runtimeFile, { force: true });
  process.exit(code);
}
process.on('SIGTERM', () => void stop(0));
process.on('SIGINT', () => void stop(0));
process.on('uncaughtException', (error) => {
  // Built mode runs the app's own pool in this process; stopping the container ends it (57P01).
  if (stopping && (error as { code?: string }).code === '57P01') return;
  console.error(error);
  void stop(1);
});

try {
  const runtime = process.env['BATCH_B_RUNTIME'] ?? 'dev';
  if (runtime !== 'dev' && runtime !== 'built') {
    console.error(`Unsupported BATCH_B_RUNTIME: ${JSON.stringify(runtime)}; expected dev or built`);
    await stop(1);
  }
  await runMigrationsWithConnectionString(databaseUrl);
  const username = 'batch-b-browser';
  const password = randomUUID();
  const user = await pool.query<{ id: number }>(
    "INSERT INTO users (username, password, role) VALUES ($1, $2, 'partner') RETURNING id",
    [username, await bcrypt.hash(password, 8)]
  );
  const bUsername = 'batch-b-browser-b';
  const bPassword = randomUUID();
  const bUser = await pool.query<{ id: number }>(
    "INSERT INTO users (username, password, role) VALUES ($1, $2, 'partner') RETURNING id",
    [bUsername, await bcrypt.hash(bPassword, 8)]
  );
  await mkdir(path.dirname(runtimeFile), { recursive: true });
  await writeFile(
    runtimeFile,
    JSON.stringify({
      databaseUrl,
      username,
      password,
      userId: user.rows[0]!.id,
      bUsername,
      bPassword,
      bUserId: bUser.rows[0]!.id,
    }),
    { mode: 0o600 }
  );

  const env = {
    ...process.env,
    TZ: 'UTC',
    NODE_ENV: 'test',
    _EXPLICIT_NODE_ENV: 'test',
    USE_REAL_DB_IN_VITEST: '1',
    DATABASE_URL: databaseUrl,
    _EXPLICIT_DATABASE_URL: databaseUrl,
    NEON_DATABASE_URL: databaseUrl,
    _EXPLICIT_NEON_DATABASE_URL: databaseUrl,
    ALLOW_MEMORY_STORAGE: '0',
    _EXPLICIT_ALLOW_MEMORY_STORAGE: '0',
    REQUIRE_AUTH: '1',
    DISABLE_AUTH: '0',
    ENABLE_QUEUES: '0',
    _EXPLICIT_ENABLE_QUEUES: '0',
    ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
    REDIS_URL: 'memory://',
    _EXPLICIT_REDIS_URL: 'memory://',
    PORT: '5087',
    _EXPLICIT_PORT: '5087',
    VITE_API_PORT: '5087',
    VITE_CLIENT_PORT: '5187',
    VITE_E2E_DEMO_ENABLED: '0',
    CLIENT_URL: 'http://localhost:5187',
    CORS_ORIGIN: 'http://localhost:5187',
    JWT_SECRET: randomUUID() + randomUUID(),
    SESSION_SECRET: randomUUID() + randomUUID(),
  };
  if (runtime === 'built') {
    const { buildCommand, rewrites, outputDirectory } = JSON.parse(
      await readFile(path.resolve('vercel.json'), 'utf8')
    ) as { buildCommand: unknown; rewrites: unknown; outputDirectory: unknown };
    const expectedRewrites = new Map([
      ['/metrics/:path*', '/api/metrics/:path*'],
      ['/api/:slug*', '/api/[...slug]'],
      ['/:path*', '/index.html'],
    ]);
    if (!Array.isArray(rewrites)) {
      throw new Error(`Unsupported vercel.json rewrites: ${JSON.stringify(rewrites)}`);
    }
    for (const entry of rewrites) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Object.keys(entry).length !== 2 ||
        !expectedRewrites.has(entry.source) ||
        expectedRewrites.get(entry.source) !== entry.destination
      ) {
        throw new Error(`Unsupported vercel.json rewrite: ${JSON.stringify(entry)}`);
      }
      expectedRewrites.delete(entry.source);
    }
    if (expectedRewrites.size > 0) {
      throw new Error(
        `Unsupported vercel.json rewrites; missing entries: ${JSON.stringify([...expectedRewrites])}`
      );
    }
    if (typeof buildCommand !== 'string' || !buildCommand.trim()) {
      throw new Error('vercel.json buildCommand must be a nonempty string');
    }
    if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) {
      throw new Error('vercel.json outputDirectory must be a nonempty string');
    }
    const buildEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_'))
    );
    buildEnv['VITE_API_BASE_URL'] = '';
    await new Promise<void>((resolve, reject) => {
      const child = spawn(buildCommand, { shell: true, stdio: 'inherit', env: buildEnv });
      if (child.pid !== undefined) children.push(child);
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        const index = children.indexOf(child);
        if (index !== -1) children.splice(index, 1);
        if (code === 0) resolve();
        else reject(new Error(`Batch B build failed (code ${code}, signal ${signal})`));
      });
    });

    const runtimeEnv: NodeJS.ProcessEnv = {
      ...env,
      CLIENT_URL: 'http://localhost:5188',
      CORS_ORIGIN: 'http://localhost:5188',
      RATE_LIMIT_MAX: '100000',
      PORT: '5188',
      _EXPLICIT_PORT: '5188',
    };
    for (const key of [
      'VERCEL',
      'VERCEL_ENV',
      'VITE_API_PORT',
      'VITE_CLIENT_PORT',
      'VITE_E2E_DEMO_ENABLED',
    ]) {
      delete runtimeEnv[key];
      delete process.env[key];
    }
    Object.assign(process.env, runtimeEnv);
    type Handler = (req: Request, res: Response) => unknown;
    const importHandler = async (file: string) =>
      ((await import(pathToFileURL(path.resolve('api', file)).href)) as { default: Handler })
        .default;
    const serve = (handler: Handler) => (req: Request, res: Response) => {
      void Promise.resolve()
        .then(() => handler(req, res))
        .catch((error: unknown) => {
          console.error('Batch B handler failed:', error);
          if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
          else res.destroy();
        });
    };
    const callHandler = serve(await importHandler('[...slug].ts'));
    const app = express();
    const outputPath = path.resolve(outputDirectory);
    app.use(express.static(outputPath, { index: false }));
    // Vercel serves every other api/ file as its own function, ahead of the rewrites
    // (e.g. api/telemetry/wizard.ts), and parses JSON bodies for it.
    const functionFiles = (await readdir(path.resolve('api'), { recursive: true }))
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => /\.(ts|mts|js|mjs)$/.test(file) && !file.endsWith('.d.mts'))
      .filter((file) => !path.posix.basename(file).startsWith('_') && file !== '[...slug].ts');
    for (const file of functionFiles) {
      if (file.includes('[')) throw new Error(`Unsupported dynamic Vercel function: api/${file}`);
      const route = `/api/${file.replace(/\.(ts|mts|js|mjs)$/, '')}`;
      app.all(route, express.json(), serve(await importHandler(file)));
    }
    app.all(/^\/metrics(?:\/|$)/, (req, res) => {
      req.url = req.url.replace(/^\/metrics/, '/api/metrics');
      callHandler(req, res);
    });
    app.all(/^\/api(?:\/|$)/, callHandler);
    // `root` keeps send's dotfile check off the absolute path (worktrees live under .claude/).
    app.get(/.*/, (_req, res) => res.sendFile('index.html', { root: outputPath }));
    listener = app.listen(5188);
    listener.once('error', (error) => {
      console.error(error);
      void stop(1);
    });
  } else {
    for (const args of [
      ['--import', 'tsx', 'server/main.ts'],
      ['node_modules/vite/bin/vite.js', '--host', 'localhost'],
    ]) {
      const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
      children.push(child);
      child.once('exit', (code) => {
        if (!stopping) void stop(code || 1);
      });
      child.once('error', (error) => {
        console.error(error);
        void stop(1);
      });
    }
  }
} catch (error) {
  console.error(error);
  await stop(1);
}
