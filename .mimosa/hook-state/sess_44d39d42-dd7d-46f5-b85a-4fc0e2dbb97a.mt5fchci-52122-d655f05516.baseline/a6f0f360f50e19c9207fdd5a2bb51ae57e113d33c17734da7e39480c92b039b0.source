import { describe, expect, it } from 'vitest';

import {
  PlanningFmvOverrideCreateRequestSchema,
  PlanningFmvOverrideCreateResponseSchema,
  PlanningFmvOverrideLatestResponseSchema,
} from '@shared/contracts/lp-reporting/planning-fmv-override.contract';

const happyRequest = {
  companyId: 42,
  markDate: '2026-06-30',
  fairValue: '12500000.000000',
  reason: 'Board-approved planning FMV for reserve allocation review.',
  source: {
    allocationVersion: 4,
    plannedReservesCents: 25000000,
    allocationReason: 'Series B follow-on reserve.',
  },
};

const happyRecord = {
  id: 100,
  fundId: 1,
  companyId: 42,
  markDate: '2026-06-30',
  asOfDate: '2026-06-30',
  fairValue: '12500000.000000',
  currency: 'USD',
  confidenceLevel: 'medium',
  status: 'approved',
  priorMarkId: null,
  methodologyNotes: 'Board-approved planning FMV for reserve allocation review.',
  approvedBy: 7,
  approvedAt: '2026-06-30T00:00:00.000Z',
  createdAt: '2026-06-30T00:00:00.000Z',
};

describe('PlanningFmvOverrideCreateRequestSchema', () => {
  it('accepts the approved Planning FMV request shape and defaults optional fields', () => {
    const parsed = PlanningFmvOverrideCreateRequestSchema.parse(happyRequest);

    expect(parsed.currency).toBe('USD');
    expect(parsed.confidenceLevel).toBe('medium');
    expect(parsed.asOfDate).toBeUndefined();
  });

  it('rejects roundId before route or service code can use it', () => {
    expect(() =>
      PlanningFmvOverrideCreateRequestSchema.parse({
        ...happyRequest,
        roundId: 10,
      })
    ).toThrow();
  });

  it('rejects scenario identity and numeric fair values', () => {
    expect(() =>
      PlanningFmvOverrideCreateRequestSchema.parse({
        ...happyRequest,
        activeScenarioId: 'b2e20d78-3d05-4d37-8ebf-f384d537e6e3',
      })
    ).toThrow();

    expect(() =>
      PlanningFmvOverrideCreateRequestSchema.parse({
        ...happyRequest,
        fairValue: 12500000,
      })
    ).toThrow();
  });
});

describe('Planning FMV override response schemas', () => {
  it('accepts create and latest responses with approved valuation marks', () => {
    const create = PlanningFmvOverrideCreateResponseSchema.parse({
      requestId: 10,
      idempotencyKey: 'idem-1',
      replayed: false,
      valuationMark: happyRecord,
    });
    const latest = PlanningFmvOverrideLatestResponseSchema.parse({
      asOfDate: '2026-06-30',
      marks: [happyRecord],
    });

    expect(create.valuationMark.id).toBe(100);
    expect(latest.marks).toHaveLength(1);
  });
});
