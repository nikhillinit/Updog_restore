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

  it('admits only schema workflow apply modes through exact capability commands', async () => {
    const workflow = YAML.parse(
      await readFile(
        path.join(process.cwd(), '.github', 'workflows', 'prod-schema-reconcile.yml'),
        'utf8'
      )
    );
    expect(workflow.on.workflow_dispatch.inputs.mode.options).toEqual([
      'audit',
      'apply',
      'apply-catchup-0050-0053',
    ]);
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
    const applyStep = steps.find((step) => step.name === 'Apply additive-safe reconciliation');
    expect(applyStep?.if).toContain("startsWith(inputs.mode, 'apply')");
    expect(applyStep?.run).toContain(
      'node scripts/reconcile-prod-schema.mjs --apply --yes --apply-0053-g3-release-gate-hardening'
    );
    expect(applyStep?.run).toContain(
      'node scripts/reconcile-prod-schema.mjs --apply --yes --apply-g3-catchup-0050-0053'
    );
    const applyGates = [
      'Require first apply attempt',
      'Verify artifact retention before apply',
      'Require additive-safe apply decision',
      'Run post-apply audit',
      'Require clean post-apply audit',
    ];
    for (const gateName of applyGates) {
      const gate = steps.find((step) => step.name === gateName);
      expect(gate?.if, gateName).toContain("startsWith(inputs.mode, 'apply')");
    }
  });

  it('rejects reconcile apply when both capability flags are combined', () => {
    expect(() =>
      assertApplyConfirmation({
        apply: true,
        yes: true,
        apply0053G3ReleaseGateHardening: true,
        applyG3Catchup0050To0053: true,
      })
    ).toThrow(/production schema mutation is mechanically blocked/i);
  });

  it('fails apply-mode workflows explicitly before any mutation step', async () => {
    for (const name of ['prod-journaled-migrate-0045-0049.yml']) {
      const workflow = YAML.parse(
        await readFile(path.join(process.cwd(), '.github', 'workflows', name), 'utf8')
      );
      const steps = workflow.jobs[Object.keys(workflow.jobs)[0]].steps;
      const blocker = steps.find((step) => step.name === 'Block production apply mode');
      expect(blocker?.if).toContain("inputs.mode == 'apply'");
      expect(blocker?.run).toMatch(/exit 1/);
      expect(steps.indexOf(blocker)).toBeLessThan(
        steps.findIndex((step) => /Apply (additive-safe reconciliation|journaled recovery)/.test(step.name))
      );
    }
  });
});
