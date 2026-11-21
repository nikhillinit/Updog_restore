import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createValuationHttpFixture } from '../helpers/valuation-mark-http-fixture';

const METRIC_TABLES = [
  'lp_metric_runs',
  'evidence_records',
  'narrative_runs',
  'lp_report_packages',
  'lp_report_package_exports',
] as const;

type HttpMethod = 'post' | 'patch';
type Harness = Awaited<ReturnType<typeof createValuationHttpFixture>>;

let harness: Harness;
let fundId: number;
let metricRunId: number;
let userId: number;
let analystToken: string;
let partnerToken: string;
let serviceToken: string;

async function metricProjection() {
  const projection: Record<string, unknown[]> = {};
  for (const table of METRIC_TABLES) {
    projection[table] = (
      await harness.observer.query(
        `SELECT to_jsonb(source) AS value
           FROM ${table} AS source
          WHERE fund_id = $1
          ORDER BY to_jsonb(source)::text`,
        [fundId]
      )
    ).rows.map((row) => row.value);
  }
  return projection;
}

async function sendDenied(
  method: HttpMethod,
  path: string,
  credential: string,
  expectedCode = 'WRITE_ROLE_REQUIRED'
) {
  const before = await metricProjection();
  const http = request(harness.app);
  const pending = method === 'post' ? http.post(path) : http.patch(path);
  const response = await pending
    .set('Authorization', `Bearer ${credential}`)
    .send({});

  expect.soft(response.status, JSON.stringify(response.body)).toBe(403);
  expect.soft(response.body).toMatchObject({
    error: 'Forbidden',
    code: expectedCode,
  });
  expect.soft(await metricProjection()).toEqual(before);
}

describe('ADR-079 metric-run write guards with real PostgreSQL', () => {
  beforeAll(async () => {
    harness = await createValuationHttpFixture();
    const seed = await harness.seed();
    fundId = seed.fundId;
    userId = seed.userId;
    analystToken = harness.token(seed.userId, [fundId], 'analyst');
    partnerToken = harness.token(seed.userId, [fundId], 'partner');
    serviceToken = harness.token(seed.userId, [fundId], 'service');

    const markId = Number(
      (
        await harness.observer.query(
          'SELECT id FROM valuation_marks WHERE fund_id = $1 ORDER BY id LIMIT 1',
          [fundId]
        )
      ).rows[0].id
    );
    const metricRequest = {
      asOfDate: '2025-01-01',
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceEventIds: [],
      sourceMarkIds: [markId],
      sourceMarkSelection: 'explicit',
    };
    const dryRun = await request(harness.app)
      .post(`/api/funds/${fundId}/metric-runs/dry-run`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send(metricRequest);
    expect(dryRun.status, JSON.stringify(dryRun.body)).toBe(200);

    const commit = await request(harness.app)
      .post(`/api/funds/${fundId}/metric-runs/commit`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ ...metricRequest, previewHash: dryRun.body.previewHash });
    expect(commit.status, JSON.stringify(commit.body)).toBe(201);
    metricRunId = Number(commit.body.metricRunId);

  }, 180_000);

  afterAll(async () => {
    await harness?.cleanup();
  }, 30_000);

  it('persists an allowed analyst metric-run commit with the signed actor', async () => {
    const persisted = await metricProjection();
    expect(persisted.lp_metric_runs).toHaveLength(1);
    expect(
      (
        await harness.observer.query(
          'SELECT generated_by FROM lp_metric_runs WHERE id = $1 AND fund_id = $2',
          [metricRunId, fundId]
        )
      ).rows
    ).toEqual([{ generated_by: userId }]);
  });

  it.each([
    ['commit', 'post', () => `/api/funds/${fundId}/metric-runs/commit`],
    [
      'assemble report package',
      'post',
      () => `/api/funds/${fundId}/metric-runs/${metricRunId}/report-package`,
    ],
    [
      'create evidence record',
      'post',
      () => `/api/funds/${fundId}/metric-runs/${metricRunId}/evidence-records`,
    ],
    [
      'create narrative run',
      'post',
      () => `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs`,
    ],
    [
      'edit narrative run',
      'patch',
      () => `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs/1`,
    ],
  ] as const)('denies signed service role for %s with zero mutation', async (_name, method, path) => {
    await sendDenied(method, path(), serviceToken);
  });

  it.each([
    [
      'store JSON export',
      () => `/api/funds/${fundId}/metric-runs/${metricRunId}/report-package/exports/json`,
    ],
    [
      'store CSV export',
      () => `/api/funds/${fundId}/metric-runs/${metricRunId}/report-package/exports/csv`,
    ],
    [
      'submit narrative for review',
      () => `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs/1/review`,
    ],
    [
      'approve narrative',
      () => `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs/1/approve`,
    ],
  ] as const)('denies signed analyst role for partner-only %s with zero mutation', async (_name, path) => {
    await sendDenied('post', path(), analystToken);
  });

  it('allows partner role through the partner-only export guard', async () => {
    const before = await metricProjection();
    const response = await request(harness.app)
      .post(`/api/funds/${fundId}/metric-runs/${metricRunId}/report-package/exports/json`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ unexpected: true });

    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST_BODY');
    expect(await metricProjection()).toEqual(before);
  });

  it('denies an LP-linked partner with the team-write envelope and zero mutation', async () => {
    const lpLinkedPartner = harness.token(userId, [fundId], 'partner', 99);
    await sendDenied(
      'post',
      `/api/funds/${fundId}/metric-runs/${metricRunId}/report-package`,
      lpLinkedPartner,
      'TEAM_WRITE_REQUIRED'
    );
  });

  it('denies a wrong-fund partner with the fund-access envelope and zero mutation', async () => {
    const wrongFundPartner = harness.token(userId, [fundId + 10_000], 'partner');
    await sendDenied(
      'post',
      `/api/funds/${fundId}/metric-runs/commit`,
      wrongFundPartner,
      'FUND_ACCESS_DENIED'
    );
  });
});
