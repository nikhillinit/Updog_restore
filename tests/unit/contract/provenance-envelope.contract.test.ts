import { describe, expect, it } from 'vitest';
import {
  ProvenanceEnvelopeSchema,
  type ProvenanceEnvelope,
} from '../../../shared/contracts/provenance-envelope.contract';

const computedCore = {
  sourceKind: 'computed',
  actionability: 'actionable',
  sourceEngine: 'rounds-to-model',
  engineVersion: 'rounds-to-model-v1',
  inputHash: 'input-hash',
  assumptionsHash: 'assumptions-hash',
  generatedAt: '2026-06-24T00:00:00.000Z',
  isFinanciallyActionable: true,
  warnings: [] as string[],
} as const;

describe('ProvenanceEnvelopeSchema', () => {
  it('accepts hash-bound LIVE computed provenance', () => {
    const value: ProvenanceEnvelope = {
      trustState: 'LIVE',
      core: computedCore,
      structuredWarnings: [],
      sourceAsOf: '2026-06-24T00:00:00.000Z',
      staleAfterSeconds: 3600,
    };

    expect(ProvenanceEnvelopeSchema.parse(value)).toEqual(value);
  });

  it('accepts empty-fund LIVE provenance with hashes and EMPTY_FUND info warning', () => {
    const value = {
      trustState: 'LIVE',
      core: computedCore,
      structuredWarnings: [
        {
          code: 'EMPTY_FUND',
          severity: 'info',
          message: 'No active investment rounds were found for this fund.',
        },
      ],
    };

    expect(ProvenanceEnvelopeSchema.parse(value)).toEqual(value);
  });

  it('requires hash-bound PARTIAL computed provenance at the envelope layer', () => {
    const result = ProvenanceEnvelopeSchema.safeParse({
      trustState: 'PARTIAL',
      core: {
        sourceKind: 'computed',
        actionability: 'input_only',
        generatedAt: '2026-06-24T00:00:00.000Z',
        isFinanciallyActionable: false,
        warnings: [],
      },
      structuredWarnings: [
        {
          code: 'ROLE_CLASSIFICATION_AMBIGUOUS',
          severity: 'warning',
          message: 'Initial versus follow-on role could not be determined.',
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('core.inputHash');
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'core.assumptionsHash'
      );
    }
  });

  it('accepts hash-bound UNAVAILABLE currency block provenance', () => {
    const value = {
      trustState: 'UNAVAILABLE',
      core: {
        sourceKind: 'computed',
        actionability: 'quarantined',
        sourceEngine: 'rounds-to-model',
        engineVersion: 'rounds-to-model-v1',
        inputHash: 'input-hash',
        assumptionsHash: 'assumptions-hash',
        generatedAt: '2026-06-24T00:00:00.000Z',
        isFinanciallyActionable: false,
        quarantineReason: 'currency_mismatch',
        warnings: [],
      },
      structuredWarnings: [
        {
          code: 'CURRENCY_MISMATCH_BLOCK',
          severity: 'blocking',
          message: 'Round currency does not match fund base currency after overrides.',
        },
      ],
    };

    expect(ProvenanceEnvelopeSchema.parse(value)).toEqual(value);
  });

  it('accepts FAILED adapter provenance without dataset hashes', () => {
    const value = {
      trustState: 'FAILED',
      core: {
        sourceKind: 'prototype_blocked',
        actionability: 'non_actionable',
        generatedAt: '2026-06-24T00:00:00.000Z',
        isFinanciallyActionable: false,
        quarantineReason: 'round_adapter_failed',
        warnings: ['Rounds-to-model adapter failed before evidence could be emitted.'],
      },
      structuredWarnings: [
        {
          code: 'ROUND_ADAPTER_FAILED',
          severity: 'blocking',
          message: 'Rounds-to-model adapter failed before evidence could be emitted.',
        },
      ],
    };

    expect(ProvenanceEnvelopeSchema.parse(value)).toEqual(value);
  });

  it('keeps core warnings separate from structured warnings', () => {
    const value = {
      trustState: 'PARTIAL',
      core: {
        sourceKind: 'computed',
        actionability: 'input_only',
        sourceEngine: 'rounds-to-model',
        engineVersion: 'rounds-to-model-v1',
        inputHash: 'input-hash',
        assumptionsHash: 'assumptions-hash',
        generatedAt: '2026-06-24T00:00:00.000Z',
        isFinanciallyActionable: false,
        warnings: ['legacy string warning'],
      },
      structuredWarnings: [
        {
          code: 'NON_EQUITY_AMOUNT_ONLY',
          severity: 'warning',
          message: 'A non-equity round can only contribute amount evidence.',
        },
      ],
    };

    const parsed = ProvenanceEnvelopeSchema.parse(value);

    expect(parsed.core.warnings).toEqual(['legacy string warning']);
    expect(parsed.structuredWarnings[0]?.code).toBe('NON_EQUITY_AMOUNT_ONLY');
  });

  it('rejects shadow or candidate leak fields', () => {
    const result = ProvenanceEnvelopeSchema.safeParse({
      trustState: 'LIVE',
      core: computedCore,
      structuredWarnings: [],
      shadowDiff: {},
    });

    expect(result.success).toBe(false);
  });
});
