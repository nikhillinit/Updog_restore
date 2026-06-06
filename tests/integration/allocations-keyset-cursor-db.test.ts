import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';

import { registerRoutes } from '../../server/routes';
import { storage } from '../../server/storage';

/**
 * DB-path integration test for the company-list keyset cursor (#744 follow-up).
 *
 * The unit test (tests/unit/routes/allocations-keyset-cursor.test.ts) only
 * exercises the in-memory branch (it mocks db.select to throw). This test drives
 * the REAL Postgres branch of GET /api/funds/:fundId/companies, so the
 * hand-written row-value cursor predicate (companyListCursorPredicate in
 * server/routes/allocations.ts, including the NULLS LAST tail) is actually
 * executed.
 *
 * Strategy (per sort): fetch the full set in one unpaginated request -- that is
 * ground truth and exercises ORDER BY only. Then page with limit=2 (pages 2+ are
 * the ONLY place the cursor predicate runs) and assert the concatenated ids equal
 * the ground-truth order (no skip + identical ordering) with no duplicates. The
 * seed sort keys are deliberately NOT monotonic with id, so each sort order
 * diverges from id order -- exactly what the old id-only cursor got wrong, so an
 * id-only predicate produces a different paged sequence and fails this test.
 */

type SortBy = 'exit_moic_desc' | 'planned_reserves_desc' | 'name_asc';

type CompanyListBody = {
  companies: Array<{ id: number }>;
  pagination: { next_cursor: string | null; has_more: boolean };
};

// Insert order == ascending serial-id order (rows are inserted sequentially).
// exit_moic: 3 non-null (incl. a 20000 tie to exercise the id-DESC tiebreaker)
// and 3 null, arranged so the null tail spans a page boundary -- that drives a
// null-keyed cursor back through the cursor.k === null predicate branch.
const SEED = [
  { name: 'Delta', exitMoicBps: 20000, plannedReservesCents: 500_00 },
  { name: 'Foxtrot', exitMoicBps: null, plannedReservesCents: 300_00 },
  { name: 'Alpha', exitMoicBps: 30000, plannedReservesCents: 100_00 },
  { name: 'Echo', exitMoicBps: 20000, plannedReservesCents: 400_00 },
  { name: 'Bravo', exitMoicBps: null, plannedReservesCents: 200_00 },
  { name: 'Charlie', exitMoicBps: null, plannedReservesCents: 600_00 },
] as const;

const SORTS: SortBy[] = ['exit_moic_desc', 'planned_reserves_desc', 'name_asc'];

describe('allocations company list keyset cursor (DB path)', () => {
  let app: express.Express;
  let fundId: number;

  beforeAll(async () => {
    // This test only has value against the production DB branch. If the suite
    // ever runs on memory storage, the route takes a different code path and the
    // cursor predicate is never executed -- fail loud instead of passing green
    // through the wrong branch.
    expect(storage.kind).toBe('database');

    const fund = await storage.createFund({
      name: `Keyset Cursor DB Fund ${Date.now()}`,
      size: '10000000',
      managementFee: '0.0200',
      carryPercentage: '0.2000',
      vintageYear: 2026,
    });
    fundId = fund.id;

    // Sequential awaits keep serial ids monotonic with insert order, which the
    // id-DESC tiebreaker reasoning above depends on.
    for (const row of SEED) {
      await storage.createPortfolioCompany({
        fundId,
        name: row.name,
        sector: 'SaaS',
        stage: 'seed',
        investmentAmount: '1000000',
        plannedReservesCents: row.plannedReservesCents,
        exitMoicBps: row.exitMoicBps,
      });
    }

    app = express();
    app.use(express.json({ limit: '1mb' }));
    await registerRoutes(app);
  });

  async function fetchPage(
    sortBy: SortBy,
    limit: number,
    cursor?: string
  ): Promise<CompanyListBody> {
    const params: Record<string, string> = { sortBy, limit: String(limit) };
    if (cursor) params.cursor = cursor;
    const res = await request(app).get(`/api/funds/${fundId}/companies`).query(params);
    expect(res.status).toBe(200);
    return res.body as CompanyListBody;
  }

  async function pageThrough(sortBy: SortBy): Promise<number[]> {
    const ids: number[] = [];
    let cursor: string | undefined;
    // Guard bounds the loop so a non-terminating cursor fails loud, not hangs.
    for (let guard = 0; guard <= SEED.length + 2; guard++) {
      const body = await fetchPage(sortBy, 2, cursor);
      ids.push(...body.companies.map((company) => company.id));
      if (!body.pagination.next_cursor) {
        return ids;
      }
      cursor = body.pagination.next_cursor;
    }
    throw new Error(`pagination did not terminate for sortBy=${sortBy}`);
  }

  it.each(SORTS)(
    'pages without duplicate or skip and matches full order for %s',
    async (sortBy) => {
      const full = await fetchPage(sortBy, 200);
      const fullIds = full.companies.map((company) => company.id);
      expect(fullIds).toHaveLength(SEED.length);

      const pagedIds = await pageThrough(sortBy);

      expect(pagedIds).toEqual(fullIds); // no skip + identical ordering vs ground truth
      expect(new Set(pagedIds).size).toBe(pagedIds.length); // no duplicate
      expect(pagedIds).toHaveLength(SEED.length);
    }
  );
});
