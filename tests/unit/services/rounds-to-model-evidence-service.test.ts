import { describe, expect, it } from 'vitest';

import {
  buildRoundsToModelEvidenceFromRows,
  type RoundsEvidenceRows,
} from '../../../server/services/rounds-to-model-evidence-service';

const now = new Date('2026-06-24T00:00:00.000Z');

const baseRows: RoundsEvidenceRows = {
  fund: { id: 10, baseCurrency: 'USD' },
  companies: [{ id: 101, name: 'Acme' }],
  investments: [{ id: 201, fundId: 10, companyId: 101 }],
  activeRounds: [
    {
      id: 1,
      fundId: 10,
      investmentId: 201,
      roundDate: '2024-01-15',
      createdAt: new Date('2024-01-16T00:00:00.000Z'),
      securityType: 'equity',
      currency: 'USD',
      investmentAmount: '500000.000000',
    },
    {
      id: 2,
      fundId: 10,
      investmentId: 201,
      roundDate: '2025-02-01',
      createdAt: new Date('2025-02-02T00:00:00.000Z'),
      securityType: 'safe',
      currency: 'USD',
      investmentAmount: '125000.000000',
    },
  ],
  activeOverrides: [],
};

describe('buildRoundsToModelEvidenceFromRows', () => {
  it('aggregates all active rounds without latest-only collapse', () => {
    const evidence = buildRoundsToModelEvidenceFromRows({
      fundId: 10,
      now,
      rows: baseRows,
    });

    expect(evidence.companies).toHaveLength(1);
    expect(evidence.companies[0]?.roundCount).toBe(2);
    expect(evidence.companies[0]?.initialAmount).toBe('500000.000000');
    expect(evidence.companies[0]?.followOnAmount).toBe('0.000000');
    expect(evidence.coverage.activeRoundCount).toBe(2);
  });

  it('treats non-equity rounds as amount-only evidence', () => {
    const evidence = buildRoundsToModelEvidenceFromRows({
      fundId: 10,
      now,
      rows: baseRows,
    });

    const safeRound = evidence.companies[0]?.rounds.find((round) => round.securityType === 'safe');
    expect(safeRound?.amountOnly).toBe(true);
    expect(evidence.companies[0]?.amountOnlyNonEquityAmount).toBe('125000.000000');
    expect(evidence.companies[0]?.initialAmount).toBe('500000.000000');
    expect(evidence.companies[0]?.followOnAmount).toBe('0.000000');
    expect(evidence.coverage.warningsByCode.NON_EQUITY_AMOUNT_ONLY).toBe(1);
  });

  it.each(['initial', 'follow_on'] as const)(
    'keeps non-equity rounds amount-only when override role is %s',
    (overrideRole) => {
      const evidence = buildRoundsToModelEvidenceFromRows({
        fundId: 10,
        now,
        rows: {
          ...baseRows,
          activeOverrides: [
            {
              id: 10,
              fundId: 10,
              roundId: 2,
              overrideRole,
              supersedesOverrideId: null,
              createdAt: new Date('2025-02-03T00:00:00.000Z'),
            },
          ],
        },
      });

      const safeRound = evidence.companies[0]?.rounds.find((round) => round.roundId === 2);
      expect(safeRound?.role).toBe(overrideRole);
      expect(safeRound?.amountOnly).toBe(true);
      expect(safeRound?.overrideApplied).toBe(true);
      expect(evidence.companies[0]?.amountOnlyNonEquityAmount).toBe('125000.000000');
      expect(evidence.companies[0]?.initialAmount).toBe('500000.000000');
      expect(evidence.companies[0]?.followOnAmount).toBe('0.000000');
      expect(evidence.coverage.warningsByCode.NON_EQUITY_AMOUNT_ONLY).toBe(1);
      expect(evidence.coverage.warningsByCode.ROUND_MODEL_OVERRIDE_APPLIED).toBe(1);
    }
  );

  it('orders same-date equity rounds by created timestamp before assigning model roles', () => {
    const evidence = buildRoundsToModelEvidenceFromRows({
      fundId: 10,
      now,
      rows: {
        ...baseRows,
        activeRounds: [
          {
            id: 4,
            fundId: 10,
            investmentId: 201,
            roundDate: '2024-01-15',
            createdAt: new Date('2024-01-16T12:00:00.000Z'),
            securityType: 'equity',
            currency: 'USD',
            investmentAmount: '250000.000000',
          },
          {
            id: 3,
            fundId: 10,
            investmentId: 201,
            roundDate: '2024-01-15',
            createdAt: new Date('2024-01-16T00:00:00.000Z'),
            securityType: 'equity',
            currency: 'USD',
            investmentAmount: '500000.000000',
          },
        ],
      },
    });

    const rounds = evidence.companies[0]?.rounds;
    expect(rounds?.map((round) => [round.roundId, round.role])).toEqual([
      [3, 'initial'],
      [4, 'follow_on'],
    ]);
    expect(evidence.companies[0]?.initialAmount).toBe('500000.000000');
    expect(evidence.companies[0]?.followOnAmount).toBe('250000.000000');
  });

  it('blocks mismatched currency after override classification', () => {
    const evidence = buildRoundsToModelEvidenceFromRows({
      fundId: 10,
      now,
      rows: {
        ...baseRows,
        activeRounds: [
          {
            ...baseRows.activeRounds[0],
            currency: 'EUR',
          },
        ],
      },
    });

    expect(evidence.provenance.trustState).toBe('UNAVAILABLE');
    expect(evidence.provenance.core.quarantineReason).toBe('currency_mismatch');
  });

  it('fails closed on override lineage crossing fund-round boundaries', () => {
    expect(() =>
      buildRoundsToModelEvidenceFromRows({
        fundId: 10,
        now,
        rows: {
          ...baseRows,
          activeOverrides: [
            {
              id: 1,
              fundId: 10,
              roundId: 1,
              overrideRole: 'initial',
              supersedesOverrideId: null,
              createdAt: new Date('2024-01-16T00:00:00.000Z'),
            },
            {
              id: 2,
              fundId: 10,
              roundId: 2,
              overrideRole: 'follow_on',
              supersedesOverrideId: 1,
              createdAt: new Date('2024-01-17T00:00:00.000Z'),
            },
          ],
        },
      })
    ).toThrow('Override lineage crosses fund-round boundaries');
  });

  it('serializes through the strict evidence boundary', () => {
    const evidence = buildRoundsToModelEvidenceFromRows({
      fundId: 10,
      now,
      rows: baseRows,
    });

    expect(evidence).not.toHaveProperty('shadowDiff');
    expect(evidence).not.toHaveProperty('candidateResponse');
    expect(evidence).not.toHaveProperty('exportEligibility');
  });
});
