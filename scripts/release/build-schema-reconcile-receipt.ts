import { randomUUID } from 'node:crypto';
import { chmod, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SchemaReconcileReceiptV1Schema,
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
  receipt: SchemaReconcileReceiptV1
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
  const receipt = buildSchemaReconcileReceipt({
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
  await writeSchemaReconcileReceipt(parseOutputPath(process.argv.slice(2)), receipt);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
