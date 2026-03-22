/**
 * Contract shape tests for FundStateReadV1Schema.
 *
 * Validates strict parsing, unknown key rejection, enum validation,
 * nullable fields, and array fields.
 */

import { describe, it, expect } from 'vitest';
import {
  FundStateReadV1Schema,
  CalculationStatusSchema,
} from '@shared/contracts/fund-state-read-v1.contract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validShape() {
  return {
    fundId: 1,
    configState: {
      latestVersion: 2,
      draftVersion: 2,
      publishedVersion: 1,
      hasDraft: true,
      hasPublished: true,
      publishedAt: '2026-03-20T12:00:00.000Z',
      draftUpdatedAt: '2026-03-20T13:00:00.000Z',
      publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
    },
    calculationState: {
      status: 'ready',
      configVersion: 1,
      runId: 10,
      correlationId: 'abc-123',
      dispatchState: 'dispatched',
      availableSnapshotTypes: ['RESERVE', 'PACING'],
      expectedSnapshotTypes: ['RESERVE', 'PACING'],
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      lastError: null,
      legacyEvidence: false,
    },
    legacy: {
      engineResultsPresent: false,
    },
  };
}

describe('FundStateReadV1Schema', () => {
  // 1. Valid shape parses OK
  it('parses a valid shape successfully', () => {
    const result = FundStateReadV1Schema.safeParse(validShape());
    expect(result.success).toBe(true);
  });

  // 2. Rejects unknown top-level keys
  it('rejects unknown top-level keys', () => {
    const result = FundStateReadV1Schema.safeParse({
      ...validShape(),
      bogusField: 'should fail',
    });
    expect(result.success).toBe(false);
  });

  // 3. Rejects unknown keys in configState/calculationState
  it('rejects unknown keys in nested objects', () => {
    const shape = validShape();
    const withExtraConfig = {
      ...shape,
      configState: { ...shape.configState, extraKey: true },
    };
    expect(FundStateReadV1Schema.safeParse(withExtraConfig).success).toBe(false);

    const withExtraCalc = {
      ...shape,
      calculationState: { ...shape.calculationState, extraKey: true },
    };
    expect(FundStateReadV1Schema.safeParse(withExtraCalc).success).toBe(false);
  });

  // 4. Rejects invalid status enum
  it('rejects invalid calculation status values', () => {
    expect(CalculationStatusSchema.safeParse('ready').success).toBe(true);
    expect(CalculationStatusSchema.safeParse('not_requested').success).toBe(true);
    expect(CalculationStatusSchema.safeParse('invalid_status').success).toBe(false);
    expect(CalculationStatusSchema.safeParse(42).success).toBe(false);
  });

  // 5. Nullable fields accept null
  it('accepts null for nullable fields', () => {
    const shape = validShape();
    shape.configState.latestVersion = null;
    shape.configState.draftVersion = null;
    shape.configState.publishedVersion = null;
    shape.configState.publishedAt = null;
    shape.configState.draftUpdatedAt = null;
    shape.configState.publishedUpdatedAt = null;
    shape.calculationState.configVersion = null;
    shape.calculationState.runId = null;
    shape.calculationState.correlationId = null;
    shape.calculationState.dispatchState = null;
    shape.calculationState.lastCalculatedAt = null;
    shape.calculationState.lastError = null;

    const result = FundStateReadV1Schema.safeParse(shape);
    expect(result.success).toBe(true);
  });

  // 6. Array fields accept string arrays
  it('accepts string arrays for snapshot type fields', () => {
    const shape = validShape();
    shape.calculationState.availableSnapshotTypes = ['RESERVE', 'PACING', 'COHORT'];
    shape.calculationState.expectedSnapshotTypes = ['RESERVE'];

    const result = FundStateReadV1Schema.safeParse(shape);
    expect(result.success).toBe(true);
  });
});
