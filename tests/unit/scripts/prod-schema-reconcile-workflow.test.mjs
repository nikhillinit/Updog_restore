import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  buildG3CatchupLockTimeApplyVectorV1,
  buildLockTimeApplyVectorV1,
  loadManifests,
  parseG3CatchupLockTimeApplyVectorV1,
  parseLockTimeApplyVectorV1,
  prepare0053G3ReleaseGateHardeningCapability,
  prepareG3Catchup0050To0053Capability,
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
    expect(vectorStep?.if).toContain("startsWith(inputs.mode, 'apply')");
    expect(vectorStep?.run).toContain('parseLockTimeApplyVectorV1');
    expect(vectorStep?.run).toContain('parseG3CatchupLockTimeApplyVectorV1');
    expect(vectorStep?.run).toContain('reports/lock-time-apply-vector.json');
    const uploadStep = steps.find((step) => step.name === 'Upload redacted reconciliation reports');
    expect(uploadStep?.with?.path).toContain('reports/lock-time-apply-vector.json');
  });

  it('uses the configured parser to accept only canonical marker output', async () => {
    const target = await prepare0053G3ReleaseGateHardeningCapability();
    const preparedManifests = (await loadManifests()).map((manifest) => ({
      manifest,
      dropStatements: [],
    }));
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

  it('uses the catch-up parser to accept only canonical catch-up marker output', async () => {
    const capability = await prepareG3Catchup0050To0053Capability();
    const targetNames = new Set(capability.targets.map((target) => target.manifestName));
    const preparedManifests = (await loadManifests()).map((manifest) => ({
      manifest,
      dropStatements: [],
    }));
    const audits = preparedManifests.map(({ manifest }) => ({
      manifest: manifest.name,
      action: targetNames.has(manifest.name) ? 'APPLY-MISSING-DDL' : 'SKIP',
      objects: targetNames.has(manifest.name)
        ? [
            {
              table: 'lock-time-parser-synthetic-target',
              present: false,
              populated: false,
              action: 'APPLY-MISSING-DDL',
              deltas: [],
            },
          ]
        : [],
    }));
    const marker = buildG3CatchupLockTimeApplyVectorV1({ preparedManifests, audits, capability });

    expect(
      parseG3CatchupLockTimeApplyVectorV1(marker, { preparedManifests, capability })
    ).toMatchObject({ schemaVersion: 1, source: 'lock-time-audit' });
    expect(() =>
      parseG3CatchupLockTimeApplyVectorV1(`${marker}\n${marker}`, { preparedManifests, capability })
    ).toThrow(/lock-time apply vector/i);
    const tampered = marker.replace(
      '{"manifest":"M1-cohort","action":"SKIP"}',
      '{"manifest":"M1-cohort","action":"APPLY-MISSING-DDL"}'
    );
    expect(tampered).not.toBe(marker);
    expect(() =>
      parseG3CatchupLockTimeApplyVectorV1(tampered, { preparedManifests, capability })
    ).toThrow(/not canonical|catch-up-only/i);
  });
});
