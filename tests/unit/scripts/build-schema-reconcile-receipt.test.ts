import { readFile, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildSchemaReconcileReceipt,
  writeSchemaReconcileReceipt,
} from '../../../scripts/release/build-schema-reconcile-receipt';

const input = {
  repository: 'press-on/updog',
  workflowPath: '.github/workflows/prod-schema-reconcile.yml' as const,
  runId: '123456789',
  runAttempt: 1,
  mode: 'apply' as const,
  sourceSha: 'b'.repeat(40),
  manifest: '30-g3-release-gate-hardening' as const,
  migration: '0053' as const,
  preDecision: 'APPLY-MISSING-DDL' as const,
  postDecision: 'SKIP' as const,
  startedAtMs: 1000,
  completedAtMs: 1250,
};

describe('build-schema-reconcile-receipt', { retry: 0 }, () => {
  it('builds the strict receipt and reports only bounded evidence', () => {
    expect(buildSchemaReconcileReceipt(input)).toEqual({
      repository: 'press-on/updog',
      workflowPath: '.github/workflows/prod-schema-reconcile.yml',
      runId: '123456789',
      runAttempt: 1,
      mode: 'apply',
      sourceSha: 'b'.repeat(40),
      manifest: '30-g3-release-gate-hardening',
      migration: '0053',
      preDecision: 'APPLY-MISSING-DDL',
      postDecision: 'SKIP',
      buildTimeMs: 250,
      result: 'applied_and_clean',
    });
  });

  it('writes receipt privately and atomically', async () => {
    const outputPath = path.join(
      os.tmpdir(),
      `schema-reconcile-receipt-${process.pid}-${Date.now()}.json`
    );
    try {
      const receipt = buildSchemaReconcileReceipt(input);
      await writeSchemaReconcileReceipt(outputPath, receipt);
      expect(JSON.parse(await readFile(outputPath, 'utf8'))).toEqual(receipt);
      expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    } finally {
      await unlink(outputPath).catch(() => undefined);
    }
  });

  it('rejects a backward clock and non-attempt-one apply', () => {
    expect(() =>
      buildSchemaReconcileReceipt({ ...input, completedAtMs: 999 })
    ).toThrow(/completedAtMs/);
    expect(() =>
      buildSchemaReconcileReceipt({ ...input, runAttempt: 2 })
    ).toThrow(/attempt 1/);
  });
});
