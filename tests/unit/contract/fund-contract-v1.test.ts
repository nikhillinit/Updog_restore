/**
 * Contract tests for FundCreateV1 and FundDraftWriteV1 schemas
 *
 * Phase 1A: validates schema acceptance/rejection rules.
 * These tests must pass alongside Phase 0B snapshot tests.
 */

import { describe, it, expect } from 'vitest';
import { FundCreateV1Schema } from '@shared/contracts/fund-create-v1.contract';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import { FundErrorV1Schema } from '@shared/contracts/fund-error-v1.contract';
import {
  validCreatePayload,
  validCreatePayloadWithEngine,
  invalidCreatePayloads,
  validDraftPayload,
  minimalDraftPayload,
  warningFieldsBlankDraft,
  invalidDraftPayloads,
} from '../../../tests/fixtures/fund-contract-v1-fixtures';

// ---------------------------------------------------------------------------
// FundCreateV1Schema
// ---------------------------------------------------------------------------

describe('FundCreateV1Schema', () => {
  it('accepts a valid create payload', () => {
    const result = FundCreateV1Schema.safeParse(validCreatePayload);
    expect(result.success).toBe(true);
  });

  it('accepts a valid payload with engine results', () => {
    const result = FundCreateV1Schema.safeParse(validCreatePayloadWithEngine);
    expect(result.success).toBe(true);
  });

  it('accepts size=0 (provisional, user did not enter a value)', () => {
    const result = FundCreateV1Schema.safeParse({ ...validCreatePayload, size: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.size).toBe(0);
    }
  });

  it('applies defaults for managementFee, carryPercentage, vintageYear', () => {
    const result = FundCreateV1Schema.safeParse({ name: 'Test', size: 1_000_000 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.managementFee).toBe(0.02);
      expect(result.data.carryPercentage).toBe(0.2);
      expect(result.data.vintageYear).toBeGreaterThanOrEqual(2020);
    }
  });

  it('rejects missing name', () => {
    const result = FundCreateV1Schema.safeParse(invalidCreatePayloads.missingName);
    expect(result.success).toBe(false);
  });

  it('rejects negative size', () => {
    const result = FundCreateV1Schema.safeParse(invalidCreatePayloads.negativeSize);
    expect(result.success).toBe(false);
  });

  it('rejects oversized management fee (> 0.1)', () => {
    const result = FundCreateV1Schema.safeParse(invalidCreatePayloads.oversizedFee);
    expect(result.success).toBe(false);
  });

  it('rejects oversized carry (> 0.5)', () => {
    const result = FundCreateV1Schema.safeParse(invalidCreatePayloads.oversizedCarry);
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (.strict())', () => {
    const result = FundCreateV1Schema.safeParse(invalidCreatePayloads.unknownKey);
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = FundCreateV1Schema.safeParse(invalidCreatePayloads.emptyName);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FundDraftWriteV1Schema
// ---------------------------------------------------------------------------

describe('FundDraftWriteV1Schema', () => {
  it('accepts a full draft payload', () => {
    const result = FundDraftWriteV1Schema.safeParse(validDraftPayload);
    expect(result.success).toBe(true);
  });

  it('accepts minimal payload (fundName only)', () => {
    const result = FundDraftWriteV1Schema.safeParse(minimalDraftPayload);
    expect(result.success).toBe(true);
  });

  it('allows draft omission but validates an owner-authored model inputs date when present', () => {
    expect(FundDraftWriteV1Schema.safeParse(minimalDraftPayload).success).toBe(true);
    expect(
      FundDraftWriteV1Schema.safeParse({
        ...minimalDraftPayload,
        modelInputsAsOfDate: '2026-06-30',
      }).success
    ).toBe(true);
    expect(
      FundDraftWriteV1Schema.safeParse({
        ...minimalDraftPayload,
        modelInputsAsOfDate: '2026-06-31',
      }).success
    ).toBe(false);
  });

  it('accepts warning-fields-blank payload', () => {
    const result = FundDraftWriteV1Schema.safeParse(warningFieldsBlankDraft);
    expect(result.success).toBe(true);
  });

  it('accepts payload with target metrics block', () => {
    const payload = {
      ...validDraftPayload,
      targetMetrics: {
        targetIRR: 0.3,
        targetTVPI: 3.0,
        targetCompanyCount: 30,
      },
    };
    const result = FundDraftWriteV1Schema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects missing fundName', () => {
    const result = FundDraftWriteV1Schema.safeParse(invalidDraftPayloads.missingFundName);
    expect(result.success).toBe(false);
  });

  it('rejects empty fundName', () => {
    const result = FundDraftWriteV1Schema.safeParse(invalidDraftPayloads.emptyFundName);
    expect(result.success).toBe(false);
  });

  it('rejects negative fundSize', () => {
    const result = FundDraftWriteV1Schema.safeParse({
      fundName: 'Bad Size Fund',
      fundSize: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects nonpositive fundLife and investmentPeriod', () => {
    const result = FundDraftWriteV1Schema.safeParse({
      fundName: 'Bad Period Fund',
      fundLife: 0,
      investmentPeriod: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (.strict())', () => {
    const result = FundDraftWriteV1Schema.safeParse(invalidDraftPayloads.unknownKey);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate IDs in stages', () => {
    const result = FundDraftWriteV1Schema.safeParse(invalidDraftPayloads.duplicateStageIds);
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys in nested sub-objects (deep strict)', () => {
    const payload = {
      fundName: 'Test',
      stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18, bogus: true }],
    };
    const result = FundDraftWriteV1Schema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('preserves all fields through parse round-trip', () => {
    const result = FundDraftWriteV1Schema.safeParse(validDraftPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fundName).toBe(validDraftPayload.fundName);
      expect(result.data.targetMetrics).toEqual(validDraftPayload.targetMetrics);
      expect(result.data.stages).toHaveLength(2);
      expect(result.data.waterfallTiers).toHaveLength(2);
      expect(result.data.feeProfiles).toHaveLength(1);
      expect(result.data.fundExpenses).toHaveLength(2);
      expect(result.data.recyclingEnabled).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// FundErrorV1Schema
// ---------------------------------------------------------------------------

describe('FundErrorV1Schema', () => {
  it('accepts error with issues', () => {
    const result = FundErrorV1Schema.safeParse({
      error: 'Validation failed',
      code: 'DRAFT_VALIDATION_ERROR',
      issues: [{ path: ['fundName'], message: 'Required' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts error without issues', () => {
    const result = FundErrorV1Schema.safeParse({
      error: 'Not found',
      code: 'NOT_FOUND',
    });
    expect(result.success).toBe(true);
  });

  it('accepts numeric path segments', () => {
    const result = FundErrorV1Schema.safeParse({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      issues: [{ path: ['stages', 0, 'name'], message: 'Required' }],
    });
    expect(result.success).toBe(true);
  });
});
