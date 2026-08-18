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
    const expectedTargetActions = capability.targets.map((target) => ({
      manifest: target.manifestName,
      action: 'APPLY-MISSING-DDL',
    }));

    expect(
      parseG3CatchupLockTimeApplyVectorV1(marker, {
        preparedManifests,
        capability,
        expectedTargetActions,
      })
    ).toMatchObject({ schemaVersion: 1, source: 'lock-time-audit' });
    expect(() =>
      parseG3CatchupLockTimeApplyVectorV1(`${marker}\n${marker}`, {
        preparedManifests,
        capability,
        expectedTargetActions,
      })
    ).toThrow(/lock-time apply vector/i);
    expect(() =>
      parseG3CatchupLockTimeApplyVectorV1(marker, { preparedManifests, capability })
    ).toThrow(/independent expected target actions/i);

    const nonTargetTamper = marker.replace(
      '{"manifest":"M1-cohort","action":"SKIP"}',
      '{"manifest":"M1-cohort","action":"APPLY-MISSING-DDL"}'
    );
    expect(nonTargetTamper).not.toBe(marker);
    expect(() =>
      parseG3CatchupLockTimeApplyVectorV1(nonTargetTamper, {
        preparedManifests,
        capability,
        expectedTargetActions,
      })
    ).toThrow(/not canonical|catch-up-only/i);

    // A target decision flipped inside the marker must NOT self-validate: the
    // expected actions come from the independent pre-apply audit evidence.
    const targetTamper = marker.replace(
      '{"manifest":"g3-release-gate-hardening","action":"APPLY-MISSING-DDL"}',
      '{"manifest":"g3-release-gate-hardening","action":"SKIP"}'
    );
    expect(targetTamper).not.toBe(marker);
    expect(() =>
      parseG3CatchupLockTimeApplyVectorV1(targetTamper, {
        preparedManifests,
        capability,
        expectedTargetActions,
      })
    ).toThrow(/not canonical/i);
  });

  it('pins the workflow mode allowlist, receipt mode env, and per-mode command binding', async () => {
    const workflow = YAML.parse(
      await readFile(
        path.join(process.cwd(), '.github/workflows/prod-schema-reconcile.yml'),
        'utf8'
      )
    );
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
    const validateMode = steps.find((step) => step.name === 'Validate mode input');
    expect(validateMode).toBeDefined();
    expect(steps.indexOf(validateMode)).toBe(0);
    expect(validateMode?.run).toContain('audit|apply|apply-catchup-0050-0053');
    expect(validateMode?.run).toMatch(/exit 1/);

    const receiptStep = steps.find((step) => step.name === 'Build schema reconcile receipt');
    expect(receiptStep?.env?.SCHEMA_RECONCILE_MODE).toBe('${{ inputs.mode }}');

    const applyStep = steps.find((step) => step.name === 'Apply additive-safe reconciliation');
    expect(applyStep?.run).toMatch(
      /"\$MODE" = "apply-catchup-0050-0053" \]; then\n\s+node scripts\/reconcile-prod-schema\.mjs --apply --yes --apply-g3-catchup-0050-0053/
    );
    expect(applyStep?.run).toMatch(
      /"\$MODE" = "apply" \]; then\n\s+node scripts\/reconcile-prod-schema\.mjs --apply --yes --apply-0053-g3-release-gate-hardening/
    );
  });
});
