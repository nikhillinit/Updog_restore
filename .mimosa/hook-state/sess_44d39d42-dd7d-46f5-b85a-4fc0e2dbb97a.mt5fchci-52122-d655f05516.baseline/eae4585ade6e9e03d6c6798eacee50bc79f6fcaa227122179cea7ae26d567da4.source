/**
 * Integration test: Fund state readback
 *
 * Uses inline Express mount with supertest. The read service is mocked
 * because the DB mock does not include fundConfigs/calcRuns in its query
 * interface. Derivation logic is thoroughly covered by the 14 pure function
 * tests in tests/unit/phase2b/lifecycle-derivation.test.ts.
 *
 * This test validates the full HTTP pipeline: route registration, param
 * parsing, service invocation, error handling, and response shape.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { FundStateReadV1Schema } from '@shared/contracts/fund-state-read-v1.contract';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';

// Mock the read service at module level
vi.mock('../../server/services/fund-state-read-service', () => ({
  fundStateReadService: {
    getState: vi.fn(),
  },
}));

let app: express.Express;

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function stateNotRequested(fundId: number): FundStateReadV1 {
  return {
    fundId,
    configState: {
      latestVersion: null,
      draftVersion: null,
      publishedVersion: null,
      hasDraft: false,
      hasPublished: false,
      publishedAt: null,
      draftUpdatedAt: null,
      publishedUpdatedAt: null,
    },
    calculationState: {
      status: 'not_requested',
      configVersion: null,
      runId: null,
      correlationId: null,
      dispatchState: null,
      availableSnapshotTypes: [],
      expectedSnapshotTypes: ['RESERVE', 'PACING'],
      lastCalculatedAt: null,
      lastError: null,
      legacyEvidence: false,
    },
    legacy: { engineResultsPresent: false },
  };
}

function stateWithDraft(fundId: number): FundStateReadV1 {
  return {
    ...stateNotRequested(fundId),
    configState: {
      latestVersion: 1,
      draftVersion: 1,
      publishedVersion: null,
      hasDraft: true,
      hasPublished: false,
      publishedAt: null,
      draftUpdatedAt: '2026-03-20T12:00:00.000Z',
      publishedUpdatedAt: null,
    },
  };
}

function stateCalculating(fundId: number): FundStateReadV1 {
  return {
    fundId,
    configState: {
      latestVersion: 1,
      draftVersion: null,
      publishedVersion: 1,
      hasDraft: false,
      hasPublished: true,
      publishedAt: '2026-03-20T12:00:00.000Z',
      draftUpdatedAt: null,
      publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
    },
    calculationState: {
      status: 'calculating',
      configVersion: 1,
      runId: 1,
      correlationId: 'corr-calc',
      dispatchState: 'dispatched',
      availableSnapshotTypes: [],
      expectedSnapshotTypes: ['RESERVE', 'PACING'],
      lastCalculatedAt: null,
      lastError: null,
      legacyEvidence: false,
    },
    legacy: { engineResultsPresent: false },
  };
}

function stateReady(fundId: number): FundStateReadV1 {
  return {
    fundId,
    configState: {
      latestVersion: 1,
      draftVersion: null,
      publishedVersion: 1,
      hasDraft: false,
      hasPublished: true,
      publishedAt: '2026-03-20T12:00:00.000Z',
      draftUpdatedAt: null,
      publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
    },
    calculationState: {
      status: 'ready',
      configVersion: 1,
      runId: 1,
      correlationId: 'corr-ready',
      dispatchState: 'dispatched',
      availableSnapshotTypes: ['RESERVE', 'PACING'],
      expectedSnapshotTypes: ['RESERVE', 'PACING'],
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      lastError: null,
      legacyEvidence: false,
    },
    legacy: { engineResultsPresent: false },
  };
}

function stateReadyLegacy(fundId: number): FundStateReadV1 {
  return {
    ...stateReady(fundId),
    calculationState: {
      ...stateReady(fundId).calculationState,
      legacyEvidence: true,
    },
  };
}

function stateWithEngineResults(fundId: number): FundStateReadV1 {
  return {
    ...stateNotRequested(fundId),
    legacy: { engineResultsPresent: true },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  app = express();
  app.use(express.json({ limit: '1mb' }));

  const { registerFundConfigRoutes } = await import('../../server/routes/fund-config');
  registerFundConfigRoutes(app);
});

beforeEach(async () => {
  // Reset mock return values per MEMORY.md (restoreMocks wipes them)
  const { fundStateReadService } = await import('../../server/services/fund-state-read-service');
  vi.mocked(fundStateReadService.getState).mockResolvedValue(stateNotRequested(1));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/funds/:id/state readback', () => {
  // 1. Fresh fund -> not_requested (no published config)
  it('returns not_requested for a fresh fund', async () => {
    const res = await request(app).get('/api/funds/1/state');

    expect(res.status).toBe(200);
    expect(res.body.calculationState.status).toBe('not_requested');
    expect(res.body.configState.hasPublished).toBe(false);

    const parsed = FundStateReadV1Schema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  // 2. Fund with draft -> still not_requested
  it('returns not_requested when only a draft exists', async () => {
    const { fundStateReadService } = await import('../../server/services/fund-state-read-service');
    vi.mocked(fundStateReadService.getState).mockResolvedValue(stateWithDraft(2));

    const res = await request(app).get('/api/funds/2/state');

    expect(res.status).toBe(200);
    expect(res.body.calculationState.status).toBe('not_requested');
    expect(res.body.configState.hasDraft).toBe(true);
    expect(res.body.configState.hasPublished).toBe(false);
  });

  // 3. Published fund -> calculating (queue-less: dispatched with no snapshots)
  it('returns calculating after publish', async () => {
    const { fundStateReadService } = await import('../../server/services/fund-state-read-service');
    vi.mocked(fundStateReadService.getState).mockResolvedValue(stateCalculating(3));

    const res = await request(app).get('/api/funds/3/state');

    expect(res.status).toBe(200);
    expect(res.body.calculationState.status).toBe('calculating');
    expect(res.body.configState.hasPublished).toBe(true);
  });

  // 4. Attributed snapshots -> ready, legacyEvidence=false
  it('returns ready when attributed snapshots cover expected types', async () => {
    const { fundStateReadService } = await import('../../server/services/fund-state-read-service');
    vi.mocked(fundStateReadService.getState).mockResolvedValue(stateReady(4));

    const res = await request(app).get('/api/funds/4/state');

    expect(res.status).toBe(200);
    expect(res.body.calculationState.status).toBe('ready');
    expect(res.body.calculationState.legacyEvidence).toBe(false);
  });

  // 5. lastCalculatedAt from snapshot snapshotTime
  it('includes lastCalculatedAt from snapshot timestamps', async () => {
    const { fundStateReadService } = await import('../../server/services/fund-state-read-service');
    vi.mocked(fundStateReadService.getState).mockResolvedValue(stateReady(5));

    const res = await request(app).get('/api/funds/5/state');

    expect(res.status).toBe(200);
    expect(res.body.calculationState.lastCalculatedAt).toBe('2026-03-20T12:30:00.000Z');
  });

  // 6. Invalid ID -> 400
  it('returns 400 for invalid fund ID', async () => {
    const res = await request(app).get('/api/funds/abc/state');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid fund ID');
  });

  // 7. Non-existent fund -> 404
  it('returns 404 for non-existent fund', async () => {
    const { fundStateReadService } = await import('../../server/services/fund-state-read-service');
    vi.mocked(fundStateReadService.getState).mockResolvedValue(null);

    const res = await request(app).get('/api/funds/999/state');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Fund not found');
  });

  // 8. Fund with engineResults but no snapshots -> not_requested, legacy.engineResultsPresent=true
  it('reports engineResultsPresent in legacy field', async () => {
    const { fundStateReadService } = await import('../../server/services/fund-state-read-service');
    vi.mocked(fundStateReadService.getState).mockResolvedValue(stateWithEngineResults(6));

    const res = await request(app).get('/api/funds/6/state');

    expect(res.status).toBe(200);
    expect(res.body.calculationState.status).toBe('not_requested');
    expect(res.body.legacy.engineResultsPresent).toBe(true);
  });

  // 9. Legacy: unattributed snapshots -> ready, legacyEvidence=true
  it('returns ready with legacyEvidence for pre-Phase2A snapshots', async () => {
    const { fundStateReadService } = await import('../../server/services/fund-state-read-service');
    vi.mocked(fundStateReadService.getState).mockResolvedValue(stateReadyLegacy(7));

    const res = await request(app).get('/api/funds/7/state');

    expect(res.status).toBe(200);
    expect(res.body.calculationState.status).toBe('ready');
    expect(res.body.calculationState.legacyEvidence).toBe(true);
  });
});
