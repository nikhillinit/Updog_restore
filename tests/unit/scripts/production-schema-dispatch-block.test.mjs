import console from 'node:console';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { runInNewContext } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';

import { assertApplyConfirmation } from '../../../scripts/reconcile-prod-schema.mjs';
import {
  parseRecoveryArgs,
  runProdJournaledMigrationRecovery,
} from '../../../scripts/run-prod-journaled-migrations.mjs';
import { shouldRefuseProdDbPush } from '../../../scripts/db-push-core.mjs';
import { runDbPushCli } from '../../../scripts/db-push.mjs';
import { runDbStudioCli } from '../../../scripts/db-studio.mjs';
import { assertActualsDraftProductionPrerequisites } from '../../../scripts/release/actuals-draft-prerequisites.mjs';
import { assertActualsRestatementProductionPrerequisites } from '../../../scripts/release/actuals-restatement-prerequisites.mjs';

describe('production schema dispatch block', () => {
  it.each([
    ['draft', '0056', 1],
    ['restatement', '0057', 7],
  ])('stops %s apply when immediate revalidation fails', async (kind, version, exitCode) => {
    const workflow = YAML.parse(
      await readFile('.github/workflows/prod-schema-reconcile.yml', 'utf8')
    );
    const apply = Object.values(workflow.jobs)
      .flatMap((job) => job.steps ?? [])
      .find((step) => step.name === 'Apply additive-safe reconciliation');
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'actuals-preapply-'));
    try {
      await mkdir(path.join(temporary, 'bin'));
      await mkdir(path.join(temporary, 'reports'));
      await writeFile(
        path.join(temporary, 'bin/npx'),
        `#!/bin/sh\nprintf '%s\\n' "$@" > gate-args.txt\nexit ${exitCode}\n`,
        { mode: 0o700 }
      );
      await writeFile(path.join(temporary, 'bin/node'), '#!/bin/sh\ntouch mutation-attempted\n', {
        mode: 0o700,
      });
      const result = spawnSync('bash', ['-c', apply.run], {
        cwd: temporary,
        env: {
          PATH: `${path.join(temporary, 'bin')}:${process.env['PATH']}`,
          MODE: `apply-actuals-${kind}-${version}`,
          TZ: 'UTC',
        },
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(exitCode);
      await expect(readFile(path.join(temporary, 'mutation-attempted'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(await readFile(path.join(temporary, 'gate-args.txt'), 'utf8')).toBe(
        `tsx\nscripts/release/actuals-migration-preapply.ts\napply-actuals-${kind}-${version}\nreports/actuals-${kind}-preflight-result.json\nreports/actuals-${kind}-preapply-result.json\n`
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('refuses blocked historical preflight reports and never trusts a JSON pass', async () => {
    const workflow = YAML.parse(
      await readFile('.github/workflows/prod-schema-reconcile.yml', 'utf8')
    );
    const step = Object.values(workflow.jobs)
      .flatMap((job) => job.steps ?? [])
      .find(
        (item) => item.name === 'Verify and download historical schema apply artifact by exact ID'
      );
    const start = step.run.indexOf("if (typeof preflight === 'object'");
    const end = step.run.indexOf(
      "} else if (receipt.mode === 'apply-current-forecast-0050-0055')",
      start
    );
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const guard = step.run.slice(start, end);
    for (const preflight of [{ status: 'blocked' }, { blocked: true }, { evaluation: 'blocked' }]) {
      const prerequisites = vi.fn();
      expect(() =>
        runInNewContext(guard, {
          preflight,
          assertActualsDraftProductionPrerequisites: prerequisites,
        })
      ).toThrow('0056 completed receipt contradicts blocked production prerequisites');
      expect(prerequisites).not.toHaveBeenCalled();
    }
    for (const preflight of [null, {}, { evaluation: 'pass' }]) {
      expect(() =>
        runInNewContext(guard, {
          preflight,
          assertActualsDraftProductionPrerequisites,
        })
      ).toThrow();
    }
  });

  it('explicitly refuses historical0057 receipt reuse before selecting any legacy schema', async () => {
    const workflow = YAML.parse(
      await readFile('.github/workflows/prod-schema-reconcile.yml', 'utf8')
    );
    const step = Object.values(workflow.jobs)
      .flatMap((job) => job.steps ?? [])
      .find(
        (item) => item.name === 'Verify and download historical schema apply artifact by exact ID'
      );
    const start = step.run.indexOf("if (raw.mode === 'apply-actuals-restatement-0057')");
    const end = step.run.indexOf('const receipt =', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const guard = step.run.slice(start, end);
    expect(() =>
      runInNewContext(guard, { raw: { mode: 'apply-actuals-restatement-0057' } })
    ).toThrow('0057 historical receipt reuse is not admitted');
    expect(() =>
      runInNewContext(guard, { raw: { mode: 'apply-actuals-draft-0056' } })
    ).not.toThrow();
  });

  it('rejects reconcile apply even when confirmation flags are present', () => {
    expect(() =>
      assertApplyConfirmation({
        apply: true,
        yes: true,
        apply0053G3ReleaseGateHardening: false,
        applyG3Catchup0050To0053: false,
      })
    ).toThrow(/production schema mutation is mechanically blocked/i);
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

  it('declares schema workflow modes and pins legacy capability commands', async () => {
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
      'apply-current-forecast-0050-0055',
      'apply-actuals-draft-0056',
      'apply-actuals-restatement-0057',
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
    expect(applyStep?.run).toContain(
      'node scripts/run-current-forecast-journaled-migrations.mjs --apply --yes'
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

  it('blocks the named 0056 mode at prerequisites before its apply step', async () => {
    const workflow = YAML.parse(
      await readFile(
        path.join(process.cwd(), '.github', 'workflows', 'prod-schema-reconcile.yml'),
        'utf8'
      )
    );
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
    const prerequisite = steps.find(
      (step) => step.name === 'Evaluate action-specific actuals draft production prerequisites'
    );
    const apply = steps.find((step) => step.name === 'Apply additive-safe reconciliation');
    expect(prerequisite?.if).toBe("inputs.mode == 'apply-actuals-draft-0056'");
    expect(prerequisite?.run).toContain('scripts/release/actuals-draft-production-preflight.ts');
    expect(prerequisite?.['continue-on-error']).not.toBe(true);
    expect(steps.indexOf(prerequisite)).toBeLessThan(steps.indexOf(apply));
    expect(apply?.run).toContain('scripts/run-actuals-draft-journaled-migration.mjs --apply --yes');
    expect(() => assertActualsDraftProductionPrerequisites()).toThrow(
      /0056 production action blocked/i
    );
  });

  it('blocks the named 0057 mode at prerequisites before its apply step', async () => {
    const workflow = YAML.parse(
      await readFile(
        path.join(process.cwd(), '.github', 'workflows', 'prod-schema-reconcile.yml'),
        'utf8'
      )
    );
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
    const prerequisite = steps.find(
      (step) =>
        step.name === 'Evaluate action-specific actuals restatement production prerequisites'
    );
    const apply = steps.find((step) => step.name === 'Apply additive-safe reconciliation');
    expect(prerequisite?.if).toBe("inputs.mode == 'apply-actuals-restatement-0057'");
    expect(prerequisite?.run).toContain(
      'scripts/release/actuals-restatement-production-preflight.ts'
    );
    expect(prerequisite?.['continue-on-error']).not.toBe(true);
    expect(steps.indexOf(prerequisite)).toBeLessThan(steps.indexOf(apply));
    expect(apply?.run).toContain(
      'scripts/run-actuals-restatement-journaled-migration.mjs --apply --yes'
    );
    expect(() => assertActualsRestatementProductionPrerequisites()).toThrow(
      /0057 production action blocked/i
    );
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
        steps.findIndex((step) =>
          /Apply (additive-safe reconciliation|journaled recovery)/.test(step.name)
        )
      );
    }
  });
});
