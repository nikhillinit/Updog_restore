import { describe, expect, it, vi } from 'vitest';

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { runPurge } from '../../../scripts/release/purge-canary-runs.mjs';
import { parseRedeliveryArgs } from '../../../scripts/release/redeliver-capital-call-outbox.mjs';
import { assertDemoSeedEnabled } from '../../../server/seed-demo-data.ts';
import { parseProvisioningMode } from '../../../scripts/provision-prod-users.ts';

const purgeCli = resolve('scripts/release/purge-canary-runs.mjs');

// Runs the purge CLI from an empty directory with only explicit synthetic
// environment values, so dotenv in the imported modules finds no file to load.
async function runPurgeCli(args, env) {
  const cwd = await mkdtemp(join(tmpdir(), 'purge-cli-'));
  const definedEnv = Object.fromEntries(
    Object.entries({ PATH: process.env.PATH, ...env }).filter(([, value]) => value !== undefined)
  );
  try {
    return await new Promise((resolveRun) => {
      execFile(
        process.execPath,
        [purgeCli, ...args],
        { cwd, env: definedEnv, encoding: 'utf8', timeout: 30_000 },
        (error, stdout, stderr) =>
          resolveRun({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr })
      );
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

describe('production data dispatch block', () => {
  it('blocks canary purge before first database query', async () => {
    const client = { query: vi.fn() };

    await expect(runPurge(client, { execute: true })).rejects.toThrow(
      /production data mutation is mechanically blocked/i
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it('blocks single-run canary purge execute unless every binding is present', async () => {
    const complete = {
      execute: true,
      runId: '11111111-1111-4111-8111-111111111111',
      fundId: '3',
      headSha: 'a'.repeat(40),
      expectedPlanDigest: 'b'.repeat(64),
      expectedTargetFingerprint: 'c'.repeat(64),
      revalidateSource: () => undefined,
      verifyRecoveryEvidence: () => ({}),
    };
    for (const missing of [
      'expectedPlanDigest',
      'expectedTargetFingerprint',
      'revalidateSource',
      'verifyRecoveryEvidence',
      'headSha',
    ]) {
      const client = { query: vi.fn(), host: 'db.internal', port: 5432 };
      await expect(runPurge(client, { ...complete, [missing]: undefined })).rejects.toThrow(
        /production data mutation is mechanically blocked/i
      );
      expect(client.query).not.toHaveBeenCalled();
    }
  });

  it('refuses single-run canary purge CLI execute before any connection for each missing or malformed binding', async () => {
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const databaseUrl = `postgres://synthetic@127.0.0.1:${server.address().port}/synthetic`;
    const owner = {
      RELEASE_CANARY_PURGE_OPERATOR: '1',
      DATABASE_URL: databaseUrl,
      EXPECTED_SHA: 'a'.repeat(40),
      EXPECTED_TARGET_FINGERPRINT: 'c'.repeat(64),
      RESTORE_BRANCH_ID: 'br-synthetic-a1b2c3',
    };
    const runId = '--run-id=11111111-1111-4111-8111-111111111111';
    const fundId = '--fund-id=3';
    const digest = `--expected-plan-digest=${'b'.repeat(64)}`;
    try {
      for (const [args, env, message] of [
        [['--execute', fundId, digest], owner, /mechanically blocked/],
        [['--execute', '--run-id=not-a-uuid', fundId, digest], owner, /--run-id must be/],
        [['--execute', runId, digest], owner, /--fund-id must be/],
        [['--execute', runId, '--fund-id=0', digest], owner, /--fund-id must be/],
        [['--execute', runId, fundId], owner, /--expected-plan-digest/],
        [
          ['--execute', runId, fundId, '--expected-plan-digest=abc'],
          owner,
          /--expected-plan-digest/,
        ],
        [
          ['--execute', runId, fundId, digest],
          { ...owner, EXPECTED_TARGET_FINGERPRINT: undefined },
          /EXPECTED_TARGET_FINGERPRINT/,
        ],
        [
          ['--execute', runId, fundId, digest],
          { ...owner, RESTORE_BRANCH_ID: 'main' },
          /RESTORE_BRANCH_ID/,
        ],
        [
          ['--execute', runId, fundId, digest],
          { ...owner, EXPECTED_SHA: undefined },
          /EXPECTED_SHA must be a full/,
        ],
      ]) {
        const result = await runPurgeCli(args, env);
        expect(result.code, args.join(' ')).toBe(1);
        expect(result.stderr, args.join(' ')).toMatch(message);
      }
      expect(connections).toBe(0);

      // Control: a well-formed dry run does connect, so the counter sees connections.
      const control = await runPurgeCli([runId, fundId], { DATABASE_URL: databaseUrl });
      expect(control.code).toBe(1);
      expect(connections).toBeGreaterThan(0);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  });

  it('blocks outbox redelivery apply before database selection or update', () => {
    expect(() =>
      parseRedeliveryArgs(['--apply', '--id=11111111-1111-4111-8111-111111111111'])
    ).toThrow(/production data mutation is mechanically blocked/i);
  });

  it('blocks production demo seed despite the legacy override', () => {
    expect(() =>
      assertDemoSeedEnabled({
        DEMO_SEED: '1',
        ALLOW_PRODUCTION_DEMO_SEED: '1',
        NODE_ENV: 'production',
      })
    ).toThrow(/production demo data mutation is mechanically blocked/i);
  });

  it('refuses production user provisioning without exactly one explicit mode', () => {
    for (const argv of [[], ['--dry-run', '--apply']]) {
      expect(() => parseProvisioningMode(argv)).toThrow(
        /production user mutation requires exactly one of --dry-run or --apply/i
      );
    }
  });
});
