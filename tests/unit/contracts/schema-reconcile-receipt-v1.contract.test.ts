// Default import on purpose: node-setup.ts vi.mock('fs') stubs named exports.
import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CURRENT_FORECAST_MIGRATION_RANGE,
  JOURNALED_RANGE_MIGRATION_RANGE,
  SchemaReconcileCurrentForecastReceiptV1Schema,
  SchemaReconcileJournaledRangeReceiptV1Schema,
  SchemaReconcileReceiptV1Schema,
} from '@shared/contracts/schema-reconcile-receipt-v1.contract';

const validReceipt = {
  repository: 'press-on/updog',
  workflowPath: '.github/workflows/prod-schema-reconcile.yml',
  runId: '123456789',
  runAttempt: 1,
  mode: 'apply',
  sourceSha: 'a'.repeat(40),
  manifest: '30-g3-release-gate-hardening',
  migration: '0053',
  preDecision: 'APPLY-MISSING-DDL',
  postDecision: 'SKIP',
  buildTimeMs: 42,
  result: 'applied_and_clean',
} as const;

describe('schema-reconcile-receipt-v1 contract', { retry: 0 }, () => {
  it('accepts only successful attempt-one apply receipts with bounded fields', () => {
    expect(SchemaReconcileReceiptV1Schema.parse(validReceipt)).toEqual(validReceipt);
  });

  it('rejects unknown fields, secrets, database identifiers, and future artifact metadata', () => {
    expect(
      SchemaReconcileReceiptV1Schema.safeParse({
        ...validReceipt,
        databaseUrl: 'postgresql://user:password@example.invalid/db',
        artifactId: '123',
        token: 'secret',
      }).success
    ).toBe(false);
  });

  it('rejects rerun attempts and non-clean decisions', () => {
    expect(
      SchemaReconcileReceiptV1Schema.safeParse({ ...validReceipt, runAttempt: 2 }).success
    ).toBe(false);
    expect(
      SchemaReconcileReceiptV1Schema.safeParse({
        ...validReceipt,
        postDecision: 'APPLY-MISSING-DDL',
      }).success
    ).toBe(false);
  });
});

describe('Current Forecast schema reconcile receipt', { retry: 0 }, () => {
  it('accepts only attempt-one complete bounded-range evidence', () => {
    const receipt = {
      repository: 'press-on/updog',
      workflowPath: '.github/workflows/prod-schema-reconcile.yml',
      runId: '123',
      runAttempt: 1,
      mode: 'apply-current-forecast-0050-0055',
      sourceSha: 'a'.repeat(40),
      migrationRange: CURRENT_FORECAST_MIGRATION_RANGE,
      preState: {
        state: 'ready',
        appliedTargetCount: 4,
        lastAppliedTag: CURRENT_FORECAST_MIGRATION_RANGE[3],
      },
      postState: 'complete',
      applied: true,
      buildTimeMs: 10,
      result: 'applied_and_clean',
    } as const;
    expect(SchemaReconcileCurrentForecastReceiptV1Schema.parse(receipt)).toEqual(receipt);
    expect(
      SchemaReconcileCurrentForecastReceiptV1Schema.safeParse({ ...receipt, runAttempt: 2 }).success
    ).toBe(false);
    expect(
      SchemaReconcileCurrentForecastReceiptV1Schema.safeParse({ ...receipt, applied: false })
        .success
    ).toBe(false);
  });
});

describe('Journaled 0050-0061 schema reconcile receipt', { retry: 0 }, () => {
  const receipt = {
    repository: 'press-on/updog',
    workflowPath: '.github/workflows/prod-schema-reconcile.yml',
    runId: '123',
    runAttempt: 1,
    mode: 'apply-journaled-0050-0061',
    sourceSha: 'a'.repeat(40),
    migrationRange: JOURNALED_RANGE_MIGRATION_RANGE,
    preState: {
      state: 'ready',
      appliedTargetCount: 0,
      lastAppliedTag: '0049_kpi_observations',
    },
    postState: 'complete',
    applied: true,
    baselineKind: 'canonical',
    backfillEligibleBefore: null,
    backfillEligibleAfter: 0,
    buildTimeMs: 10,
    result: 'applied_and_clean',
  } as const;

  it('pins journaled range to journal indexes 51 through 62', () => {
    const journal = JSON.parse(fs.readFileSync('migrations/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    expect(JOURNALED_RANGE_MIGRATION_RANGE).toEqual(
      journal.entries.filter(({ idx }) => idx >= 51 && idx <= 62).map(({ tag }) => tag)
    );
  });

  it.each([
    { baselineKind: 'canonical' as const, before: null, after: 0 },
    { baselineKind: 'adr074-reconciled' as const, before: 0, after: 0 },
  ])(
    'accepts fresh canonical or production baseline shape %#',
    ({ baselineKind, before, after }) => {
      expect(
        SchemaReconcileJournaledRangeReceiptV1Schema.parse({
          ...receipt,
          baselineKind,
          backfillEligibleBefore: before,
          backfillEligibleAfter: after,
        })
      ).toBeTruthy();
    }
  );

  it('accepts a tail 0055 apply and a complete replay', () => {
    expect(
      SchemaReconcileJournaledRangeReceiptV1Schema.parse({
        ...receipt,
        preState: {
          state: 'ready',
          appliedTargetCount: 6,
          lastAppliedTag: JOURNALED_RANGE_MIGRATION_RANGE[5],
        },
        backfillEligibleBefore: null,
        backfillEligibleAfter: null,
      })
    ).toBeTruthy();
    expect(
      SchemaReconcileJournaledRangeReceiptV1Schema.parse({
        ...receipt,
        preState: {
          state: 'complete',
          appliedTargetCount: 12,
          lastAppliedTag: JOURNALED_RANGE_MIGRATION_RANGE[11],
        },
        applied: false,
        backfillEligibleBefore: null,
        backfillEligibleAfter: null,
      })
    ).toBeTruthy();
  });

  it.each([
    {
      name: 'requires an after backfill count when 0053 is applied',
      change: { backfillEligibleAfter: null },
    },
    {
      name: 'requires null backfill counts when 0053 is already ledgered',
      change: {
        preState: {
          state: 'ready',
          appliedTargetCount: 4,
          lastAppliedTag: JOURNALED_RANGE_MIGRATION_RANGE[3],
        },
        backfillEligibleBefore: 0,
        backfillEligibleAfter: null,
      },
    },
    {
      name: 'rejects non-null after count on complete state',
      change: {
        preState: {
          state: 'complete',
          appliedTargetCount: 12,
          lastAppliedTag: JOURNALED_RANGE_MIGRATION_RANGE[11],
        },
        applied: false,
        backfillEligibleBefore: null,
        backfillEligibleAfter: 0,
      },
    },
    {
      name: 'rejects last tag mismatch',
      change: {
        preState: { ...receipt.preState, lastAppliedTag: JOURNALED_RANGE_MIGRATION_RANGE[0] },
      },
    },
    {
      name: 'rejects incomplete complete state',
      change: {
        preState: {
          state: 'complete',
          appliedTargetCount: 11,
          lastAppliedTag: JOURNALED_RANGE_MIGRATION_RANGE[10],
        },
      },
    },
    {
      name: 'rejects ready complete count',
      change: {
        preState: {
          state: 'ready',
          appliedTargetCount: 12,
          lastAppliedTag: JOURNALED_RANGE_MIGRATION_RANGE[11],
        },
      },
    },
    { name: 'rejects applied flag disagreement', change: { applied: false } },
    { name: 'rejects non-complete post state', change: { postState: 'ready' } },
    { name: 'rejects rerun attempt', change: { runAttempt: 2 } },
    { name: 'rejects wrong mode', change: { mode: 'apply-current-forecast-0050-0055' } },
    { name: 'rejects extra key', change: { extra: true } },
    { name: 'rejects target fingerprint', change: { targetFingerprint: 'b'.repeat(64) } },
    {
      name: 'rejects eleven-tag migration range',
      change: { migrationRange: JOURNALED_RANGE_MIGRATION_RANGE.slice(0, 11) },
    },
  ])('$name', ({ change }) => {
    expect(
      SchemaReconcileJournaledRangeReceiptV1Schema.safeParse({ ...receipt, ...change }).success
    ).toBe(false);
  });
});
