/**
 * Shared KPI observation fixture (issue #1300).
 *
 * Contract-shaped observation used by the route, service, and contract tests.
 * `msw/handlers/kpis.ts` is unrelated: it fixtures the separate fund raw-facts
 * read and is not used to back any product surface.
 */
import {
  KPI_OBSERVATION_CONTRACT_VERSION,
  type KpiObservationV1,
} from '../../shared/contracts/kpi/kpi-observation-v1.contract';

export const sampleKpiObservation: KpiObservationV1 = {
  contractVersion: KPI_OBSERVATION_CONTRACT_VERSION,
  observationId: 1,
  fundId: 1,
  portfolioCompanyId: 4,
  metric: 'revenue_arr',
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
  basis: 'actual',
  value: { valueKind: 'money', amountUsd: '2100000.000000' },
  companyKpiLabel: null,
  source: 'manual',
  sourceLabel: 'Q2 board deck',
  comment: null,
  submittedAt: '2026-07-05T00:00:00.000Z',
  reviewStatus: 'pending',
  reviewComment: null,
  reviewedAt: null,
  version: 1,
  createdAt: '2026-07-06T00:00:00.000Z',
  updatedAt: '2026-07-06T00:00:00.000Z',
};
