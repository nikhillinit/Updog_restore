import console from 'node:console';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';

import {
  assertApplyConfirmation,
} from '../../../scripts/reconcile-prod-schema.mjs';
import {
  parseRecoveryArgs,
  runProdJournaledMigrationRecovery,
} from '../../../scripts/run-prod-journaled-migrations.mjs';
import { shouldRefuseProdDbPush } from '../../../scripts/db-push-core.mjs';
import { runDbPushCli } from '../../../scripts/db-push.mjs';
import { runDbStudioCli } from '../../../scripts/db-studio.mjs';

describe('production schema dispatch block', () => {
  it('rejects reconcile apply even when confirmation flags are present', () => {
    expect(() => assertApplyConfirmation({ apply: true, yes: true })).toThrow(
      /production schema mutation is mechanically blocked/i
    );
  });

  it('rejects journaled apply before constructing a database client', async () => {
    const clientFactory = vi.fn();

    expect(() => parseRecoveryArgs(['--apply', '--yes'])).toThrow(
      /production schema mutation is mechanically blocked/i
    );
    await expect(
      runProdJournaledMigrationRecovery({
        connectionString: 'postgres://operator:secret@prod.example/updog',
        apply: true,
        clientFactory,
      })
    ).rejects.toThrow(/production schema mutation is mechanically blocked/i);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('refuses every remote db:push target, including unknown production hosts', () => {
    expect(
      shouldRefuseProdDbPush({
        databaseUrl: 'postgres://operator:secret@unknown-prod.example/updog',
        env: {},
      })
    ).toMatchObject({ refuse: true, reason: 'remote-target-blocked' });
    expect(shouldRefuseProdDbPush({ databaseUrl: undefined, env: {} })).toMatchObject({
      refuse: true,
      reason: 'missing-or-invalid-target',
    });
    expect(shouldRefuseProdDbPush({ databaseUrl: 'not-a-url', env: {} })).toMatchObject({
      refuse: true,
      reason: 'missing-or-invalid-target',
    });
  });

  it('routes db:studio through the same remote-target block', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    );
    expect(packageJson.scripts['db:studio']).toBe('node scripts/db-studio.mjs');

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const spawn = vi.fn();
      expect(
        runDbStudioCli({
          env: { DATABASE_URL: 'postgres://operator:secret@unknown-prod.example/updog' },
          spawn,
        })
      ).toBe(1);
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('blocks remote db:push before child-process dispatch', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(
        runDbPushCli({
          env: { DATABASE_URL: 'postgres://operator:secret@unknown-prod.example/updog' },
        })
      ).resolves.toBe(1);
    } finally {
      error.mockRestore();
    }
  });

  it('makes workflow apply steps unreachable while retaining audits', async () => {
    for (const [name, stepName] of [
      ['prod-schema-reconcile.yml', 'Apply additive-safe reconciliation'],
      ['prod-journaled-migrate-0045-0049.yml', 'Apply journaled recovery'],
    ]) {
      const workflow = YAML.parse(
        await readFile(path.join(process.cwd(), '.github', 'workflows', name), 'utf8')
      );
      const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
      const applyStep = steps.find((step) => step.name === stepName);
      expect(applyStep?.if).toBe('${{ false }}');
    }
  });
});
