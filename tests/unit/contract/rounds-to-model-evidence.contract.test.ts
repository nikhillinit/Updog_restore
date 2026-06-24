import { describe, expect, it } from 'vitest';
import {
  RoundsToModelEvidenceSchema,
  serializeRoundsToModelEvidence,
} from '../../../shared/contracts/rounds-to-model-evidence.contract';

const provenance = {
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
    warnings: [],
  },
  structuredWarnings: [
    {
      code: 'NON_EQUITY_AMOUNT_ONLY',
      severity: 'warning',
      message: 'Round 2 is safe and contributes amount-only evidence.',
      source: 'round:2',
    },
  ],
};

const validEvidence = {
  fundId: 10,
  baseCurrency: 'USD',
  generatedAt: '2026-06-24T00:00:00.000Z',
  companies: [
    {
      companyId: 101,
      companyName: 'Acme',
      investmentIds: [201],
      initialAmount: '500000.000000',
      followOnAmount: '0.000000',
      amountOnlyNonEquityAmount: '125000.000000',
      roundCount: 2,
      rounds: [
        {
          roundId: 1,
          investmentId: 201,
          companyId: 101,
          roundDate: '2024-01-15',
          securityType: 'equity',
          role: 'initial',
          currency: 'USD',
          investmentAmount: '500000.000000',
          amountOnly: false,
          overrideApplied: false,
        },
        {
          roundId: 2,
          investmentId: 201,
          companyId: 101,
          roundDate: '2025-02-01',
          securityType: 'safe',
          role: 'amount_only',
          currency: 'USD',
          investmentAmount: '125000.000000',
          amountOnly: true,
          overrideApplied: false,
        },
      ],
      warnings: [
        {
          code: 'NON_EQUITY_AMOUNT_ONLY',
          severity: 'warning',
          message: 'Round 2 is safe and contributes amount-only evidence.',
          source: 'round:2',
        },
      ],
    },
  ],
  coverage: {
    companyCount: 1,
    investmentCount: 1,
    activeRoundCount: 2,
    activeOverrideCount: 0,
    warningsByCode: { NON_EQUITY_AMOUNT_ONLY: 1 },
  },
  provenance,
};

describe('RoundsToModelEvidenceSchema', () => {
  it('accepts strict evidence with decimal strings and provenance', () => {
    expect(RoundsToModelEvidenceSchema.parse(validEvidence)).toEqual(validEvidence);
  });

  it('rejects numeric money fields', () => {
    const result = RoundsToModelEvidenceSchema.safeParse({
      ...validEvidence,
      companies: [{ ...validEvidence.companies[0], initialAmount: 500000 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects shadow and candidate leaks at serialization boundary', () => {
    expect(() =>
      serializeRoundsToModelEvidence({
        ...validEvidence,
        shadowDiff: {},
        candidateResponse: {},
        exportEligibility: { enabled: true },
      })
    ).toThrow();
  });

  it('requires warningsByCode keys to be warning codes', () => {
    const result = RoundsToModelEvidenceSchema.safeParse({
      ...validEvidence,
      coverage: {
        ...validEvidence.coverage,
        warningsByCode: {
          NOT_A_WARNING: 1,
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
