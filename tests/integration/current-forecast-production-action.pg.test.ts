import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { executeCurrentForecastProductionAction } from '../../scripts/release/current-forecast-production-action.mjs';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const SHA = 'a'.repeat(40);
const NOW = '2026-09-29T12:00:00.000Z';
let admin: pg.Pool;
let startedContainer = false;
let directory: string;
let databaseName: string;
let connectionString: string;

const fingerprint = (host: string) =>
  `sha256:${createHash('sha256').update(host.toLowerCase()).digest('hex')}`;

function json(body: unknown, cookie?: string) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(cookie ? { 'set-cookie': cookie } : {}) },
  });
}

async function snapshot() {
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    return (
      await pool.query('SELECT hash, created_at FROM public.drizzle_migrations ORDER BY created_at')
    ).rows;
  } finally {
    await pool.end();
  }
}

async function readback(databaseUrl: string, directHostFingerprint: string) {
  const manifestPath = join(directory, 'manifest.json');
  const manifestBytes = Buffer.from('{}');
  await writeFile(manifestPath, manifestBytes);
  const artifactName = `release-evidence-manifest-v1-101-1-${SHA}`;
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string, init: { headers?: Record<string, string> } = {}) => {
    calls.push(new URL(url).pathname);
    if (url.startsWith('https://api.vercel.com/v2/deployments/deployment/aliases'))
      return json({ aliases: [{ alias: 'updog.example' }] });
    if (url.startsWith('https://api.vercel.com/'))
      return json({
        id: 'deployment',
        url: 'deployment.vercel.app',
        projectId: 'project',
        readyState: 'READY',
        target: 'production',
        aliases: ['updog.example'],
        meta: { githubCommitSha: SHA },
      });
    if (url.endsWith('/api/version'))
      return json({
        version: '1.6.0',
        commit: SHA,
        nodeVersion: 'v22.23.2',
        platform: 'linux',
        arch: 'x64',
        environment: 'production',
        timestamp: NOW,
      });
    if (url.endsWith('/api/auth/csrf') && !init.headers?.['cookie'])
      return json({ csrfToken: 'bootstrap' }, 'csrf=bootstrap; Path=/');
    if (url.endsWith('/api/auth/login')) return json({ ok: true }, 'session=ok; Path=/');
    if (url.endsWith('/api/health/db'))
      return json({
        database: 'connected',
        status: 'ok',
        databaseName,
        databaseUrlHostFingerprint: directHostFingerprint,
        timestamp: NOW,
      });
    throw new Error(`Unexpected request ${url}`);
  });
  const clientFactory = vi.fn((config: pg.ClientConfig) => new pg.Client(config));
  const run = executeCurrentForecastProductionAction({
    context: {
      expectedSha: SHA,
      fundId: 7,
      action: 'readback',
      vercelProjectId: 'project',
      vercelDeploymentId: 'deployment',
      canonicalHostname: 'updog.example',
      releaseManifest: {
        runId: '101',
        runAttempt: 1,
        artifactId: '202',
        artifactName,
        artifactArchiveSha256: `sha256:${'c'.repeat(64)}`,
        fileSha256: createHash('sha256').update(manifestBytes).digest('hex'),
      },
      databaseName,
      directHostFingerprint,
    },
    secrets: {
      releaseManifestPath: manifestPath,
      vercelToken: 'vercel-token',
      vercelOrgId: 'org',
      databaseUrl,
      protectedDatabaseName: databaseName,
      protectedDirectHostFingerprint: directHostFingerprint,
      username: 'operator',
      password: 'password',
      bypassSecret: 'bypass',
    },
    fetchImpl,
    clientFactory,
    readLiveMainShaImpl: async () => SHA,
    manifestParser: async () => ({
      source: { sha: SHA },
      workflow: { runId: '101', runAttempt: 1, manifestArtifactName: artifactName },
      release: {
        vercel: {
          projectId: 'project',
          deploymentId: 'deployment',
          hostname: 'updog.example',
          sourceSha: SHA,
        },
      },
    }),
    now: () => new Date(NOW),
  });
  return { run, calls, clientFactory };
}

describe('Current Forecast production action database endpoint', { retry: 0 }, () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedContainer = true;
    }
    const base = process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
    admin = new pg.Pool({ connectionString: base, max: 1 });
    databaseName = `cf_action_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const url = new URL(base);
    url.pathname = `/${databaseName}`;
    connectionString = url.toString();
    await runMigrationsWithConnectionString(
      connectionString,
      '0055_current_forecast_recompute_commands'
    );
    directory = await mkdtemp(join(tmpdir(), 'current-forecast-action-pg-'));
  }, 180_000);

  afterAll(async () => {
    try {
      await rm(directory, { recursive: true, force: true });
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await admin?.end();
      if (startedContainer) await cleanupTestContainers();
    }
  }, 120_000);

  it('fingerprints the host the driver reaches, not a URL authority overridden by ?host=', async () => {
    const real = new URL(connectionString);
    // The URL authority names prod.example.invalid; ?host= and ?port= reach the test container.
    const spoofed = new URL(connectionString);
    spoofed.hostname = 'prod.example.invalid';
    spoofed.port = '';
    spoofed.searchParams.set('host', real.hostname);
    spoofed.searchParams.set('port', real.port || '5432');
    const before = await snapshot();

    const refused = await readback(spoofed.toString(), fingerprint('prod.example.invalid'));
    await expect(refused.run).rejects.toThrow('Production database host fingerprint mismatch');
    expect(refused.clientFactory).not.toHaveBeenCalled();
    expect(refused.calls).not.toContain('/api/version');

    const reached = await readback(spoofed.toString(), fingerprint(real.hostname));
    await expect(reached.run).resolves.toMatchObject({
      action: 'readback',
      identity: {
        database: { databaseName, migrationTail: '0055_current_forecast_recompute_commands' },
      },
    });
    expect(reached.clientFactory).toHaveBeenCalledOnce();
    expect(await snapshot()).toEqual(before);
  }, 180_000);
});
