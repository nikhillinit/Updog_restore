import { describe, expect, it } from 'vitest';

import {
  CURRENT_FORECAST_MIGRATION_RANGE,
  SchemaReconcileCurrentForecastReceiptV1Schema,
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
