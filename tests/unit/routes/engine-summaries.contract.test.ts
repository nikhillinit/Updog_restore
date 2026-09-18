import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FixtureCompany {
  name?: string;
  invested?: number;
  ownership?: number | null;
  stage?: string;
  sector?: string;
}

// Expectations derive from the same fixture the route reads, so editing
// tests/fixtures/portfolio.json cannot silently break this contract test.
// The server test setup mocks `fs` globally, so read through the actual module.
async function loadFixtureCompanies(): Promise<FixtureCompany[]> {
  const fs = await vi.importActual<typeof import('fs')>('fs');
  const fixturePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../fixtures/portfolio.json'
  );
  return (JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as { companies: FixtureCompany[] })
    .companies;
}

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
    const fixtureCompanies = await loadFixtureCompanies();
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
    expect(fixtureCompanies.length).toBeGreaterThan(0);
    const first = fixtureCompanies[0]!;
    expect(response.body.companies).toHaveLength(4);
    expect(response.body.companies[0]).toEqual({
      id: 1,
      name: `${first.name} 1`,
      invested: first.invested,
      ownership: first.ownership,
      stage: first.stage,
      sector: first.sector,
      cohortVintageYear: 2024,
    });
    // Templates cycle through the fixture list, so the (n)th company reuses fixture[n % length].
    const fourth = fixtureCompanies[3 % fixtureCompanies.length]!;
    expect(response.body.companies[3]).toMatchObject({
      id: 4,
      name: `${fourth.name} 4`,
      sector: fourth.sector,
      cohortVintageYear: 2024,
    });
    const names = response.body.companies.map((company: { name: string }) => company.name);
    expect(new Set(names).size).toBe(4);
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
