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

export function parseCatchupPreDecisions(
  preApplyAuditReport: string
): SchemaReconcileCatchupReceiptV1['targets'] {
  return SCHEMA_RECONCILE_CATCHUP_TARGET_IDENTITIES.map((identity) => {
    const pattern = new RegExp(
      `^${identity.auditName.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (SKIP|APPLY-MISSING-DDL) \\(missingTablePolicy=[^)]+\\)$`,
      'gm'
    );
    const matches = [...preApplyAuditReport.matchAll(pattern)];
    if (matches.length !== 1) {
      throw new Error(
        `Pre-apply audit must contain exactly one decision for ${identity.auditName}`
      );
    }
    return {
      manifest: identity.manifest,
      migration: identity.migration,
      preDecision: matches[0]![1] as 'SKIP' | 'APPLY-MISSING-DDL',
      postDecision: 'SKIP' as const,
    };
  }) as unknown as SchemaReconcileCatchupReceiptV1['targets'];
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
  const mode = (process.env['SCHEMA_RECONCILE_MODE'] ?? 'apply').trim();
  let receipt: SchemaReconcileReceiptV1 | SchemaReconcileCatchupReceiptV1;
  if (mode === 'apply-catchup-0050-0053') {
    const preApplyAuditReport = await readFile(
      process.env['SCHEMA_RECONCILE_PRE_AUDIT_PATH'] ?? 'reports/pre-apply-audit.txt',
      'utf8'
    );
    receipt = buildSchemaReconcileCatchupReceipt({
      repository: requiredEnvironment('GITHUB_REPOSITORY'),
      workflowPath: '.github/workflows/prod-schema-reconcile.yml',
      runId: requiredEnvironment('GITHUB_RUN_ID'),
      runAttempt: requiredPositiveIntegerEnvironment('GITHUB_RUN_ATTEMPT'),
      sourceSha: requiredEnvironment('SCHEMA_RECONCILE_SOURCE_SHA'),
      targets: parseCatchupPreDecisions(preApplyAuditReport),
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
