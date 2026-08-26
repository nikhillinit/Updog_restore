import { describe, expect, it } from 'vitest';

import {
  KPI_CSV_TEMPLATE_HEADER,
  KPI_METRICS,
  KPI_METRIC_VALUE_KIND,
  KPI_OBSERVATION_CONTRACT_VERSION,
  KpiObservationCreateRequestSchema,
  KpiObservationListQuerySchema,
  KpiObservationReviewRequestSchema,
  KpiObservationV1Schema,
  metricShapeIssues,
  numericStringOfValue,
} from '../../../../shared/contracts/kpi/kpi-observation-v1.contract';

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    portfolioCompanyId: 4,
    metric: 'revenue_arr',
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    basis: 'actual',
    value: { valueKind: 'money', amountUsd: '2100000.000000' },
    submittedAt: '2026-07-05T09:00:00.000Z',
    ...overrides,
  };
}

describe('KPI observation contract v1', () => {
  it('assigns exactly one value kind to every metric in the fixed set', () => {
    expect(Object.keys(KPI_METRIC_VALUE_KIND).sort()).toEqual([...KPI_METRICS].sort());
  });

  it('accepts a well-formed money observation request', () => {
    const parsed = KpiObservationCreateRequestSchema.safeParse(createRequest());
    expect(parsed.success).toBe(true);
  });

  it('rejects a value kind that does not match the metric', () => {
    const parsed = KpiObservationCreateRequestSchema.safeParse(
      createRequest({ metric: 'qualitative_update' })
    );
    expect(parsed.success).toBe(false);
  });

  it('rejects float money and accepts only fixed 6-decimal strings', () => {
    expect(
      KpiObservationCreateRequestSchema.safeParse(
        createRequest({ value: { valueKind: 'money', amountUsd: 2100000 } })
      ).success
    ).toBe(false);
    expect(
      KpiObservationCreateRequestSchema.safeParse(
        createRequest({ value: { valueKind: 'money', amountUsd: '2100000.00' } })
      ).success
    ).toBe(false);
  });

  it('rejects a negative magnitude metric but allows a negative company KPI', () => {
    expect(
      metricShapeIssues({
        metric: 'headcount',
        value: { valueKind: 'number', number: '-1.000000' },
        companyKpiLabel: null,
      })
    ).toHaveLength(1);
    expect(
      metricShapeIssues({
        metric: 'company_specific',
        value: { valueKind: 'number', number: '-4.000000' },
        companyKpiLabel: 'Net revenue retention delta',
      })
    ).toEqual([]);
  });

  it('couples companyKpiLabel to the company_specific metric in both directions', () => {
    expect(
      KpiObservationCreateRequestSchema.safeParse(
        createRequest({
          metric: 'company_specific',
          value: { valueKind: 'number', number: '1.230000' },
        })
      ).success
    ).toBe(false);
    expect(
      KpiObservationCreateRequestSchema.safeParse(
        createRequest({ companyKpiLabel: 'Weekly active teams' })
      ).success
    ).toBe(false);
  });

  it('rejects an inverted period', () => {
    expect(
      KpiObservationCreateRequestSchema.safeParse(
        createRequest({ periodStart: '2026-06-30', periodEnd: '2026-04-01' })
      ).success
    ).toBe(false);
  });

  it('refuses caller-supplied source and any unknown field', () => {
    expect(
      KpiObservationCreateRequestSchema.safeParse(createRequest({ source: 'manual' })).success
    ).toBe(false);
    expect(
      KpiObservationCreateRequestSchema.safeParse(createRequest({ reviewStatus: 'accepted' }))
        .success
    ).toBe(false);
  });

  it('round-trips a stored observation and exposes its numeric string', () => {
    const observation = {
      contractVersion: KPI_OBSERVATION_CONTRACT_VERSION,
      observationId: 9,
      fundId: 1,
      portfolioCompanyId: 4,
      metric: 'runway_months' as const,
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
      basis: 'actual' as const,
      value: { valueKind: 'number' as const, number: '14.500000' },
      companyKpiLabel: null,
      source: 'csv_import' as const,
      sourceLabel: 'Q2 collection',
      comment: null,
      submittedAt: '2026-07-05T09:00:00.000Z',
      reviewStatus: 'pending' as const,
      reviewComment: null,
      reviewedAt: null,
      version: 1,
      createdAt: '2026-07-05T09:00:01.000Z',
      updatedAt: '2026-07-05T09:00:01.000Z',
    };
    const parsed = KpiObservationV1Schema.parse(observation);
    expect(parsed).toEqual(observation);
    expect(numericStringOfValue(parsed.value)).toBe('14.500000');
  });

  it('constrains review requests and list filters', () => {
    expect(KpiObservationReviewRequestSchema.safeParse({ reviewStatus: 'accepted' }).success).toBe(
      true
    );
    expect(KpiObservationReviewRequestSchema.safeParse({ reviewStatus: 'unknown' }).success).toBe(
      false
    );
    // A review decides; returning a row to pending would erase the reviewer.
    expect(KpiObservationReviewRequestSchema.safeParse({ reviewStatus: 'pending' }).success).toBe(
      false
    );
    expect(KpiObservationListQuerySchema.safeParse({ portfolioCompanyId: '4' })).toMatchObject({
      success: true,
      data: { portfolioCompanyId: 4 },
    });
    expect(KpiObservationListQuerySchema.safeParse({ sortBy: 'value' }).success).toBe(false);
  });

  it('freezes the fixed CSV template header', () => {
    expect([...KPI_CSV_TEMPLATE_HEADER]).toEqual([
      'portfolio_company_id',
      'metric',
      'period_start',
      'period_end',
      'basis',
      'value',
      'company_kpi_label',
      'source_label',
      'comment',
      'submitted_at',
    ]);
  });
});
