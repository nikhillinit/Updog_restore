import { describe, expect, it } from 'vitest';

import {
  KPI_METRIC_VALUE_KIND,
  type KpiObservationCreateRequest,
} from '../../../../shared/contracts/kpi/kpi-observation-v1.contract';
import type { KpiObservationRow } from '../../../../shared/schema/kpi-observations';
import { IdempotentCommandError } from '../../../../server/lib/idempotent-command';
import {
  KpiObservationServiceError,
  createKpiObservationWithPorts,
  toKpiObservationContract,
  type CreateKpiObservationInput,
  type KpiObservationPorts,
} from '../../../../server/services/kpi/kpi-observation-service';

const REQUEST: KpiObservationCreateRequest = {
  portfolioCompanyId: 4,
  metric: 'revenue_arr',
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
  basis: 'actual',
  value: { valueKind: 'money', amountUsd: '2100000.000000' },
  submittedAt: '2026-07-05T09:00:00.000Z',
};

class FakePorts implements KpiObservationPorts {
  companies = new Set(['1:4']);
  rows = new Map<string, { row: KpiObservationRow; requestHash: string }>();
  nextId = 1;

  async assertCompanyOwned(fundId: number, portfolioCompanyId: number) {
    await Promise.resolve();
    if (!this.companies.has(`${fundId}:${portfolioCompanyId}`)) {
      throw new KpiObservationServiceError(
        404,
        'PORTFOLIO_COMPANY_NOT_FOUND',
        'Portfolio company not found in this fund.'
      );
    }
  }

  async createIdempotent(input: Parameters<KpiObservationPorts['createIdempotent']>[0]) {
    await Promise.resolve();
    const key = `${input.fundId}:${input.idempotencyKey}`;
    const requestHash = JSON.stringify(input.preimage);
    const existing = this.rows.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new IdempotentCommandError(
          409,
          'IDEMPOTENCY_KEY_REUSE',
          'Idempotency-Key was already used for a different request.'
        );
      }
      return { row: existing.row, replayed: true };
    }

    const value = input.request.value;
    const at = new Date('2026-07-06T00:00:00.000Z');
    const row: KpiObservationRow = {
      id: this.nextId++,
      fundId: input.fundId,
      portfolioCompanyId: input.request.portfolioCompanyId,
      metric: input.request.metric,
      periodStart: input.request.periodStart,
      periodEnd: input.request.periodEnd,
      basis: input.request.basis,
      valueKind: KPI_METRIC_VALUE_KIND[input.request.metric],
      valueAmount:
        value.valueKind === 'money'
          ? value.amountUsd
          : value.valueKind === 'number'
            ? value.number
            : null,
      valueDate: value.valueKind === 'date' ? value.date : null,
      valueText: value.valueKind === 'text' ? value.text : null,
      companyKpiLabel: input.request.companyKpiLabel ?? null,
      source: input.source,
      sourceLabel: input.request.sourceLabel ?? null,
      comment: input.request.comment ?? null,
      submittedAt: new Date(input.request.submittedAt),
      reviewStatus: 'pending',
      reviewComment: null,
      reviewedBy: null,
      reviewedAt: null,
      version: 1,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      createdBy: input.actorId,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.set(key, { row, requestHash });
    return { row, replayed: false };
  }
}

function input(overrides: Partial<CreateKpiObservationInput> = {}): CreateKpiObservationInput {
  return {
    fundId: 1,
    request: REQUEST,
    source: 'manual',
    actorId: 7,
    idempotencyKey: 'kpi-1',
    ...overrides,
  };
}

describe('KPI observation service', () => {
  it('creates then replays the same strict public response', async () => {
    const ports = new FakePorts();
    const created = await createKpiObservationWithPorts(ports, input());
    const replay = await createKpiObservationWithPorts(ports, input());

    expect(created.replayed).toBe(false);
    expect(replay).toEqual({ ...created, replayed: true });
    expect(ports.rows.size).toBe(1);
    expect(Object.keys(created.observation)).not.toContain('idempotencyKey');
    expect(Object.keys(created.observation)).not.toContain('requestHash');
    expect(created.observation.reviewStatus).toBe('pending');
    expect(created.observation.version).toBe(1);
  });

  it('rejects a same-key replay that carries a different request', async () => {
    const ports = new FakePorts();
    await createKpiObservationWithPorts(ports, input());

    await expect(
      createKpiObservationWithPorts(
        ports,
        input({ request: { ...REQUEST, value: { valueKind: 'money', amountUsd: '9.000000' } } })
      )
    ).rejects.toBeInstanceOf(IdempotentCommandError);
  });

  it('keeps the actor out of the idempotency preimage', async () => {
    const ports = new FakePorts();
    const created = await createKpiObservationWithPorts(ports, input({ actorId: 7 }));
    const replay = await createKpiObservationWithPorts(ports, input({ actorId: 99 }));

    expect(replay.replayed).toBe(true);
    expect(replay.observation).toEqual(created.observation);
  });

  it('refuses a company that belongs to another fund', async () => {
    const ports = new FakePorts();
    await expect(createKpiObservationWithPorts(ports, input({ fundId: 2 }))).rejects.toMatchObject({
      statusCode: 404,
      code: 'PORTFOLIO_COMPANY_NOT_FOUND',
    });
  });

  it('refuses a metric/value mismatch before touching persistence', async () => {
    const ports = new FakePorts();
    await expect(
      createKpiObservationWithPorts(ports, {
        ...input(),
        request: {
          ...REQUEST,
          value: { valueKind: 'text', text: 'two million' },
        } as KpiObservationCreateRequest,
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_KPI_OBSERVATION_SHAPE' });
    expect(ports.rows.size).toBe(0);
  });

  it('pads a short stored numeric back to the six-decimal contract boundary', () => {
    const at = new Date('2026-07-06T00:00:00.000Z');
    const observation = toKpiObservationContract({
      id: 1,
      fundId: 1,
      portfolioCompanyId: 4,
      metric: 'runway_months',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
      basis: 'projected',
      valueKind: 'number',
      valueAmount: '14.5',
      valueDate: null,
      valueText: null,
      companyKpiLabel: null,
      source: 'csv_import',
      sourceLabel: null,
      comment: null,
      submittedAt: at,
      reviewStatus: 'pending',
      reviewComment: null,
      reviewedBy: null,
      reviewedAt: null,
      version: 1,
      idempotencyKey: 'k',
      requestHash: 'h',
      createdBy: null,
      createdAt: at,
      updatedAt: at,
    });

    expect(observation.value).toEqual({ valueKind: 'number', number: '14.500000' });
  });

  it('refuses to serve a row whose value columns contradict its value kind', () => {
    const at = new Date('2026-07-06T00:00:00.000Z');
    expect(() =>
      toKpiObservationContract({
        id: 1,
        fundId: 1,
        portfolioCompanyId: 4,
        metric: 'revenue_arr',
        periodStart: '2026-04-01',
        periodEnd: '2026-06-30',
        basis: 'actual',
        valueKind: 'money',
        valueAmount: null,
        valueDate: null,
        valueText: null,
        companyKpiLabel: null,
        source: 'manual',
        sourceLabel: null,
        comment: null,
        submittedAt: at,
        reviewStatus: 'pending',
        reviewComment: null,
        reviewedBy: null,
        reviewedAt: null,
        version: 1,
        idempotencyKey: 'k',
        requestHash: 'h',
        createdBy: null,
        createdAt: at,
        updatedAt: at,
      })
    ).toThrow(/inconsistent/i);
  });
});
