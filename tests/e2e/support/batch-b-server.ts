import { PostgreSqlContainer } from '@testcontainers/postgresql';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

// Own the database and both listeners. Never connect this acceptance run to a saved .env.
const runtimeFile = process.env.BATCH_B_RUNTIME_FILE ?? path.resolve('.cache/batch-b-runtime.json');
const children: ChildProcess[] = [];
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
  await pool.end();
  await postgres.stop();
  await rm(runtimeFile, { force: true });
  process.exit(code);
}
process.on('SIGTERM', () => void stop(0));
process.on('SIGINT', () => void stop(0));

try {
  await runMigrationsWithConnectionString(databaseUrl);
  const username = 'batch-b-browser';
  const password = randomUUID();
  const user = await pool.query<{ id: number }>(
    "INSERT INTO users (username, password, role) VALUES ($1, $2, 'partner') RETURNING id",
    [username, await bcrypt.hash(password, 8)]
  );
  await mkdir(path.dirname(runtimeFile), { recursive: true });
  await writeFile(
    runtimeFile,
    JSON.stringify({ databaseUrl, username, password, userId: user.rows[0]!.id }),
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
} catch (error) {
  console.error(error);
  await stop(1);
}
