import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  buildLockTimeApplyVectorV1,
  loadManifests,
  parseLockTimeApplyVectorV1,
  prepare0053G3ReleaseGateHardeningCapability,
} from '../../../scripts/reconcile-prod-schema.mjs';

describe('prod-schema-reconcile workflow', () => {
  it('validates and persists exactly one lock-time vector marker', async () => {
    const workflow = YAML.parse(
      await readFile(
        path.join(process.cwd(), '.github/workflows/prod-schema-reconcile.yml'),
        'utf8'
      )
    );
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
    const vectorStep = steps.find((step) => step.name === 'Validate lock-time apply vector');
    expect(vectorStep?.if).toContain("inputs.mode == 'apply'");
    expect(vectorStep?.run).toContain('parseLockTimeApplyVectorV1');
    expect(vectorStep?.run).toContain('reports/lock-time-apply-vector.json');
    const uploadStep = steps.find((step) => step.name === 'Upload redacted reconciliation reports');
    expect(uploadStep?.with?.path).toContain('reports/lock-time-apply-vector.json');
  });

  it('uses the configured parser to accept only canonical marker output', async () => {
    const target = await prepare0053G3ReleaseGateHardeningCapability();
    const preparedManifests = (await loadManifests()).map((manifest) => ({ manifest }));
    const audits = preparedManifests.map(({ manifest }) => ({
      manifest: manifest.name,
      action: manifest.name === target.manifestName ? 'APPLY-MISSING-DDL' : 'SKIP',
      objects:
        manifest.name === target.manifestName
          ? [
              {
                table: 'fixture_target',
                present: false,
                populated: false,
                action: 'APPLY-MISSING-DDL',
                deltas: [],
              },
            ]
          : [],
    }));
    const marker = buildLockTimeApplyVectorV1({ preparedManifests, audits, target });

    expect(parseLockTimeApplyVectorV1(marker, { preparedManifests, target })).toMatchObject({
      schemaVersion: 1,
      source: 'lock-time-audit',
    });
    expect(() =>
      parseLockTimeApplyVectorV1(`${marker}\n${marker}`, { preparedManifests, target })
    ).toThrow(/lock-time apply vector/i);
  });
});
