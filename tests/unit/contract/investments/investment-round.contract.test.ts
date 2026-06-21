import { describe, expect, it } from 'vitest';

import {
  InvestmentRoundCreateSchema,
  InvestmentRoundResponseSchema,
  SecurityTypeSchema,
} from '@shared/contracts/investments/investment-round.contract';

describe('InvestmentRoundCreateSchema', () => {
  const validCreate = {
    fundId: 1,
    roundName: 'Series A',
    securityType: 'equity',
    roundDate: '2026-06-21',
    currency: 'USD',
    investmentAmount: '1250000.000000',
    roundSize: '10000000.5',
    preMoneyValuation: '50000000',
  };

  it('parses a valid create payload', () => {
    const parsed = InvestmentRoundCreateSchema.safeParse(validCreate);

    expect(parsed.success).toBe(true);
  });

  it('defaults currency to USD', () => {
    const parsed = InvestmentRoundCreateSchema.parse({
      fundId: 1,
      roundName: 'Seed',
      securityType: 'safe',
      roundDate: '2026-06-21',
      investmentAmount: '250000',
    });

    expect(parsed.currency).toBe('USD');
  });

  it('rejects 7 decimal places for money fields', () => {
    expect(
      InvestmentRoundCreateSchema.safeParse({
        ...validCreate,
        investmentAmount: '1250000.0000001',
      }).success
    ).toBe(false);
  });

  it('rejects unknown top-level keys (.strict)', () => {
    expect(
      InvestmentRoundCreateSchema.safeParse({
        ...validCreate,
        requestHash: 'x'.repeat(64),
      }).success
    ).toBe(false);
  });

  it('allows supersedesRoundId to be omitted or provided', () => {
    expect(InvestmentRoundCreateSchema.safeParse(validCreate).success).toBe(true);
    expect(
      InvestmentRoundCreateSchema.safeParse({
        ...validCreate,
        supersedesRoundId: 10,
      }).success
    ).toBe(true);
  });
});

describe('SecurityTypeSchema', () => {
  it('covers the persisted security type set', () => {
    expect(SecurityTypeSchema.options).toEqual([
      'equity',
      'convertible_note',
      'safe',
      'warrant',
      'other',
    ]);
  });
});

describe('InvestmentRoundResponseSchema', () => {
  const validResponse = {
    id: 1,
    investmentId: 11,
    fundId: 1,
    roundName: 'Series A',
    securityType: 'equity',
    roundDate: '2026-06-21',
    currency: 'USD',
    investmentAmount: '1250000.000000',
    roundSize: null,
    preMoneyValuation: '50000000.000000',
    supersedesRoundId: null,
    createdAt: '2026-06-21T12:00:00.000Z',
    updatedAt: '2026-06-21T12:00:00.000Z',
    etag: 'W/"abc123"',
  };

  it('parses a valid response payload', () => {
    expect(InvestmentRoundResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it('rejects internal persistence fields', () => {
    for (const internalField of ['created_by', 'request_hash', 'idempotency_key']) {
      expect(
        InvestmentRoundResponseSchema.safeParse({
          ...validResponse,
          [internalField]: 'internal',
        }).success
      ).toBe(false);
    }
  });

  it('requires a non-empty etag', () => {
    expect(InvestmentRoundResponseSchema.safeParse({ ...validResponse, etag: '' }).success).toBe(
      false
    );
  });
});
