/**
 * HTTP contract test for GET /api/funds/:id/state
 *
 * Mocks fund-state-read-service at module level. Validates HTTP status
 * codes, error shapes, and response conformance to FundStateReadV1Schema.
 *
 * Per MEMORY.md: set mock return values in beforeEach, not at declaration,
 * because restoreMocks wipes them.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { FundStateReadV1Schema } from '@shared/contracts/fund-state-read-v1.contract';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';

// Mock the service module before any imports that use it
vi.mock('../../../server/services/fund-state-read-service', () => ({
  fundStateReadService: {
    getState: vi.fn(),
  },
}));

let app: express.Express;

// Valid response fixture
function validStateResponse(): FundStateReadV1 {
  return {
    fundId: 1,
    configState: {
      latestVersion: 2,
      draftVersion: 2,
      publishedVersion: 1,
      hasDraft: true,
      hasPublished: true,
      publishedAt: '2026-03-20T12:00:00.000Z',
      draftUpdatedAt: '2026-03-20T13:00:00.000Z',
      publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
    },
    calculationState: {
      status: 'ready',
      configVersion: 1,
      runId: 10,
      correlationId: 'test-corr-id',
      dispatchState: 'dispatched',
      availableSnapshotTypes: ['RESERVE', 'PACING'],
      expectedSnapshotTypes: ['RESERVE', 'PACING'],
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      lastError: null,
      legacyEvidence: false,
    },
    legacy: {
      engineResultsPresent: false,
    },
  };
}

beforeAll(async () => {
  app = express();
  app.use(express.json());

  const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
  registerFundConfigRoutes(app);
});

beforeEach(async () => {
  // Re-import mock to set fresh return values (restoreMocks wipes them)
  const { fundStateReadService } = await import('../../../server/services/fund-state-read-service');
  vi.mocked(fundStateReadService.getState).mockResolvedValue(validStateResponse());
});

describe('GET /api/funds/:id/state', () => {
  // 1. 200 with valid FundStateReadV1 shape
  it('returns 200 with valid FundStateReadV1 shape', async () => {
    const res = await request(app).get('/api/funds/1/state');

    expect(res.status).toBe(200);

    // Validate against Zod schema
    const parsed = FundStateReadV1Schema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  // 2. 404 for non-existent fund
  it('returns 404 when service returns null', async () => {
    const { fundStateReadService } =
      await import('../../../server/services/fund-state-read-service');
    vi.mocked(fundStateReadService.getState).mockResolvedValue(null);

    const res = await request(app).get('/api/funds/999/state');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Fund not found');
  });

  // 3. 400 for invalid ID
  it('returns 400 for non-numeric fund ID', async () => {
    const res = await request(app).get('/api/funds/abc/state');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid fund ID');
  });

  // 4. 500 for service error
  it('returns 500 when service throws', async () => {
    const { fundStateReadService } =
      await import('../../../server/services/fund-state-read-service');
    vi.mocked(fundStateReadService.getState).mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/api/funds/1/state');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Failed to read fund state');
  });

  // 5. Response has separate configState and calculationState objects
  it('response has two-axis structure with configState and calculationState', async () => {
    const res = await request(app).get('/api/funds/1/state');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('configState');
    expect(res.body).toHaveProperty('calculationState');
    expect(res.body.configState).toHaveProperty('hasPublished');
    expect(res.body.configState).toHaveProperty('hasDraft');
    expect(res.body.calculationState).toHaveProperty('status');
    expect(res.body.calculationState).toHaveProperty('availableSnapshotTypes');
  });
});
