import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCHEMA_RECONCILE_CATCHUP_TARGET_IDENTITIES,
  SchemaReconcileCatchupReceiptV1Schema,
  SchemaReconcileReceiptV1Schema,
  type SchemaReconcileCatchupReceiptV1,
  type SchemaReconcileReceiptV1,
} from '../../shared/contracts/schema-reconcile-receipt-v1.contract';

export interface BuildSchemaReconcileReceiptInput {
  repository: string;
  workflowPath: '.github/workflows/prod-schema-reconcile.yml';
  runId: string;
  runAttempt: number;
  mode: 'apply';
  sourceSha: string;
  manifest: '30-g3-release-gate-hardening';
  migration: '0053';
  preDecision: 'APPLY-MISSING-DDL';
  postDecision: 'SKIP';
  startedAtMs: number;
  completedAtMs: number;
}

function assertTimestamp(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer timestamp`);
  }
}

export function buildSchemaReconcileReceipt(
  input: BuildSchemaReconcileReceiptInput
): SchemaReconcileReceiptV1 {
  assertTimestamp('startedAtMs', input.startedAtMs);
  assertTimestamp('completedAtMs', input.completedAtMs);
  if (input.completedAtMs < input.startedAtMs) {
    throw new Error('completedAtMs must not precede startedAtMs');
  }

  return SchemaReconcileReceiptV1Schema.parse({
    repository: input.repository,
    workflowPath: input.workflowPath,
    runId: input.runId,
    runAttempt: input.runAttempt,
    mode: input.mode,
    sourceSha: input.sourceSha,
    manifest: input.manifest,
    migration: input.migration,
    preDecision: input.preDecision,
    postDecision: input.postDecision,
    buildTimeMs: input.completedAtMs - input.startedAtMs,
    result: 'applied_and_clean',
  });
}

export interface BuildSchemaReconcileCatchupReceiptInput {
  repository: string;
  workflowPath: '.github/workflows/prod-schema-reconcile.yml';
  runId: string;
  runAttempt: number;
  sourceSha: string;
  targets: SchemaReconcileCatchupReceiptV1['targets'];
  startedAtMs: number;
  completedAtMs: number;
}

export function buildSchemaReconcileCatchupReceipt(
  input: BuildSchemaReconcileCatchupReceiptInput
): SchemaReconcileCatchupReceiptV1 {
  assertTimestamp('startedAtMs', input.startedAtMs);
  assertTimestamp('completedAtMs', input.completedAtMs);
  if (input.completedAtMs < input.startedAtMs) {
    throw new Error('completedAtMs must not precede startedAtMs');
  }

  return SchemaReconcileCatchupReceiptV1Schema.parse({
    repository: input.repository,
    workflowPath: input.workflowPath,
    runId: input.runId,
    runAttempt: input.runAttempt,
    mode: 'apply-catchup-0050-0053',
    sourceSha: input.sourceSha,
    targets: input.targets,
    buildTimeMs: input.completedAtMs - input.startedAtMs,
    result: 'applied_and_clean',
  });
}

// Derives per-target decisions from the validated lock-time apply vector —
// the run's mutation authority — never from the pre-lock audit, which can
// legitimately differ by the time the advisory lock is held. postDecision is
// asserted rather than parsed: the workflow's "Require clean post-apply audit"
// gate (all manifests SKIP) is a hard precondition of the receipt step.
export function targetsFromLockTimeVector(
  vector: unknown
): SchemaReconcileCatchupReceiptV1['targets'] {
  const decisionsRaw: unknown =
    typeof vector === 'object' && vector !== null && 'decisions' in vector
      ? (vector as { decisions: unknown }).decisions
      : undefined;
  if (!Array.isArray(decisionsRaw)) {
    throw new Error('Lock-time apply vector decisions are missing');
  }
  const decisions: unknown[] = decisionsRaw;
  const actionFor = (auditName: string): 'SKIP' | 'APPLY-MISSING-DDL' => {
    const matches = decisions.filter(
      (decision) =>
        typeof decision === 'object' &&
        decision !== null &&
        (decision as { manifest?: unknown }).manifest === auditName
    );
    const action: unknown =
      matches.length === 1 ? (matches[0] as { action?: unknown }).action : undefined;
    if (action !== 'SKIP' && action !== 'APPLY-MISSING-DDL') {
      throw new Error(
        `Lock-time apply vector must contain exactly one SKIP/APPLY decision for ${auditName}`
      );
    }
    return action;
  };
  const [first, second, third, fourth] = SCHEMA_RECONCILE_CATCHUP_TARGET_IDENTITIES;
  return [
    {
      manifest: first.manifest,
      migration: first.migration,
      preDecision: actionFor(first.auditName),
      postDecision: 'SKIP',
    },
    {
      manifest: second.manifest,
      migration: second.migration,
      preDecision: actionFor(second.auditName),
      postDecision: 'SKIP',
    },
    {
      manifest: third.manifest,
      migration: third.migration,
      preDecision: actionFor(third.auditName),
      postDecision: 'SKIP',
    },
    {
      manifest: fourth.manifest,
      migration: fourth.migration,
      preDecision: actionFor(fourth.auditName),
      postDecision: 'SKIP',
    },
  ];
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredPositiveIntegerEnvironment(name: string): number {
  const value = Number(requiredEnvironment(name));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parseOutputPath(argv: readonly string[]): string {
  const index = argv.indexOf('--output');
  const output = index >= 0 ? argv[index + 1] : undefined;
  if (!output) throw new Error('--output is required');
  return path.resolve(output);
}

export async function writeSchemaReconcileReceipt(
  outputPath: string,
  receipt: SchemaReconcileReceiptV1 | SchemaReconcileCatchupReceiptV1
): Promise<void> {
  const directory = path.dirname(outputPath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  const startedAtMs = process.env['SCHEMA_RECONCILE_BUILD_STARTED_AT_MS']
    ? Number(process.env['SCHEMA_RECONCILE_BUILD_STARTED_AT_MS'])
    : Date.now();
  const completedAtMs = process.env['SCHEMA_RECONCILE_BUILD_COMPLETED_AT_MS']
    ? Number(process.env['SCHEMA_RECONCILE_BUILD_COMPLETED_AT_MS'])
    : Date.now();
  const mode = requiredEnvironment('SCHEMA_RECONCILE_MODE');
  let receipt: SchemaReconcileReceiptV1 | SchemaReconcileCatchupReceiptV1;
  if (mode === 'apply-catchup-0050-0053') {
    // Path is pinned: the vector file is written by the workflow's
    // "Validate lock-time apply vector" step, a hard predecessor of this one.
    const lockTimeVector: unknown = JSON.parse(
      await readFile('reports/lock-time-apply-vector.json', 'utf8')
    );
    receipt = buildSchemaReconcileCatchupReceipt({
      repository: requiredEnvironment('GITHUB_REPOSITORY'),
      workflowPath: '.github/workflows/prod-schema-reconcile.yml',
      runId: requiredEnvironment('GITHUB_RUN_ID'),
      runAttempt: requiredPositiveIntegerEnvironment('GITHUB_RUN_ATTEMPT'),
      sourceSha: requiredEnvironment('SCHEMA_RECONCILE_SOURCE_SHA'),
      targets: targetsFromLockTimeVector(lockTimeVector),
      startedAtMs,
      completedAtMs,
    });
  } else if (mode === 'apply') {
    receipt = buildSchemaReconcileReceipt({
      repository: requiredEnvironment('GITHUB_REPOSITORY'),
      workflowPath: '.github/workflows/prod-schema-reconcile.yml',
      runId: requiredEnvironment('GITHUB_RUN_ID'),
      runAttempt: requiredPositiveIntegerEnvironment('GITHUB_RUN_ATTEMPT'),
      mode: 'apply',
      sourceSha: requiredEnvironment('SCHEMA_RECONCILE_SOURCE_SHA'),
      manifest: '30-g3-release-gate-hardening',
      migration: '0053',
      preDecision: 'APPLY-MISSING-DDL',
      postDecision: 'SKIP',
      startedAtMs,
      completedAtMs,
    });
  } else {
    throw new Error(`Unsupported SCHEMA_RECONCILE_MODE: ${mode}`);
  }
  await writeSchemaReconcileReceipt(parseOutputPath(process.argv.slice(2)), receipt);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
