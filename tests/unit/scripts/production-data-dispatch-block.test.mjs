import { describe, expect, it, vi } from 'vitest';

import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { RECOVERY_BLOCK_MESSAGE, runPurge } from '../../../scripts/release/purge-canary-runs.mjs';
import { parseRedeliveryArgs } from '../../../scripts/release/redeliver-capital-call-outbox.mjs';
import { assertDemoSeedEnabled } from '../../../server/seed-demo-data.ts';
import { parseProvisioningMode } from '../../../scripts/provision-prod-users.ts';

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

  it('blocks the single-run canary purge CLI execute before connecting', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/purge-canary-runs.mjs',
        '--execute',
        '--run-id=11111111-1111-4111-8111-111111111111',
        '--fund-id=3',
        `--expected-plan-digest=${'b'.repeat(64)}`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          RELEASE_CANARY_PURGE_OPERATOR: '1',
          DATABASE_URL: 'postgres://blocked@127.0.0.1:1/never',
        },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(RECOVERY_BLOCK_MESSAGE);
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
