import { describe, expect, it } from 'vitest';
import {
  RoundsToModelEvidenceSchema,
  serializeRoundsToModelEvidence,
} from '../../../shared/contracts/rounds-to-model-evidence.contract';

const provenance = {
  trustState: 'LIVE',
  core: {
    sourceKind: 'computed',
    actionability: 'actionable',
    sourceEngine: 'rounds-to-model',
    engineVersion: 'rounds-to-model-v1',
    inputHash: 'input-hash',
    assumptionsHash: 'assumptions-hash',
    generatedAt: '2026-06-24T00:00:00.000Z',
    isFinanciallyActionable: true,
    warnings: [],
  },
  structuredWarnings: [],
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
      followOnAmount: '125000.000000',
      amountOnlyNonEquityAmount: '0.000000',
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
          role: 'follow_on',
          currency: 'USD',
          investmentAmount: '125000.000000',
          amountOnly: true,
          overrideApplied: false,
        },
      ],
      warnings: [],
    },
  ],
  coverage: {
    companyCount: 1,
    investmentCount: 1,
    activeRoundCount: 2,
    activeOverrideCount: 0,
    warningsByCode: {},
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
