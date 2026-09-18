import { readFile, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildSchemaReconcileActualsDraftReceipt,
  buildSchemaReconcileActualsRestatementReceipt,
  buildSchemaReconcileCatchupReceipt,
  buildSchemaReconcileCurrentForecastReceipt,
  buildSchemaReconcileReceipt,
  targetsFromLockTimeVector,
  writeSchemaReconcileReceipt,
} from '../../../scripts/release/build-schema-reconcile-receipt';
import {
  ActualsDraftMigrationResultV1Schema,
  ActualsRestatementMigrationResultV1Schema,
} from '../../../shared/contracts/schema-reconcile-receipt-v1.contract';

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
    expect(() => buildSchemaReconcileReceipt({ ...input, completedAtMs: 999 })).toThrow(
      /completedAtMs/
    );
    expect(() => buildSchemaReconcileReceipt({ ...input, runAttempt: 2 })).toThrow(/attempt 1/);
  });
});

describe('build-schema-reconcile-receipt Current Forecast mode', () => {
  it('builds exact 0050-0055 range receipt', () => {
    const receipt = buildSchemaReconcileCurrentForecastReceipt({
      repository: 'press-on/updog',
      runId: '123',
      runAttempt: 1,
      sourceSha: 'a'.repeat(40),
      preState: {
        state: 'ready',
        appliedTargetCount: 4,
        lastAppliedTag: '0053_g3_release_gate_hardening',
      },
      applied: true,
      startedAtMs: 100,
      completedAtMs: 150,
    });
    expect(receipt.mode).toBe('apply-current-forecast-0050-0055');
    expect(receipt.migrationRange).toHaveLength(6);
    expect(receipt.postState).toBe('complete');
  });
});

describe('build-schema-reconcile-receipt actuals draft mode', () => {
  const ready = {
    migration: {
      tag: '0056_actuals_draft_revisions',
      idx: 57,
      when: 1788825600000,
      hash: '94fd8537ee7afbee9f0d5b19bfa9cfd78263096c89ee4ef0ae015ad268ed04cf',
    },
    targetFingerprint: 'd'.repeat(64),
    preState: {
      baselineKind: 'canonical',
      state: 'ready',
      appliedTargetCount: 0,
      lastAppliedTag: '0055_current_forecast_recompute_commands',
    },
    postState: 'ready',
    applied: false,
  };
  const input = {
    repository: 'press-on/updog',
    runId: '123',
    runAttempt: 1 as const,
    sourceSha: 'a'.repeat(40),
    startedAtMs: 100,
    completedAtMs: 150,
  };

  it('admits a dry-run result but cannot label it a completed apply receipt', () => {
    expect(ActualsDraftMigrationResultV1Schema.safeParse(ready).success).toBe(true);
    expect(() => buildSchemaReconcileActualsDraftReceipt({ ...input, result: ready })).toThrow();
  });

  it.each(['canonical', 'adr074-reconciled'])(
    'builds exact apply and replay receipts for %s history',
    (baselineKind) => {
      const applied = buildSchemaReconcileActualsDraftReceipt({
        ...input,
        result: {
          ...ready,
          preState: { ...ready.preState, baselineKind },
          postState: 'complete',
          applied: true,
        },
      });
      expect(applied.mode).toBe('apply-actuals-draft-0056');
      expect(applied.migration).toEqual(ready.migration);
      const replay = buildSchemaReconcileActualsDraftReceipt({
        ...input,
        result: {
          ...ready,
          preState: {
            baselineKind,
            state: 'complete',
            appliedTargetCount: 1,
            lastAppliedTag: '0056_actuals_draft_revisions',
          },
          postState: 'complete',
        },
      });
      expect(replay.applied).toBe(false);
    }
  );

  it.each([
    { migration: { ...ready.migration, hash: 'e'.repeat(64) } },
    { migration: { ...ready.migration, idx: 58 } },
    { targetFingerprint: '' },
    { preState: { ...ready.preState, appliedTargetCount: 1 } },
    { preState: { ...ready.preState, lastAppliedTag: '0056_actuals_draft_revisions' } },
    { preState: { ...ready.preState, baselineKind: 'unknown' } },
    { postState: 'complete' },
    { applied: true },
    { extra: 'unrecognized' },
  ])('rejects malformed or contradictory migration evidence %#', (change) => {
    expect(ActualsDraftMigrationResultV1Schema.safeParse({ ...ready, ...change }).success).toBe(
      false
    );
  });
});

describe('build-schema-reconcile-receipt actuals restatement mode', () => {
  const ready = {
    migration: {
      tag: '0057_actuals_restatement_commands',
      idx: 58,
      when: 1788912000000,
      hash: '3f424f67d5a7fe87c6e8eeb2b25d129c0278aa18596c6a3bf9b5ef91df46d577',
    },
    targetFingerprint: 'd'.repeat(64),
    preState: {
      baselineKind: 'canonical',
      state: 'ready',
      appliedTargetCount: 0,
      lastAppliedTag: '0056_actuals_draft_revisions',
    },
    postState: 'ready',
    applied: false,
  };
  const input = {
    repository: 'press-on/updog',
    runId: '123',
    runAttempt: 1 as const,
    sourceSha: 'a'.repeat(40),
    startedAtMs: 100,
    completedAtMs: 150,
  };

  it('admits a dry-run result but cannot label it a completed apply receipt', () => {
    expect(ActualsRestatementMigrationResultV1Schema.safeParse(ready).success).toBe(true);
    expect(() =>
      buildSchemaReconcileActualsRestatementReceipt({ ...input, result: ready })
    ).toThrow();
  });

  it.each(['canonical', 'adr074-reconciled'])(
    'builds exact apply and replay receipts for %s history',
    (baselineKind) => {
      const applied = buildSchemaReconcileActualsRestatementReceipt({
        ...input,
        result: {
          ...ready,
          preState: { ...ready.preState, baselineKind },
          postState: 'complete',
          applied: true,
        },
      });
      expect(applied.mode).toBe('apply-actuals-restatement-0057');
      expect(applied.migration).toEqual(ready.migration);
      const replay = buildSchemaReconcileActualsRestatementReceipt({
        ...input,
        result: {
          ...ready,
          preState: {
            baselineKind,
            state: 'complete',
            appliedTargetCount: 1,
            lastAppliedTag: '0057_actuals_restatement_commands',
          },
          postState: 'complete',
        },
      });
      expect(replay.applied).toBe(false);
    }
  );

  it.each([
    { migration: { ...ready.migration, hash: 'e'.repeat(64) } },
    { migration: { ...ready.migration, idx: 59 } },
    { targetFingerprint: '' },
    { preState: { ...ready.preState, appliedTargetCount: 1 } },
    { preState: { ...ready.preState, lastAppliedTag: '0057_actuals_restatement_commands' } },
    { preState: { ...ready.preState, baselineKind: 'unknown' } },
    { postState: 'complete' },
    { applied: true },
    { extra: 'unrecognized' },
  ])('rejects malformed or contradictory migration evidence %#', (change) => {
    expect(
      ActualsRestatementMigrationResultV1Schema.safeParse({ ...ready, ...change }).success
    ).toBe(false);
  });
});

describe('build-schema-reconcile-receipt catch-up mode', () => {
  const vectorFor = (actions: Record<string, string>) => ({
    schemaVersion: 1,
    source: 'lock-time-audit',
    decisions: [
      { manifest: 'M1-cohort', action: 'SKIP' },
      {
        manifest: 'g3-portfolio-and-calculation',
        action: actions['g3-portfolio-and-calculation'] ?? 'APPLY-MISSING-DDL',
      },
      { manifest: 'g3-canary', action: actions['g3-canary'] ?? 'APPLY-MISSING-DDL' },
      {
        manifest: 'g3-capital-call-notification-outbox',
        action: actions['g3-capital-call-notification-outbox'] ?? 'APPLY-MISSING-DDL',
      },
      {
        manifest: 'g3-release-gate-hardening',
        action: actions['g3-release-gate-hardening'] ?? 'APPLY-MISSING-DDL',
      },
    ],
  });

  const catchupInput = {
    repository: 'press-on/updog',
    workflowPath: '.github/workflows/prod-schema-reconcile.yml' as const,
    runId: '123456789',
    runAttempt: 1,
    sourceSha: 'b'.repeat(40),
    startedAtMs: 1000,
    completedAtMs: 1250,
  };

  it('derives per-target decisions from the lock-time apply vector', () => {
    const targets = targetsFromLockTimeVector(vectorFor({}));
    expect(targets.map((target) => target.migration)).toEqual(['0050', '0051', '0052', '0053']);
    expect(targets.every((target) => target.preDecision === 'APPLY-MISSING-DDL')).toBe(true);

    const resumeTargets = targetsFromLockTimeVector(
      vectorFor({ 'g3-portfolio-and-calculation': 'SKIP' })
    );
    expect(resumeTargets[0]?.preDecision).toBe('SKIP');
    expect(resumeTargets[3]?.preDecision).toBe('APPLY-MISSING-DDL');

    expect(() => targetsFromLockTimeVector({ decisions: [] })).toThrow(
      /exactly one SKIP\/APPLY decision/
    );
    expect(() => targetsFromLockTimeVector({})).toThrow(/decisions are missing/);
    expect(() => targetsFromLockTimeVector(vectorFor({ 'g3-canary': 'REFUSE-FOR-HUMAN' }))).toThrow(
      /exactly one SKIP\/APPLY decision/
    );
  });

  it('builds a catch-up receipt carrying all four target identities', () => {
    const receipt = buildSchemaReconcileCatchupReceipt({
      ...catchupInput,
      targets: targetsFromLockTimeVector(vectorFor({})),
    });
    expect(receipt.mode).toBe('apply-catchup-0050-0053');
    expect(receipt.targets).toHaveLength(4);
    expect(receipt.result).toBe('applied_and_clean');
  });

  it('rejects an all-SKIP catch-up receipt and non-attempt-one runs', () => {
    const allSkip = vectorFor({
      'g3-portfolio-and-calculation': 'SKIP',
      'g3-canary': 'SKIP',
      'g3-capital-call-notification-outbox': 'SKIP',
      'g3-release-gate-hardening': 'SKIP',
    });
    expect(() =>
      buildSchemaReconcileCatchupReceipt({
        ...catchupInput,
        targets: targetsFromLockTimeVector(allSkip),
      })
    ).toThrow(/at least one applied target/);
    expect(() =>
      buildSchemaReconcileCatchupReceipt({
        ...catchupInput,
        runAttempt: 2,
        targets: targetsFromLockTimeVector(vectorFor({})),
      })
    ).toThrow(/attempt 1/);
  });
});
