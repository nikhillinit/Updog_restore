import { deepStrictEqual } from 'node:assert';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  CANONICAL_MANIFEST_IDENTITIES,
  G3_CATCHUP_TARGETS,
  buildG3CatchupLockTimeApplyVectorV1,
  buildLockTimeApplyVectorV1,
  loadManifests,
  parseG3CatchupLockTimeApplyVectorV1,
  parseLockTimeApplyVectorV1,
  prepare0053G3ReleaseGateHardeningCapability,
  prepareG3Catchup0050To0053Capability,
} from '../../../scripts/reconcile-prod-schema.mjs';

describe('prod-schema-reconcile workflow', () => {
  it('binds each actuals verifier to the authenticated dispatch title and protected target inputs', async () => {
    const workflow = YAML.parse(
      await readFile('.github/workflows/prod-schema-reconcile.yml', 'utf8')
    );
    expect(workflow['run-name']).toBe(
      'actuals-schema:${{ inputs.mode }}:${{ inputs.expected_sha }}'
    );
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
    for (const kind of ['draft', 'restatement']) {
      const step = steps.find(
        (candidate) =>
          candidate.name === `Evaluate action-specific actuals ${kind} production prerequisites`
      );
      expect(step?.env).toMatchObject({
        GH_TOKEN: '${{ github.token }}',
        NEON_API_KEY: '${{ secrets.NEON_API_KEY }}',
        ACTUALS_PREFLIGHT_SOURCE_SHA: '${{ inputs.expected_sha }}',
        PRODUCTION_DATABASE_URL: '${{ secrets.PRODUCTION_DATABASE_URL }}',
        ACTUALS_PREFLIGHT_NEON_PROJECT_ID: '${{ vars.ACTUALS_PREFLIGHT_NEON_PROJECT_ID }}',
        ACTUALS_PREFLIGHT_NEON_BRANCH_ID: '${{ vars.ACTUALS_PREFLIGHT_NEON_BRANCH_ID }}',
        ACTUALS_PREFLIGHT_NEON_ENDPOINT_ID: '${{ vars.ACTUALS_PREFLIGHT_NEON_ENDPOINT_ID }}',
        PRODUCTION_DATABASE_NAME: '${{ vars.PRODUCTION_DATABASE_NAME }}',
        ACTUALS_PREFLIGHT_DATABASE_ROLE: '${{ vars.ACTUALS_PREFLIGHT_DATABASE_ROLE }}',
      });
      expect(step?.run).toContain(`scripts/release/actuals-${kind}-production-preflight.ts`);
    }
  });

  it('binds each historical receipt mode to its exact extracted archive inventory', async () => {
    const workflow = YAML.parse(
      await readFile('.github/workflows/prod-schema-reconcile.yml', 'utf8')
    );
    const step = Object.values(workflow.jobs)
      .flatMap((job) => job.steps ?? [])
      .find(
        (candidate) =>
          candidate.name === 'Verify and download historical schema apply artifact by exact ID'
      );
    const start = step.run.indexOf('const expectedEntries = [');
    const end = step.run.indexOf('await appendFile', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const guard = ts.transpileModule(step.run.slice(start, end), {
      compilerOptions: { target: ts.ScriptTarget.ESNext },
    }).outputText;
    const base = [
      'apply.txt',
      'lock-time-apply-vector.json',
      'post-apply-audit.txt',
      'pre-apply-audit.txt',
      'schema-reconcile-receipt.json',
    ];
    const inventories = {
      apply: base,
      'apply-current-forecast-0050-0055': [...base, 'current-forecast-migration-result.json'],
      'apply-actuals-draft-0056': [
        ...base,
        'actuals-draft-before.json',
        'actuals-draft-after.json',
        'actuals-draft-migration-result.json',
        'actuals-draft-preflight-result.json',
        'actuals-draft-preflight.txt',
      ],
    };
    for (const [layoutMode, entries] of Object.entries(inventories)) {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'schema-archive-mode-'));
      try {
        await Promise.all(entries.map((entry) => writeFile(path.join(directory, entry), '')));
        for (const mode of Object.keys(inventories)) {
          const result = runInNewContext(`(async () => { ${guard} })()`, {
            receipt: { mode },
            readdir,
            path,
            process: {
              env: { RECEIPT_PATH: path.join(directory, 'schema-reconcile-receipt.json') },
            },
            deepStrictEqual: (actual, expected, message) =>
              deepStrictEqual(actual, Array.from(expected), message),
          });
          if (mode === layoutMode) await expect(result).resolves.toBeUndefined();
          else
            await expect(result).rejects.toThrow('archive inventory does not match receipt mode');
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  let pinned32FixtureRoot;

  beforeAll(async () => {
    pinned32FixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'schema-revision8-pinned32-'));
    const fixturePaths = new Set([
      ...CANONICAL_MANIFEST_IDENTITIES.map((identity) => identity.manifestPath),
      ...G3_CATCHUP_TARGETS.map((target) => target.sqlPath),
    ]);
    for (const relativePath of fixturePaths) {
      const destination = path.join(pinned32FixtureRoot, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(process.cwd(), relativePath), destination);
    }
  });

  afterAll(async () => {
    if (pinned32FixtureRoot) await rm(pinned32FixtureRoot, { recursive: true, force: true });
  });

  it('refuses current inventory additions beyond the revision8 pinned32 contract', async () => {
    const currentManifests = await loadManifests();
    expect(currentManifests.some((manifest) => manifest.order === 33)).toBe(true);
    expect(currentManifests.some((manifest) => manifest.order === 34)).toBe(true);
    await expect(prepare0053G3ReleaseGateHardeningCapability()).rejects.toMatchObject({
      details: { kind: 'invalid-0053-capability-binding' },
    });
    await expect(prepareG3Catchup0050To0053Capability()).rejects.toMatchObject({
      details: { kind: 'invalid-g3-catchup-capability-binding' },
    });
  });

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
    const target = await prepare0053G3ReleaseGateHardeningCapability({
      rootDir: pinned32FixtureRoot,
    });
    const preparedManifests = (await loadManifests(undefined, pinned32FixtureRoot)).map(
      (manifest) => ({
        manifest,
        dropStatements: [],
      })
    );
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
    const capability = await prepareG3Catchup0050To0053Capability({ rootDir: pinned32FixtureRoot });
    const targetNames = new Set(capability.targets.map((target) => target.manifestName));
    const preparedManifests = (await loadManifests(undefined, pinned32FixtureRoot)).map(
      (manifest) => ({
        manifest,
        dropStatements: [],
      })
    );
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
      parseG3CatchupLockTimeApplyVectorV1(marker, {
        preparedManifests,
        capability,
        expectedTargetActions: undefined,
      })
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
    expect(validateMode?.run).toContain(
      'audit|apply|apply-catchup-0050-0053|apply-current-forecast-0050-0055'
    );
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
    expect(applyStep?.run).toContain(
      'node scripts/run-current-forecast-journaled-migrations.mjs --apply --yes'
    );

    const serialized = JSON.stringify(workflow);
    expect(serialized).toContain('SchemaReconcileCurrentForecastReceiptV1Schema');
    expect(serialized).toContain('apply-current-forecast-0050-0055');
    expect(serialized).toContain('current-forecast-migration-result.json');
    expect(serialized).toContain("migration: currentForecast ? '0050-0055' : '0053'");

    const historicalArtifactStep = steps.find(
      (step) => step.name === 'Verify and download historical schema apply artifact by exact ID'
    );
    expect(historicalArtifactStep?.run).toContain(
      'Historical schema apply artifact name does not match receipt mode'
    );
    expect(historicalArtifactStep?.run).toContain('artifact.name !== expectedArtifactName');

    const fragmentStep = steps.find(
      (step) => step.name === 'Build and upload schema evidence fragment'
    );
    expect(fragmentStep?.run).toContain('artifactName: artifact.name');
  });
});
