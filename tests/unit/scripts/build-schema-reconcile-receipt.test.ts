import { readFile, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildSchemaReconcileCatchupReceipt,
  buildSchemaReconcileReceipt,
  parseCatchupPreDecisions,
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

describe('build-schema-reconcile-receipt catch-up mode', () => {
  const auditLine = (name: string, action: string) =>
    `${name}: ${action} (missingTablePolicy=create_or_repair)`;
  const freshReport = [
    auditLine('M1-cohort', 'SKIP'),
    auditLine('g3-portfolio-and-calculation', 'APPLY-MISSING-DDL'),
    auditLine('g3-canary', 'APPLY-MISSING-DDL'),
    auditLine('g3-capital-call-notification-outbox', 'APPLY-MISSING-DDL'),
    auditLine('g3-release-gate-hardening', 'APPLY-MISSING-DDL'),
  ].join('\n');

  const catchupInput = {
    repository: 'press-on/updog',
    workflowPath: '.github/workflows/prod-schema-reconcile.yml' as const,
    runId: '123456789',
    runAttempt: 1,
    sourceSha: 'b'.repeat(40),
    startedAtMs: 1000,
    completedAtMs: 1250,
  };

  it('parses per-target pre-decisions from the pre-apply audit report', () => {
    const targets = parseCatchupPreDecisions(freshReport);
    expect(targets.map((target) => target.migration)).toEqual(['0050', '0051', '0052', '0053']);
    expect(targets.every((target) => target.preDecision === 'APPLY-MISSING-DDL')).toBe(true);

    const resumeReport = freshReport.replace(
      auditLine('g3-portfolio-and-calculation', 'APPLY-MISSING-DDL'),
      auditLine('g3-portfolio-and-calculation', 'SKIP')
    );
    const resumeTargets = parseCatchupPreDecisions(resumeReport);
    expect(resumeTargets[0]?.preDecision).toBe('SKIP');
    expect(resumeTargets[3]?.preDecision).toBe('APPLY-MISSING-DDL');

    expect(() => parseCatchupPreDecisions(auditLine('g3-canary', 'APPLY-MISSING-DDL'))).toThrow(
      /exactly one decision/
    );
  });

  it('builds a catch-up receipt carrying all four target identities', () => {
    const receipt = buildSchemaReconcileCatchupReceipt({
      ...catchupInput,
      targets: parseCatchupPreDecisions(freshReport),
    });
    expect(receipt.mode).toBe('apply-catchup-0050-0053');
    expect(receipt.targets).toHaveLength(4);
    expect(receipt.result).toBe('applied_and_clean');
  });

  it('rejects an all-SKIP catch-up receipt and non-attempt-one runs', () => {
    const allSkipReport = freshReport.replaceAll('APPLY-MISSING-DDL', 'SKIP');
    expect(() =>
      buildSchemaReconcileCatchupReceipt({
        ...catchupInput,
        targets: parseCatchupPreDecisions(allSkipReport),
      })
    ).toThrow(/at least one applied target/);
    expect(() =>
      buildSchemaReconcileCatchupReceipt({
        ...catchupInput,
        runAttempt: 2,
        targets: parseCatchupPreDecisions(freshReport),
      })
    ).toThrow(/attempt 1/);
  });
});
