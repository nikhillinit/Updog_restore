import { describe, expect, it, vi } from 'vitest';

const { reserveEngineMock } = vi.hoisted(() => ({
  reserveEngineMock: vi.fn(),
}));

vi.mock('../../../shared/core/reserves/ReserveEngine', () => ({
  ReserveEngine: reserveEngineMock,
}));

import { buildScenarioReserveSummary } from '../../../server/services/fund-scenario-reserve-summary';

describe('fund scenario reserve summary builder', () => {
  it('converts base allocations to cents, applies hard caps, warns, and sorts by companyId', () => {
    reserveEngineMock.mockReturnValue([
      { allocation: 1_000, confidence: 0.7, rationale: 'Seed SaaS' },
      { allocation: 500, confidence: 0.4, rationale: 'Series A Fintech' },
    ]);

    const summary = buildScenarioReserveSummary({
      fundId: 1,
      fundSizeCents: 100_000,
      portfolio: [
        { id: 200, invested: 100, ownership: 0.1, stage: 'Seed', sector: 'SaaS' },
        { id: 100, invested: 50, ownership: 0.05, stage: 'Series A', sector: 'Fintech' },
      ],
      override: {
        overrideType: 'reserve_allocation',
        payload: {
          items: [
            {
              companyId: 200,
              plannedReservesCents: 120_000,
              maxAllocationCents: 80_000,
              allocationReason: 'Concentration cap',
            },
            {
              companyId: 999,
              plannedReservesCents: 10_000,
            },
            {
              companyId: 200,
              plannedReservesCents: 90_000,
              maxAllocationCents: null,
            },
          ],
        },
      },
    });

    expect(summary.allocations.map((item) => item.companyId)).toEqual([100, 200]);
    expect(summary.allocations[0]).toMatchObject({
      companyId: 100,
      baseAllocationCents: 50_000,
      plannedReservesCents: 50_000,
      scenarioAllocationCents: 50_000,
      capApplied: false,
    });
    expect(summary.allocations[1]).toMatchObject({
      companyId: 200,
      baseAllocationCents: 100_000,
      plannedReservesCents: 90_000,
      maxAllocationCents: null,
      scenarioAllocationCents: 90_000,
      allocationDeltaCents: -10_000,
      capApplied: false,
    });
    expect(summary.totalBaseAllocationCents).toBe(150_000);
    expect(summary.totalScenarioAllocationCents).toBe(140_000);
    expect(summary.totalAllocationDeltaCents).toBe(-10_000);
    expect(summary.warnings.map((warning) => warning.code)).toEqual([
      'DUPLICATE_COMPANY_OVERRIDE',
      'OVERRIDE_COMPANY_NOT_FOUND',
      'TOTAL_SCENARIO_ALLOCATION_EXCEEDS_FUND_SIZE',
    ]);
  });

  it('applies maxAllocationCents as a hard cap when the final override has a lower cap', () => {
    reserveEngineMock.mockReturnValue([
      { allocation: 1_000, confidence: 0.7, rationale: 'Seed SaaS' },
    ]);

    const summary = buildScenarioReserveSummary({
      fundId: 1,
      fundSizeCents: null,
      portfolio: [{ id: 200, invested: 100, ownership: 0.1, stage: 'Seed', sector: 'SaaS' }],
      override: {
        overrideType: 'reserve_allocation',
        payload: {
          items: [
            {
              companyId: 200,
              plannedReservesCents: 120_000,
              maxAllocationCents: 80_000,
            },
          ],
        },
      },
    });

    expect(summary.allocations[0]).toMatchObject({
      plannedReservesCents: 120_000,
      maxAllocationCents: 80_000,
      scenarioAllocationCents: 80_000,
      capApplied: true,
    });
  });
});
