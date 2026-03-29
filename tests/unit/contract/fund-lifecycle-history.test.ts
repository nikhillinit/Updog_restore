/**
 * Batch 1A: Contract + route tests for GET /api/funds/:id/lifecycle-history
 *
 * Covers:
 *   1. Zod schema parse: valid entry roundtrips correctly
 *   2. Zod schema parse: invalid entry (missing required field) rejects
 *   3. Service: returns empty entries array for fund with no publishes
 *   4. Service: returns entries ordered by version DESC with calc-run join
 *   5. Service: handles missing calcRun (entry.calcRun = null)
 *   6. Route: 400 for non-integer ID
 *   7. Route: 404 for unknown fund
 *   8. Route: 200 with correct FundLifecycleHistoryV1 shape
 *
 * Per MEMORY.md: set mock return values in beforeEach, not at declaration,
 * because restoreMocks wipes them.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  LifecycleHistoryEntrySchema,
  FundLifecycleHistoryV1Schema,
} from '@shared/contracts/fund-lifecycle-history-v1.contract';
import type { FundLifecycleHistoryV1 } from '@shared/contracts/fund-lifecycle-history-v1.contract';

// ── Mock service module before any imports that use it ──

vi.mock('../../../server/services/fund-lifecycle-history-service', () => ({
  fundLifecycleHistoryService: {
    getHistory: vi.fn(),
  },
}));

let app: express.Express;

// ── Fixtures ──

function validEntry() {
  return {
    version: 2,
    publishedAt: '2026-03-20T12:00:00.000Z',
    publishedBy: 1,
    fundSize: 100_000_000,
    numCompanies: 5,
    calcRun: {
      runId: 10,
      status: 'ready' as const,
      dispatchState: 'dispatched' as const,
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      correlationId: 'corr-abc-123',
    },
  };
}

function validHistoryResponse(): FundLifecycleHistoryV1 {
  return {
    fundId: 1,
    entries: [
      validEntry(),
      {
        version: 1,
        publishedAt: '2026-03-15T10:00:00.000Z',
        publishedBy: null,
        fundSize: 80_000_000,
        numCompanies: null,
        calcRun: null,
      },
    ],
  };
}

function emptyHistoryResponse(): FundLifecycleHistoryV1 {
  return {
    fundId: 1,
    entries: [],
  };
}

// ── Setup ──

beforeAll(async () => {
  app = express();
  app.use(express.json());

  const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
  registerFundConfigRoutes(app);
});

beforeEach(async () => {
  const { fundLifecycleHistoryService } = await import(
    '../../../server/services/fund-lifecycle-history-service'
  );
  vi.mocked(fundLifecycleHistoryService.getHistory).mockResolvedValue(validHistoryResponse());
});

// ── Zod schema tests ──

describe('LifecycleHistoryEntrySchema', () => {
  it('parses a valid entry with calcRun', () => {
    const result = LifecycleHistoryEntrySchema.safeParse(validEntry());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(2);
      expect(result.data.calcRun?.runId).toBe(10);
    }
  });

  it('parses a valid entry with null calcRun', () => {
    const entry = {
      version: 1,
      publishedAt: '2026-03-15T10:00:00.000Z',
      publishedBy: null,
      fundSize: null,
      numCompanies: null,
      calcRun: null,
    };
    const result = LifecycleHistoryEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('rejects entry missing required publishedAt field', () => {
    const entry = {
      version: 1,
      publishedBy: null,
      fundSize: null,
      numCompanies: null,
      calcRun: null,
    };
    const result = LifecycleHistoryEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it('rejects entry with unknown extra key (.strict())', () => {
    const entry = {
      ...validEntry(),
      extraField: 'should-fail',
    };
    const result = LifecycleHistoryEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });
});

describe('FundLifecycleHistoryV1Schema', () => {
  it('parses a valid response with multiple entries', () => {
    const result = FundLifecycleHistoryV1Schema.safeParse(validHistoryResponse());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entries).toHaveLength(2);
    }
  });

  it('parses a valid response with empty entries', () => {
    const result = FundLifecycleHistoryV1Schema.safeParse(emptyHistoryResponse());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entries).toHaveLength(0);
    }
  });

  it('rejects response missing fundId', () => {
    const result = FundLifecycleHistoryV1Schema.safeParse({
      entries: [],
    });
    expect(result.success).toBe(false);
  });
});

// ── Route contract tests ──

describe('GET /api/funds/:id/lifecycle-history', () => {
  it('returns 200 with valid FundLifecycleHistoryV1 shape', async () => {
    const res = await request(app).get('/api/funds/1/lifecycle-history');

    expect(res.status).toBe(200);

    const parsed = FundLifecycleHistoryV1Schema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it('returns entries ordered by version DESC with calcRun join', async () => {
    const res = await request(app).get('/api/funds/1/lifecycle-history');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries[0].version).toBe(2);
    expect(res.body.entries[1].version).toBe(1);
    expect(res.body.entries[0].calcRun).not.toBeNull();
    expect(res.body.entries[0].calcRun.runId).toBe(10);
  });

  it('returns empty entries for fund with no publishes', async () => {
    const { fundLifecycleHistoryService } = await import(
      '../../../server/services/fund-lifecycle-history-service'
    );
    vi.mocked(fundLifecycleHistoryService.getHistory).mockResolvedValue(emptyHistoryResponse());

    const res = await request(app).get('/api/funds/1/lifecycle-history');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);

    const parsed = FundLifecycleHistoryV1Schema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it('handles entry with null calcRun', async () => {
    const { fundLifecycleHistoryService } = await import(
      '../../../server/services/fund-lifecycle-history-service'
    );
    vi.mocked(fundLifecycleHistoryService.getHistory).mockResolvedValue({
      fundId: 1,
      entries: [
        {
          version: 1,
          publishedAt: '2026-03-15T10:00:00.000Z',
          publishedBy: null,
          fundSize: null,
          numCompanies: null,
          calcRun: null,
        },
      ],
    });

    const res = await request(app).get('/api/funds/1/lifecycle-history');

    expect(res.status).toBe(200);
    expect(res.body.entries[0].calcRun).toBeNull();
  });

  it('returns 400 for non-integer fund ID', async () => {
    const res = await request(app).get('/api/funds/abc/lifecycle-history');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid fund ID');
  });

  it('returns 400 for floating-point fund ID', async () => {
    const res = await request(app).get('/api/funds/1.5/lifecycle-history');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid fund ID');
  });

  it('returns 404 for unknown fund', async () => {
    const { fundLifecycleHistoryService } = await import(
      '../../../server/services/fund-lifecycle-history-service'
    );
    vi.mocked(fundLifecycleHistoryService.getHistory).mockResolvedValue(null);

    const res = await request(app).get('/api/funds/999/lifecycle-history');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Fund not found');
  });

  it('returns 500 when service throws', async () => {
    const { fundLifecycleHistoryService } = await import(
      '../../../server/services/fund-lifecycle-history-service'
    );
    vi.mocked(fundLifecycleHistoryService.getHistory).mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/api/funds/1/lifecycle-history');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Failed to read lifecycle history');
  });

  it('response has fundId matching the request parameter', async () => {
    const res = await request(app).get('/api/funds/1/lifecycle-history');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('fundId', 1);
  });
});
