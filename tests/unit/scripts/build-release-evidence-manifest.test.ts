import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { main } from '../../../scripts/release/build-release-evidence-manifest';
import {
  buildSchemaReconcileCatchupReceipt,
  targetsFromLockTimeVector,
} from '../../../scripts/release/build-schema-reconcile-receipt';

import { RELEASE_CANARY_RESERVED_RESIDUE } from '../../../shared/contracts/release-canary-residue-characterization-v1.contract';
import {
  sha256CanonicalJsonOfPayload,
  type ReleaseEvidenceFragmentKind,
} from '../../../shared/contracts/release-evidence-fragment-v1.contract';
import { parseReleaseEvidenceManifest } from '../../../shared/contracts/release-evidence-manifest-v1.contract';

const SOURCE_SHA = 'a'.repeat(40);
const PRECHANGE_SHA = 'b'.repeat(40);
const PRECURSOR_SHA = 'c'.repeat(40);
const BASELINE_MAIN_SHA = 'd'.repeat(40);
const PLANNED_PR_HEAD_SHA = 'e'.repeat(40);
const LIVE_HEAD_SHA = 'f'.repeat(40);
const RUN_ID = '987654321';
const RUN_ATTEMPT = 1;
const REPOSITORY = 'octo-owner/updog';
const STARTED_AT = '2026-08-19T00:00:00Z';
const CALLER_REF = `${REPOSITORY}/.github/workflows/release-production.yml@refs/heads/main`;
const PROOF_REF = `${REPOSITORY}/.github/workflows/release-proof.yml@${SOURCE_SHA}`;
const CATCHUP_RUN_ID = '32196991205';
const CATCHUP_ARTIFACT_ID = '9346200295';
const CATCHUP_ARCHIVE_SHA256 = 'dba91d1c6e00848c2d9249073e9df6f73729e2fc627f9edffbd6abc025a346e9';
const CATCHUP_ARCHIVE_DIGEST = `sha256:${CATCHUP_ARCHIVE_SHA256}`;
const CATCHUP_RECEIPT_SHA256 = 'af35a0385b5835a6119e5797a34af7f4505cd4c2412602d2d9d5f621e845bc9b';
const CATCHUP_SOURCE_SHA = 'de932a2af2a876320003293dd6ae5bbbc6400397';

const RESERVED = RELEASE_CANARY_RESERVED_RESIDUE;
const CAPS = Object.fromEntries(Object.entries(RESERVED).map(([key, value]) => [key, value * 3]));

function hex(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function vercelIdentity(sha: string): Record<string, unknown> {
  return { projectId: 'prj-1', deploymentId: 'dpl-1', hostname: 'app.example.com', sourceSha: sha };
}

function railwayIdentity(sha: string): Record<string, unknown> {
  return {
    projectId: 'rail-proj',
    environmentId: 'rail-env',
    services: [
      {
        serviceName: 'fund-scenario-calc',
        serviceId: 'svc-1',
        deploymentId: 'dep-1',
        sourceSha: sha,
      },
      {
        serviceName: 'capital-call-status',
        serviceId: 'svc-2',
        deploymentId: 'dep-2',
        sourceSha: sha,
      },
    ],
  };
}

interface FragmentEntry {
  kind: ReleaseEvidenceFragmentKind;
  path: string;
  artifactId: string;
  artifactName: string;
  artifactArchiveSha256: string;
  fileSha256: string;
  payloadSha256: string;
  producerJob: string;
}

async function writeFragmentFile(
  dir: string,
  kind: ReleaseEvidenceFragmentKind,
  payload: unknown,
  producerJob: string,
  envelopeOverrides: Record<string, unknown> = {}
): Promise<FragmentEntry> {
  const payloadSha256 = sha256CanonicalJsonOfPayload(payload);
  const envelope = {
    schemaVersion: 'release-evidence-fragment-v1',
    kind,
    runId: RUN_ID,
    runAttempt: RUN_ATTEMPT,
    sourceSha: SOURCE_SHA,
    producerJob,
    createdAt: '2026-08-19T00:05:00Z',
    payloadSha256,
    payload,
    ...envelopeOverrides,
  };
  const filePath = path.join(dir, `fragment-${kind}-${randomUUID()}.json`);
  const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`, 'utf8');
  await writeFile(filePath, bytes);
  return {
    kind,
    path: filePath,
    artifactId: String(9000 + kind.length),
    artifactName: `release-evidence-fragment-v1-${kind}-${RUN_ID}-${RUN_ATTEMPT}-${SOURCE_SHA}`,
    artifactArchiveSha256: `sha256:${hex(`archive-${kind}`)}`,
    fileSha256: sha256Of(bytes),
    payloadSha256,
    producerJob,
  };
}

interface Fixture {
  dir: string;
  inputs: Record<string, unknown>;
  payloads: Record<string, unknown>;
}

async function buildFixture(proof: 'success' | 'failure' = 'success'): Promise<Fixture> {
  const dir = await mkdtemp(path.join(tmpdir(), 'manifest-builder-'));

  const baselinePayload = {
    prechange: { vercel: vercelIdentity(PRECHANGE_SHA), railway: railwayIdentity(PRECHANGE_SHA) },
    rollback: { targetMainSha: BASELINE_MAIN_SHA, recoveryContextSha256: hex('context-file') },
    baselineArtifact: {
      runId: '1111',
      runAttempt: 1,
      workflowPath: '.github/workflows/capture-release-baseline.yml',
      baselineMainSha: BASELINE_MAIN_SHA,
      plannedPrHeadSha: PLANNED_PR_HEAD_SHA,
      artifactId: '2222',
      artifactName: `release-baseline-v1-1111-1-${PLANNED_PR_HEAD_SHA}`,
      artifactArchiveSha256: hex('baseline-archive'),
      contextFileSha256: hex('context-file'),
    },
  };
  const schemaPayload = {
    migration: '0053',
    precursorSha: PRECURSOR_SHA,
    apply: {
      runId: '3333',
      runAttempt: 1,
      workflowPath: '.github/workflows/prod-schema-reconcile.yml',
      sourceSha: PRECURSOR_SHA,
      runUrl: 'https://github.com/octo-owner/updog/actions/runs/3333',
      artifactId: '4444',
      artifactName: `prod-schema-reconcile-3333-1-apply-${PRECURSOR_SHA}`,
      artifactArchiveSha256: hex('schema-archive'),
      receiptFileSha256: hex('receipt'),
    },
    audit: {
      runId: RUN_ID,
      runAttempt: RUN_ATTEMPT,
      workflowPath: '.github/workflows/prod-schema-reconcile.yml',
      sourceSha: SOURCE_SHA,
      runUrl: `https://github.com/octo-owner/updog/actions/runs/${RUN_ID}`,
      result: 'clean',
    },
  };
  const policyConfigPayload = {
    reservedPerRun: RESERVED,
    configuredCaps: CAPS,
    retainedRunBudget: 3,
    ttlHours: 24,
  };
  const measurementPayload = { residue: RESERVED };
  const operatorPayload = {
    bundleSha256: hex('bundle'),
    capturedAt: '2026-08-19T00:30:00Z',
    verifiedAt: '2026-08-19T00:31:00Z',
  };
  const providerPayload = {
    vercel: vercelIdentity(SOURCE_SHA),
    railway: railwayIdentity(SOURCE_SHA),
  };
  const canaryPayload = {
    execution: {
      fundId: 1,
      canaryRunId: '11111111-2222-4333-8444-555555555555',
      githubRunId: RUN_ID,
      githubRunAttempt: RUN_ATTEMPT,
      releaseSha: SOURCE_SHA,
      startedAt: '2026-08-19T00:20:00Z',
    },
    status: 'completed',
    residue: RESERVED,
    h9Artifact: {
      // Positive-integer IDs (reportPackageExportId / reportPackageId) — the
      // H9 surface carries no UUID identity.
      recordId: 41,
      packageId: 7,
      contentHash: hex('h9-content'),
      fingerprint: hex('h9-fingerprint'),
      sizeBytes: 1024,
    },
  };
  const characterizationFileSha256 = hex('characterization-file');
  const success = proof === 'success';
  const fragments: Record<string, FragmentEntry | null> = {
    baseline: await writeFragmentFile(
      dir,
      'baseline',
      baselinePayload,
      'baseline-policy-preflight'
    ),
    schema: success ? await writeFragmentFile(dir, 'schema', schemaPayload, 'schema-audit') : null,
    policyConfig: await writeFragmentFile(
      dir,
      'policy-config',
      policyConfigPayload,
      'baseline-policy-preflight'
    ),
    policyMeasurement: success
      ? await writeFragmentFile(dir, 'policy-measurement', measurementPayload, 'staged-smoke')
      : null,
    policyRatification: null,
    operatorEvidence: success
      ? await writeFragmentFile(dir, 'operator-evidence', operatorPayload, 'g4-operator-evidence')
      : null,
    releaseProvider: success
      ? await writeFragmentFile(dir, 'release-provider', providerPayload, 'promote')
      : null,
    canaryResult: success
      ? await writeFragmentFile(dir, 'canary-result', canaryPayload, 'staged-smoke')
      : null,
  };

  const certification = {
    schemaVersion: 'release-proof-certification-v1',
    repository: REPOSITORY,
    runId: RUN_ID,
    runAttempt: RUN_ATTEMPT,
    sourceSha: SOURCE_SHA,
    callerWorkflowRef: CALLER_REF,
    proofWorkflowRef: PROOF_REF,
    conclusions: success
      ? {
          fullReleaseProof: 'success',
          providerIdentity: 'success',
          canaryResidueCharacterization: 'success',
          g3ExactShaVerdict: 'success',
        }
      : {
          fullReleaseProof: 'failure',
          providerIdentity: 'skipped',
          canaryResidueCharacterization: 'skipped',
          g3ExactShaVerdict: 'skipped',
        },
    summaries: {
      matrixSummarySha256: hex('matrix'),
      releaseCheckSummarySha256: hex('release-check'),
    },
    characterizationArtifact: success
      ? {
          artifactId: '5555',
          artifactName: `release-canary-residue-characterization-v1-${RUN_ID}-${RUN_ATTEMPT}-${SOURCE_SHA}`,
          artifactArchiveSha256: hex('char-archive'),
          fileSha256: characterizationFileSha256,
          sourceSha: SOURCE_SHA,
        }
      : null,
    overallConclusion: success ? 'success' : 'failure',
  };
  const certificationBytes = Buffer.from(`${JSON.stringify(certification)}\n`, 'utf8');
  const certificationFilePath = path.join(dir, 'certification.json');
  await writeFile(certificationFilePath, certificationBytes);
  const certificationFileSha256 = sha256Of(certificationBytes);

  const lineage = {
    schemaVersion: 'release-proof-lineage-v1',
    repository: REPOSITORY,
    runId: RUN_ID,
    runAttempt: RUN_ATTEMPT,
    sourceSha: SOURCE_SHA,
    callerWorkflowRef: CALLER_REF,
    proofWorkflowRef: PROOF_REF,
    conclusion: success ? 'success' : 'failure',
    certificationArtifact: {
      artifactId: '6666',
      artifactName: `release-proof-certification-v1-${RUN_ID}-${RUN_ATTEMPT}-${SOURCE_SHA}`,
      artifactArchiveSha256: hex('cert-archive'),
      certificationFileSha256,
    },
  };
  const lineageBytes = Buffer.from(`${JSON.stringify(lineage)}\n`, 'utf8');
  const lineageFilePath = path.join(dir, 'lineage.json');
  await writeFile(lineageFilePath, lineageBytes);

  const binding = {
    schemaVersion: 'release-baseline-binding-v1',
    baselineRunId: '1111',
    baselineRunAttempt: 1,
    baselineArtifactId: '2222',
    baselineArtifactDigest: `sha256:${hex('baseline-archive')}`,
    baselineFileSha256: hex('context-file'),
  };

  const inputs: Record<string, unknown> = {
    source: {
      repository: REPOSITORY,
      sha: SOURCE_SHA,
      releaseMode: 'primary',
      pullRequest: 1385,
      pullRequestHeadSha: LIVE_HEAD_SHA,
    },
    baselineEvidenceB64: Buffer.from(JSON.stringify(binding), 'utf8').toString('base64'),
    certificationFilePath,
    lineageFilePath,
    certificationOutputs: {
      proofRunId: RUN_ID,
      proofRunAttempt: String(RUN_ATTEMPT),
      proofSourceSha: SOURCE_SHA,
      callerWorkflowRef: CALLER_REF,
      proofWorkflowRef: PROOF_REF,
      proofConclusion: success ? 'success' : 'failure',
      certificationArtifactId: '6666',
      certificationArtifactName: `release-proof-certification-v1-${RUN_ID}-${RUN_ATTEMPT}-${SOURCE_SHA}`,
      certificationArtifactDigest: `sha256:${hex('cert-archive')}`,
      certificationFileSha256,
      lineageArtifactId: '7777',
      lineageArtifactName: `release-proof-lineage-v1-${RUN_ID}-${RUN_ATTEMPT}-${SOURCE_SHA}`,
      lineageArtifactDigest: `sha256:${hex('lineage-archive')}`,
      lineageFileSha256: sha256Of(lineageBytes),
    },
    characterization: success
      ? {
          artifactId: '5555',
          artifactName: `release-canary-residue-characterization-v1-${RUN_ID}-${RUN_ATTEMPT}-${SOURCE_SHA}`,
          artifactArchiveSha256: `sha256:${hex('char-archive')}`,
          fileSha256: characterizationFileSha256,
          sourceSha: SOURCE_SHA,
        }
      : null,
    schemaInputs: success
      ? {
          runId: '3333',
          runAttempt: '1',
          artifactId: '4444',
          artifactDigest: `sha256:${hex('schema-archive')}`,
          receiptFileSha256: hex('receipt'),
          precursorSha: PRECURSOR_SHA,
        }
      : null,
    workflow: {
      runId: RUN_ID,
      runAttempt: RUN_ATTEMPT,
      startedAt: STARTED_AT,
      preManifestOutcome: success ? 'success' : 'failure',
      failureStage: success ? null : 'release-proof',
    },
    fragments,
  };

  return {
    dir,
    inputs,
    payloads: {
      baseline: baselinePayload,
      schema: schemaPayload,
      policyConfig: policyConfigPayload,
      policyMeasurement: measurementPayload,
      operatorEvidence: operatorPayload,
      releaseProvider: providerPayload,
      canaryResult: canaryPayload,
    },
  };
}

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const SCRIPT = path.join(ROOT, 'scripts', 'release', 'build-release-evidence-manifest.ts');

// Runs the builder as a subprocess so the script-level failure reporter and
// exit code are exercised (the in-process runBuilder bypasses both).
async function runBuilderSubprocess(
  fixture: Fixture
): Promise<{ code: number; stdout: string; stderr: string }> {
  const inputsPath = path.join(fixture.dir, `inputs-${randomUUID()}.json`);
  await writeFile(inputsPath, JSON.stringify(fixture.inputs));
  const outputPath = path.join(fixture.dir, `manifest-${randomUUID()}.json`);
  const args = [
    '--designation',
    'infrastructure_only',
    '--candidate',
    'false',
    '--output',
    outputPath,
  ];
  try {
    const { stdout, stderr } = await execFileAsync(TSX, [SCRIPT, ...args], {
      cwd: ROOT,
      env: {
        PATH: process.env['PATH'] ?? '',
        HOME: process.env['HOME'] ?? '',
        RELEASE_EVIDENCE_INPUTS_PATH: inputsPath,
      },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

async function runBuilder(
  fixture: Fixture,
  {
    designation = 'infrastructure_only',
    candidate = 'false',
  }: { designation?: string; candidate?: string } = {}
): Promise<{ outputPath: string; lines: string[] }> {
  const inputsPath = path.join(fixture.dir, `inputs-${randomUUID()}.json`);
  await writeFile(inputsPath, JSON.stringify(fixture.inputs));
  const outputPath = path.join(fixture.dir, `manifest-${randomUUID()}.json`);
  const lines: string[] = [];
  await main(
    ['--designation', designation, '--candidate', candidate, '--output', outputPath],
    { RELEASE_EVIDENCE_INPUTS_PATH: inputsPath } as NodeJS.ProcessEnv,
    { output: (line: string) => lines.push(line) }
  );
  return { outputPath, lines };
}

describe('build-release-evidence-manifest', () => {
  it('builds a success manifest end-to-end with exact stdout format', async () => {
    const fixture = await buildFixture();
    const { outputPath, lines } = await runBuilder(fixture);
    const bytes = await readFile(outputPath);
    const manifest = parseReleaseEvidenceManifest(JSON.parse(bytes.toString('utf8')));

    expect(manifest.designation).toBe('infrastructure_only');
    expect(manifest.candidate).toBe(false);
    expect(manifest.source.pullRequest).toBe(1385);
    expect(manifest.source.pullRequestHeadSha).toBe(LIVE_HEAD_SHA);
    expect(manifest.source.planApprovalPullRequest).toBeNull();
    expect(manifest.source.planPath).toBeNull();
    expect(manifest.source.planSha256).toBeNull();
    expect(manifest.approval).toBeNull();
    expect(manifest.certification.conclusion).toBe('success');
    expect(manifest.certification.lineageArtifact.artifactArchiveSha256).toBe(
      hex('lineage-archive')
    );
    expect(manifest.policy.stagedMeasuredResidue).toEqual(RESERVED);
    expect(manifest.policy.ratification).toBeNull();
    expect(manifest.schema).not.toBeNull();
    expect(manifest.h9Artifact).not.toBeNull();
    expect(manifest.canary?.status).toBe('completed');
    expect(manifest.fragmentLineage.canaryResult?.artifactArchiveSha256).toBe(
      hex('archive-canary-result')
    );
    expect(manifest.rollback).toEqual({
      mode: 'primary',
      recoveryContextSha256: hex('context-file'),
      targetMainSha: BASELINE_MAIN_SHA,
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(outputPath);
    expect(JSON.parse(lines[1] as string)).toEqual({ manifestSha256: sha256Of(bytes) });
  });

  it('accepts catch-up schema receipt pinned to historical run 32196991205', async () => {
    const catchupReceipt = buildSchemaReconcileCatchupReceipt({
      repository: REPOSITORY,
      workflowPath: '.github/workflows/prod-schema-reconcile.yml',
      runId: CATCHUP_RUN_ID,
      runAttempt: 1,
      sourceSha: CATCHUP_SOURCE_SHA,
      targets: targetsFromLockTimeVector({
        decisions: [
          { manifest: 'g3-portfolio-and-calculation', action: 'APPLY-MISSING-DDL' },
          { manifest: 'g3-canary', action: 'SKIP' },
          { manifest: 'g3-capital-call-notification-outbox', action: 'SKIP' },
          { manifest: 'g3-release-gate-hardening', action: 'SKIP' },
        ],
      }),
      startedAtMs: Date.parse('2026-08-18T00:00:00Z'),
      completedAtMs: Date.parse('2026-08-18T00:05:00Z'),
    });

    expect(catchupReceipt).toMatchObject({
      runId: CATCHUP_RUN_ID,
      runAttempt: 1,
      mode: 'apply-catchup-0050-0053',
      sourceSha: CATCHUP_SOURCE_SHA,
      result: 'applied_and_clean',
    });

    const fixture = await buildFixture();
    const schemaPayload = fixture.payloads.schema as {
      migration: string;
      precursorSha: string;
      apply: Record<string, unknown>;
      audit: Record<string, unknown>;
    };
    const catchupSchemaPayload = {
      ...schemaPayload,
      precursorSha: CATCHUP_SOURCE_SHA,
      apply: {
        ...schemaPayload.apply,
        runId: CATCHUP_RUN_ID,
        sourceSha: CATCHUP_SOURCE_SHA,
        runUrl: `https://github.com/${REPOSITORY}/actions/runs/${CATCHUP_RUN_ID}`,
        artifactId: CATCHUP_ARTIFACT_ID,
        artifactName: `prod-schema-reconcile-${CATCHUP_RUN_ID}-1-apply-${CATCHUP_SOURCE_SHA}`,
        artifactArchiveSha256: CATCHUP_ARCHIVE_SHA256,
        receiptFileSha256: CATCHUP_RECEIPT_SHA256,
      },
    };
    const fragments = fixture.inputs['fragments'] as Record<string, unknown>;
    fragments.schema = await writeFragmentFile(
      fixture.dir,
      'schema',
      catchupSchemaPayload,
      'schema-audit'
    );
    Object.assign(fixture.inputs['schemaInputs'] as Record<string, unknown>, {
      runId: CATCHUP_RUN_ID,
      runAttempt: '1',
      artifactId: CATCHUP_ARTIFACT_ID,
      artifactDigest: CATCHUP_ARCHIVE_DIGEST,
      receiptFileSha256: CATCHUP_RECEIPT_SHA256,
      precursorSha: CATCHUP_SOURCE_SHA,
    });

    const { outputPath } = await runBuilder(fixture);
    const manifest = parseReleaseEvidenceManifest(
      JSON.parse((await readFile(outputPath)).toString('utf8'))
    );

    expect(manifest.schema).toMatchObject({
      migration: '0053',
      precursorSha: CATCHUP_SOURCE_SHA,
      apply: {
        runId: CATCHUP_RUN_ID,
        runAttempt: 1,
        sourceSha: CATCHUP_SOURCE_SHA,
        artifactId: CATCHUP_ARTIFACT_ID,
        artifactArchiveSha256: CATCHUP_ARCHIVE_SHA256,
        receiptFileSha256: CATCHUP_RECEIPT_SHA256,
      },
      audit: { sourceSha: SOURCE_SHA },
    });
  });

  it('builds a failure manifest with schema null and failureStage release-proof', async () => {
    const fixture = await buildFixture('failure');
    const { outputPath } = await runBuilder(fixture);
    const manifest = parseReleaseEvidenceManifest(
      JSON.parse((await readFile(outputPath)).toString('utf8'))
    );
    expect(manifest.workflow.preManifestOutcome).toBe('failure');
    expect(manifest.workflow.failureStage).toBe('release-proof');
    expect(manifest.schema).toBeNull();
    expect(manifest.policy.stagedMeasuredResidue).toBeNull();
    expect(manifest.policy.ratification).toBeNull();
    expect(manifest.policy.characterizationEvidence).toBeNull();
    expect(manifest.release).toBeNull();
    expect(manifest.canary).toBeNull();
    expect(manifest.h9Artifact).toBeNull();
    expect(manifest.fragmentLineage.schema).toBeNull();
    expect(manifest.fragmentLineage.baseline.kind).toBe('baseline');
  });

  it('fails on the success path when any one of the seven fragments is missing', async () => {
    const keys = [
      'baseline',
      'schema',
      'policyConfig',
      'policyMeasurement',
      'operatorEvidence',
      'releaseProvider',
      'canaryResult',
    ];
    for (const key of keys) {
      const fixture = await buildFixture();
      (fixture.inputs['fragments'] as Record<string, unknown>)[key] = null;
      await expect(runBuilder(fixture)).rejects.toThrow();
    }
  });

  it('rejects duplicate and unknown flags', async () => {
    await expect(
      main(
        [
          '--designation',
          'infrastructure_only',
          '--designation',
          'infrastructure_only',
          '--candidate',
          'false',
          '--output',
          '/dev/null',
        ],
        {} as NodeJS.ProcessEnv,
        { output: () => undefined }
      )
    ).rejects.toThrow(/only once/);
    await expect(
      main(
        ['--designation', 'infrastructure_only', '--candidate', 'false', '--bogus', 'x'],
        {} as NodeJS.ProcessEnv,
        { output: () => undefined }
      )
    ).rejects.toThrow(/unknown argument/);
  });

  it('rejects a fragment bound to the wrong source SHA', async () => {
    const fixture = await buildFixture();
    (fixture.inputs['fragments'] as Record<string, unknown>)['canaryResult'] =
      await writeFragmentFile(
        fixture.dir,
        'canary-result',
        fixture.payloads['canaryResult'],
        'staged-smoke',
        { sourceSha: PRECHANGE_SHA }
      );
    await expect(runBuilder(fixture)).rejects.toThrow(/source SHA/);
  });

  it('rejects a fragment with the wrong producer job', async () => {
    const fixture = await buildFixture();
    const fragments = fixture.inputs['fragments'] as Record<string, FragmentEntry>;
    (fragments['operatorEvidence'] as FragmentEntry).producerJob = 'staged-smoke';
    await expect(runBuilder(fixture)).rejects.toThrow(/producer job/);
  });

  it('rejects a prior-attempt fragment', async () => {
    const fixture = await buildFixture();
    (fixture.inputs['fragments'] as Record<string, unknown>)['operatorEvidence'] =
      await writeFragmentFile(
        fixture.dir,
        'operator-evidence',
        fixture.payloads['operatorEvidence'],
        'g4-operator-evidence',
        { runAttempt: 2 }
      );
    await expect(runBuilder(fixture)).rejects.toThrow(/run id and attempt/);
  });

  it('rejects transported file and payload digest mismatches', async () => {
    const tamperedFile = await buildFixture();
    const fileFragments = tamperedFile.inputs['fragments'] as Record<string, FragmentEntry>;
    (fileFragments['baseline'] as FragmentEntry).fileSha256 = hex('tampered-file');
    await expect(runBuilder(tamperedFile)).rejects.toThrow(/file hash/);

    const tamperedPayload = await buildFixture();
    const payloadFragments = tamperedPayload.inputs['fragments'] as Record<string, FragmentEntry>;
    (payloadFragments['schema'] as FragmentEntry).payloadSha256 = hex('tampered-payload');
    await expect(runBuilder(tamperedPayload)).rejects.toThrow(/payload hash/);
  });

  it('rejects a designation/candidate mismatch', async () => {
    const fixture = await buildFixture();
    await expect(
      runBuilder(fixture, { designation: 'infrastructure_only', candidate: 'true' })
    ).rejects.toThrow(/candidate/);
    await expect(
      runBuilder(fixture, { designation: 'activation_candidate', candidate: 'false' })
    ).rejects.toThrow(/candidate/);
  });

  it('accepts activation_candidate with candidate true at the builder level', async () => {
    const fixture = await buildFixture();
    const { outputPath } = await runBuilder(fixture, {
      designation: 'activation_candidate',
      candidate: 'true',
    });
    const manifest = parseReleaseEvidenceManifest(
      JSON.parse((await readFile(outputPath)).toString('utf8'))
    );
    expect(manifest.designation).toBe('activation_candidate');
    expect(manifest.candidate).toBe(true);
  });

  it('rejects secret-shaped content flowing into the manifest', async () => {
    const fixture = await buildFixture();
    const secret = 'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    (fixture.inputs['source'] as Record<string, unknown>)['pullRequestHeadSha'] = secret;
    await expect(runBuilder(fixture)).rejects.toThrow(/secret-shaped/i);
  });

  it(
    'reports a corrupted fragment envelope by path only, never echoing its values',
    { timeout: 120_000 },
    async () => {
      const secret = 'postgres://leaky-user:leaky-pass@corrupt-host/db';
      const fixture = await buildFixture();
      (fixture.inputs['fragments'] as Record<string, unknown>)['operatorEvidence'] =
        await writeFragmentFile(
          fixture.dir,
          'operator-evidence',
          fixture.payloads['operatorEvidence'],
          'g4-operator-evidence',
          { schemaVersion: secret, unexpectedExtra: secret }
        );
      const result = await runBuilderSubprocess(fixture);
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('fragment operatorEvidence envelope is invalid');
      expect(result.stderr).not.toContain(secret);
      expect(result.stderr).not.toContain('leaky-pass');
    }
  );

  it('rejects a baseline fragment that contradicts the dispatched binding', async () => {
    const fixture = await buildFixture();
    const binding = {
      schemaVersion: 'release-baseline-binding-v1',
      baselineRunId: '1111',
      baselineRunAttempt: 1,
      baselineArtifactId: '9999',
      baselineArtifactDigest: `sha256:${hex('baseline-archive')}`,
      baselineFileSha256: hex('context-file'),
    };
    fixture.inputs['baselineEvidenceB64'] = Buffer.from(JSON.stringify(binding), 'utf8').toString(
      'base64'
    );
    await expect(runBuilder(fixture)).rejects.toThrow(/baseline evidence binding/);
  });
});
