import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeApp(router: express.Router) {
  const app = express();
  app.use(router);
  return app;
}

async function loadRouter() {
  const module = await import('../../../server/routes/engine-summaries');
  return module.default;
}

describe('engine summaries cohort route contract', () => {
  beforeEach(() => {
    vi.doUnmock('fs');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns deterministic cohort scaffold payload', async () => {
    const router = await loadRouter();

    const response = await request(makeApp(router))
      .get('/cohorts/analysis?fundId=7&vintageYear=2024&cohortSize=4')
      .expect(200);

    expect(response.body).toMatchObject({
      cohortId: 'cohort-7-2024',
      fundId: 7,
      vintageYear: 2024,
      cohortSize: 4,
    });
    expect(response.body.companies).toHaveLength(4);
    expect(response.body.companies[0]).toMatchObject({
      id: 1,
      name: 'TechCorp 1',
      invested: 750000,
      ownership: 0.12,
      stage: 'Series A',
      sector: 'SaaS',
      cohortVintageYear: 2024,
    });
    expect(response.body.companies[3]).toMatchObject({
      id: 4,
      name: 'TechCorp 4',
      sector: 'SaaS',
      cohortVintageYear: 2024,
    });
  });

  it('falls back to built-in templates when fixture list is empty', async () => {
    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        readFileSync: vi.fn(() => JSON.stringify({ companies: [] })),
      };
    });

    const router = await loadRouter();

    const response = await request(makeApp(router))
      .get('/cohorts/analysis?fundId=2&vintageYear=2026&cohortSize=2')
      .expect(200);

    expect(response.body).toMatchObject({
      cohortId: 'cohort-2-2026',
      fundId: 2,
      vintageYear: 2026,
      cohortSize: 2,
    });
    expect(response.body.companies).toEqual([
      {
        id: 1,
        name: 'Company 1',
        invested: 500000,
        ownership: null,
        stage: 'Series A',
        sector: 'Tech',
        cohortVintageYear: 2026,
      },
      {
        id: 2,
        name: 'Company 2',
        invested: 500000,
        ownership: null,
        stage: 'Series A',
        sector: 'Tech',
        cohortVintageYear: 2026,
      },
    ]);
  });

  it('defaults fundId when omitted', async () => {
    const router = await loadRouter();

    const response = await request(makeApp(router))
      .get('/cohorts/analysis?vintageYear=2025&cohortSize=1')
      .expect(200);

    expect(response.body).toMatchObject({
      cohortId: 'cohort-1-2025',
      fundId: 1,
      vintageYear: 2025,
      cohortSize: 1,
    });
    expect(response.body.companies).toHaveLength(1);
    expect(response.body.companies[0]).toMatchObject({
      cohortVintageYear: 2025,
    });
  });
});
