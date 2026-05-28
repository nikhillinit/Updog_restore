import { describe, expect, it } from 'vitest';

import {
  buildCompanyListResponse,
  companyListItemFromRow,
  latestAllocationCompanyFromRow,
  missingAllocationFields,
  summarizeLatestAllocations,
} from '../../../../server/services/allocations/calculator';
import { InvalidAllocationRowError } from '../../../../server/services/allocations/calculator.errors';

describe('allocations calculator dark service', () => {
  it('maps company-list DB rows to the current route wire format', () => {
    const item = companyListItemFromRow(
      {
        id: 11,
        fundId: null,
        name: 'Alpha AI',
        sector: 'SaaS',
        stage: 'Seed',
        status: null,
        investmentAmount: '123.45',
        deployedReservesCents: BigInt(1000),
        plannedReservesCents: BigInt(2000),
        exitMoicBps: 35000,
        ownershipCurrentPct: '0.125',
        allocationCapCents: BigInt(9999),
        allocationReason: 'contract',
        lastAllocationAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      1
    );

    expect(item).toEqual({
      id: 11,
      fundId: 1,
      name: 'Alpha AI',
      sector: 'SaaS',
      stage: 'Seed',
      status: 'active',
      invested_cents: 12345,
      deployed_reserves_cents: 1000,
      planned_reserves_cents: 2000,
      exit_moic_bps: 35000,
      ownership_pct: 0.125,
      allocation_cap_cents: 9999,
      allocation_reason: 'contract',
      last_allocation_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('documents Decimal half-up cents behavior for Milestone 6 cutover edges', () => {
    expect(
      companyListItemFromRow(
        {
          id: 11,
          fundId: 1,
          name: 'Alpha AI',
          sector: 'SaaS',
          stage: 'Seed',
          status: 'active',
          investmentAmount: '1.005',
        },
        1
      ).invested_cents
    ).toBe(101);

    expect(
      latestAllocationCompanyFromRow({
        company_id: 11,
        company_name: 'Alpha AI',
        sector: 'SaaS',
        stage: 'Seed',
        status: 'active',
        invested_amount: '-0.005',
        planned_reserves_cents: 0,
        deployed_reserves_cents: 0,
        allocation_cap_cents: null,
        allocation_reason: null,
        allocation_version: 1,
        last_allocation_at: null,
      }).invested_amount_cents
    ).toBe(-1);

    expect(
      companyListItemFromRow(
        {
          id: 12,
          fundId: 1,
          name: 'Beta AI',
          sector: 'SaaS',
          stage: 'Seed',
          status: 'active',
          investmentAmount: '',
        },
        1
      ).invested_cents
    ).toBe(0);
  });

  it('fails fast on invalid source row ids before route cutover wiring', () => {
    expect(() =>
      companyListItemFromRow(
        {
          id: 0,
          fundId: 1,
          name: 'Bad Row',
          sector: 'SaaS',
          stage: 'Seed',
          status: 'active',
          investmentAmount: '1',
        },
        1
      )
    ).toThrow(InvalidAllocationRowError);
  });

  it('builds cursor pagination envelope with current snake_case keys', () => {
    const rows = [
      {
        id: 30,
        fundId: 1,
        name: 'C',
        sector: 'SaaS',
        stage: 'Seed',
        status: 'active',
        investmentAmount: '1',
      },
      {
        id: 20,
        fundId: 1,
        name: 'B',
        sector: 'SaaS',
        stage: 'Seed',
        status: 'active',
        investmentAmount: '1',
      },
      {
        id: 10,
        fundId: 1,
        name: 'A',
        sector: 'SaaS',
        stage: 'Seed',
        status: 'active',
        investmentAmount: '1',
      },
    ];

    expect(buildCompanyListResponse(rows, 1, 2)).toMatchObject({
      companies: [{ id: 30 }, { id: 20 }],
      pagination: { next_cursor: '20', has_more: true },
    });
  });

  it('detects missing allocation facts exactly as the legacy route does', () => {
    expect(
      missingAllocationFields({
        planned_reserves_cents: null,
        deployed_reserves_cents: BigInt(0),
        allocation_version: null,
      })
    ).toEqual(['planned_reserves_cents', 'allocation_version']);
  });

  it('summarizes latest allocations with metadata totals', () => {
    const out = summarizeLatestAllocations(1, [
      {
        company_id: 11,
        company_name: 'Alpha',
        sector: 'SaaS',
        stage: 'Seed',
        status: 'active',
        invested_amount: '1000000',
        planned_reserves_cents: 750_000_00,
        deployed_reserves_cents: 250_000_00,
        allocation_cap_cents: null,
        allocation_reason: null,
        allocation_version: 2,
        last_allocation_at: '2026-01-01T00:00:00.000Z',
      },
      {
        company_id: 12,
        company_name: 'Beta',
        sector: 'Fintech',
        stage: 'Series A',
        status: 'active',
        invested_amount: '500000',
        planned_reserves_cents: null,
        deployed_reserves_cents: null,
        allocation_cap_cents: null,
        allocation_reason: null,
        allocation_version: null,
        last_allocation_at: null,
      },
    ]);

    expect(out.metadata).toEqual({
      total_planned_cents: 75_000_000,
      total_deployed_cents: 25_000_000,
      companies_count: 2,
      allocation_facts_missing_count: 1,
      last_updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(out.companies[1].missing_allocation_fields).toEqual([
      'planned_reserves_cents',
      'deployed_reserves_cents',
      'allocation_version',
    ]);
  });
});
