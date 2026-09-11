import { deepStrictEqual } from 'node:assert';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

describe('actuals synthetic attestation witness', () => {
  const witnessEnv = {
    EXPECTED_SHA: 'a'.repeat(40),
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_WORKFLOW_SHA: 'a'.repeat(40),
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_API_URL: 'https://api.github.com',
    GITHUB_REPOSITORY: 'nikhillinit/Updog_restore',
    GITHUB_REPOSITORY_OWNER: 'nikhillinit',
    GITHUB_REPOSITORY_ID: '1234',
    GITHUB_REF: 'refs/heads/codex/a0-witness',
    GITHUB_WORKFLOW_REF:
      'nikhillinit/Updog_restore/.github/workflows/actuals-isolated-restore-proof.yml@refs/heads/codex/a0-witness',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_ACTOR: 'nikhillinit',
    GITHUB_TRIGGERING_ACTOR: 'nikhillinit',
  };

  function runWitnessStep(workflow, id, env) {
    const step = Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .find((item) => item.id === id);
    const script = step?.run.match(/node <<'NODE'\n([\s\S]*?)\nNODE(?:\n|$)/)?.[1];
    expect(script, `standalone ${id} validation script`).toBeTruthy();
    return spawnSync(process.execPath, ['--input-type=commonjs', '-'], {
      input: script,
      env: { ...witnessEnv, ...env },
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 256 * 1024,
    });
  }

  it('permits only a bounded owner-dispatched synthetic workflow', async () => {
    const source = await readFile('.github/workflows/actuals-isolated-restore-proof.yml', 'utf8');
    const workflow = YAML.parse(source);
    expect(workflow.name).toBe('actuals-isolated-restore-proof');
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.on.workflow_dispatch.inputs).toEqual({
      expected_sha: expect.objectContaining({ required: true, type: 'string' }),
    });
    expect(workflow.permissions).toEqual({
      contents: 'read',
      actions: 'read',
      'id-token': 'write',
      attestations: 'write',
    });
    expect(Object.keys(workflow.jobs)).toHaveLength(1);
    for (const job of Object.values(workflow.jobs)) {
      expect(job['runs-on']).toBe('ubuntu-24.04');
      expect(job['timeout-minutes']).toBeGreaterThan(0);
      expect(job['timeout-minutes']).toBeLessThanOrEqual(15);
      expect(job.environment).toBeUndefined();
      expect(job.permissions).toBeUndefined();
      for (const step of job.steps) {
        expect(step.environment).toBeUndefined();
        if (step.uses) {
          expect(step.uses).toMatch(/^actions\/(upload-artifact|attest)@[a-f0-9]{40}$/);
        }
      }
    }
    expect(source).not.toMatch(
      /\bsecrets\s*[.[]|\bvars\s*[.[]|DATABASE_URL|NEON_API_KEY|npm\s+(?:ci|install|start)|pnpm|yarn/
    );
    expect(source).not.toMatch(/workflow_call|pull_request_target|workflow_run:/);
  });

  it('refuses unauthorized or mismatched execution before creating witness files', async () => {
    const workflow = YAML.parse(
      await readFile('.github/workflows/actuals-isolated-restore-proof.yml', 'utf8')
    );
    const directory = await mkdtemp(path.join(os.tmpdir(), 'actuals-witness-guard-'));
    try {
      const accepted = runWitnessStep(workflow, 'guard', { WITNESS_DIR: directory });
      expect(accepted.status, accepted.stderr).toBe(0);
      for (const mismatch of [
        { GITHUB_EVENT_NAME: 'push' },
        { GITHUB_REPOSITORY: 'other/Updog_restore' },
        { GITHUB_REPOSITORY_OWNER: 'other' },
        { GITHUB_ACTOR: 'other' },
        { GITHUB_TRIGGERING_ACTOR: 'other' },
        { EXPECTED_SHA: 'main' },
        { GITHUB_SHA: 'b'.repeat(40) },
        { GITHUB_WORKFLOW_SHA: 'b'.repeat(40) },
        { GITHUB_WORKFLOW_REF: `${witnessEnv.GITHUB_WORKFLOW_REF}-other` },
        { GITHUB_RUN_ATTEMPT: '0' },
      ]) {
        const rejected = runWitnessStep(workflow, 'guard', { WITNESS_DIR: directory, ...mismatch });
        expect(rejected.error).toBeUndefined();
        expect(rejected.status, JSON.stringify(mismatch)).not.toBe(0);
      }
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('generates only fixed synthetic evidence with no caller payload', async () => {
    const workflow = YAML.parse(
      await readFile('.github/workflows/actuals-isolated-restore-proof.yml', 'utf8')
    );
    const directory = await mkdtemp(path.join(os.tmpdir(), 'actuals-witness-generate-'));
    try {
      const generated = runWitnessStep(workflow, 'generate', {
        WITNESS_DIR: path.join(directory, 'witness'),
        GITHUB_OUTPUT: path.join(directory, 'output'),
        PROOF_JSON: '{"evidenceClass":"provider-restore"}',
      });
      expect(generated.status, generated.stderr).toBe(0);
      const proof = JSON.parse(
        await readFile(path.join(directory, 'witness/subject/proof.json'), 'utf8')
      );
      expect(proof).toEqual({
        schemaVersion: 1,
        profile: 'actuals-restore-proof/1.0.0',
        evidenceClass: 'synthetic',
        message: 'Harmless attestation witness; no database restore or production admission.',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('checks certificate and archive bindings with synthetic CLI output, without claiming signature verification', async () => {
    const workflow = YAML.parse(
      await readFile('.github/workflows/actuals-isolated-restore-proof.yml', 'utf8')
    );
    const directory = await mkdtemp(path.join(os.tmpdir(), 'actuals-witness-inspect-'));
    const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
    const archive = Buffer.from('Synthetic parser transcript; not a signed archive.');
    const archiveSha256 = digest(archive);
    const artifactName = 'actuals-synthetic-proof-123-1';
    const artifactUrl =
      'https://api.github.com/repos/nikhillinit/Updog_restore/actions/artifacts/456';
    const proofJson =
      JSON.stringify({
        schemaVersion: 1,
        profile: 'actuals-restore-proof/1.0.0',
        evidenceClass: 'synthetic',
        message: 'Harmless attestation witness; no database restore or production admission.',
      }) + '\n';
    const predicate = {
      schemaVersion: 1,
      archive: { artifactId: '456', artifactName, sha256: archiveSha256 },
      proofJson,
      proofSha256: digest(proofJson),
    };
    const transcript = {
      artifact: {
        id: 456,
        name: artifactName,
        url: artifactUrl,
        archive_download_url: `${artifactUrl}/zip`,
        expired: false,
        digest: `sha256:${archiveSha256}`,
        size_in_bytes: archive.length,
        created_at: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        workflow_run: {
          id: 123,
          head_sha: witnessEnv.GITHUB_SHA,
          repository_id: 1234,
          head_repository_id: 1234,
        },
      },
      attempt: {
        id: 123,
        run_attempt: 1,
        head_sha: witnessEnv.GITHUB_SHA,
        repository: { id: 1234, full_name: witnessEnv.GITHUB_REPOSITORY },
        head_repository: { id: 1234, full_name: witnessEnv.GITHUB_REPOSITORY },
        path: '.github/workflows/actuals-isolated-restore-proof.yml',
        name: 'actuals-isolated-restore-proof',
        event: 'workflow_dispatch',
        actor: { login: 'nikhillinit' },
        triggering_actor: { login: 'nikhillinit' },
        status: 'in_progress',
        conclusion: null,
      },
      predicate,
      verification: [
        {
          verificationResult: {
            signature: {
              certificate: {
                sourceRepositoryURI: `https://github.com/${witnessEnv.GITHUB_REPOSITORY}`,
                sourceRepositoryDigest: witnessEnv.GITHUB_SHA,
                sourceRepositoryRef: witnessEnv.GITHUB_REF,
                buildConfigURI: `https://github.com/${witnessEnv.GITHUB_WORKFLOW_REF}`,
                buildConfigDigest: witnessEnv.GITHUB_SHA,
                buildSignerURI: `https://github.com/${witnessEnv.GITHUB_WORKFLOW_REF}`,
                buildSignerDigest: witnessEnv.GITHUB_SHA,
                runnerEnvironment: 'github-hosted',
                runInvocationURI:
                  'https://github.com/nikhillinit/Updog_restore/actions/runs/123/attempts/1',
              },
            },
            statement: {
              _type: 'https://in-toto.io/Statement/v1',
              predicateType: 'urn:updog:actuals-restore-proof:v1',
              subject: [{ name: `${artifactName}.zip`, digest: { sha256: archiveSha256 } }],
              predicate: globalThis.structuredClone(predicate),
            },
          },
        },
      ],
    };
    async function inspect(documents) {
      for (const [name, value] of Object.entries(documents)) {
        await writeFile(path.join(directory, `${name}.json`), JSON.stringify(value));
      }
      return runWitnessStep(workflow, 'inspect', {
        WITNESS_DIR: directory,
        ARTIFACT_ID: '456',
        ARTIFACT_DIGEST: archiveSha256,
      });
    }
    const certificate = (value) => value.verification[0].verificationResult.signature.certificate;
    const statement = (value) => value.verification[0].verificationResult.statement;
    try {
      await mkdir(path.join(directory, 'subject'));
      await writeFile(path.join(directory, 'subject/proof.json'), proofJson);
      await writeFile(path.join(directory, 'archive.zip'), archive);
      const accepted = await inspect(transcript);
      expect(accepted.status, accepted.stderr).toBe(0);
      const inspection = JSON.parse(
        await readFile(path.join(directory, 'inspection.json'), 'utf8')
      );
      expect(inspection).toMatchObject({
        evidenceClass: 'synthetic',
        finalAttemptSnapshotRequired: true,
      });
      await rm(path.join(directory, 'inspection.json'));
      for (const [name, mutate] of [
        [
          'missing runner',
          (value) => {
            delete certificate(value).runnerEnvironment;
          },
        ],
        [
          'self-hosted runner',
          (value) => {
            certificate(value).runnerEnvironment = 'self-hosted';
          },
        ],
        [
          'wrong repository',
          (value) => {
            certificate(value).sourceRepositoryURI += '-other';
          },
        ],
        [
          'wrong source',
          (value) => {
            certificate(value).sourceRepositoryDigest = 'b'.repeat(40);
          },
        ],
        [
          'workflow prefix collision',
          (value) => {
            certificate(value).buildSignerURI += '-other';
          },
        ],
        [
          'wrong signer SHA',
          (value) => {
            certificate(value).buildSignerDigest = 'b'.repeat(40);
          },
        ],
        [
          'missing attempt',
          (value) => {
            delete certificate(value).runInvocationURI;
          },
        ],
        [
          'prior attempt',
          (value) => {
            certificate(value).runInvocationURI = certificate(value).runInvocationURI.replace(
              '/attempts/1',
              '/attempts/2'
            );
          },
        ],
        [
          'wrong metadata attempt',
          (value) => {
            value.attempt.run_attempt = 2;
          },
        ],
        [
          'wrong metadata run',
          (value) => {
            value.artifact.workflow_run.id = 124;
          },
        ],
        [
          'artifact ID substitution',
          (value) => {
            statement(value).predicate.archive.artifactId = '457';
          },
        ],
        [
          'all copies of ID substituted',
          (value) => {
            value.artifact.id = 457;
            value.predicate.archive.artifactId = '457';
            statement(value).predicate.archive.artifactId = '457';
          },
        ],
        [
          'extra envelope field',
          (value) => {
            statement(value).predicate.extra = true;
          },
        ],
        [
          'wrong proof hash',
          (value) => {
            statement(value).predicate.proofSha256 = '0'.repeat(64);
          },
        ],
        [
          'wrong subject',
          (value) => {
            statement(value).subject[0].digest.sha256 = '0'.repeat(64);
          },
        ],
        [
          'ambiguous results',
          (value) => {
            value.verification.push(globalThis.structuredClone(value.verification[0]));
          },
        ],
      ]) {
        const changed = globalThis.structuredClone(transcript);
        mutate(changed);
        const rejected = await inspect(changed);
        expect(rejected.error, name).toBeUndefined();
        expect(rejected.status, name).not.toBe(0);
        expect(await readdir(directory)).not.toContain('inspection.json');
      }
      await writeFile(
        path.join(directory, 'archive.zip'),
        Buffer.concat([archive, Buffer.from('x')])
      );
      expect((await inspect(transcript)).status).not.toBe(0);
      await writeFile(path.join(directory, 'archive.zip'), archive);
      for (const invalid of ['{', ' '.repeat(256 * 1024 + 1)]) {
        await writeFile(path.join(directory, 'verification.json'), invalid);
        const rejected = runWitnessStep(workflow, 'inspect', {
          WITNESS_DIR: directory,
          ARTIFACT_ID: '456',
          ARTIFACT_DIGEST: archiveSha256,
        });
        expect(rejected.error).toBeUndefined();
        expect(rejected.status).not.toBe(0);
        expect(await readdir(directory)).not.toContain('inspection.json');
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('prod-schema-reconcile workflow', () => {
  it('binds each actuals verifier to the authenticated dispatch title and protected target inputs', async () => {
    const workflow = YAML.parse(
      await readFile('.github/workflows/prod-schema-reconcile.yml', 'utf8')
    );
    expect(workflow['run-name']).toBe(
      'actuals-schema:${{ inputs.mode }}:${{ inputs.expected_sha }}'
    );
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
    const apply = steps.find((step) => step.name === 'Apply additive-safe reconciliation');
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
      expect(apply?.env).toMatchObject(step.env);
      expect(apply?.run).toContain(
        `reports/actuals-${kind}-preflight-result.json reports/actuals-${kind}-preapply-result.json`
      );
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
    const countStart = step.run.indexOf('case "$FILE_COUNT" in');
    const countEnd = step.run.indexOf('esac', countStart) + 'esac'.length;
    expect(countStart).toBeGreaterThan(0);
    expect(countEnd).toBeGreaterThan(countStart);
    const countGuard = step.run.slice(countStart, countEnd);
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
        'actuals-draft-preapply-result.json',
        'actuals-draft-preflight.txt',
      ],
    };
    const allowlistItem = step.run.indexOf("'actuals-draft-after.json'");
    const allowlistStart = step.run.lastIndexOf("printf '%s\\n'", allowlistItem);
    const allowlistEnd = step.run.indexOf(
      ' > "$EVIDENCE_DIR/actuals-draft-expected-entries.txt"',
      allowlistStart
    );
    expect(allowlistStart).toBeGreaterThan(0);
    expect(allowlistEnd).toBeGreaterThan(allowlistStart);
    const allowlist = spawnSync('bash', ['-c', step.run.slice(allowlistStart, allowlistEnd)], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(allowlist.status).toBe(0);
    expect(allowlist.stdout.trim().split('\n')).toEqual(
      [...inventories['apply-actuals-draft-0056']].sort()
    );
    const upload = Object.values(workflow.jobs)
      .flatMap((job) => job.steps ?? [])
      .find((candidate) => candidate.id === 'upload_evidence');
    const uploadPaths = upload.with.path.trim().split(/\s+/);
    for (const entry of inventories['apply-actuals-draft-0056']) {
      expect(uploadPaths).toContain(entry.endsWith('.txt') ? 'reports/*.txt' : `reports/${entry}`);
    }
    for (const [layoutMode, entries] of Object.entries(inventories)) {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'schema-archive-mode-'));
      try {
        await Promise.all(entries.map((entry) => writeFile(path.join(directory, entry), '')));
        const extractedCount = String((await readdir(directory)).length);
        const countResult = spawnSync('bash', ['-c', countGuard], {
          env: { FILE_COUNT: extractedCount },
          encoding: 'utf8',
          timeout: 10_000,
        });
        expect(countResult.error).toBeUndefined();
        expect(countResult.status, countResult.stdout).toBe(0);
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
