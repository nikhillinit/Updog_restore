/**
 * Route tests for LP Reporting metric-run preview and commit endpoints.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import {
  MetricRunCommitResponseSchema,
  MetricRunDetailResponseSchema,
  MetricRunDryRunResponseSchema,
  MetricRunEvidenceCreateResponseSchema,
  MetricRunEvidenceListResponseSchema,
  MetricRunLifecycleResponseSchema,
  NarrativeRunCreateResponseSchema,
  NarrativeRunDetailResponseSchema,
  NarrativeRunListResponseSchema,
} from '@shared/contracts/lp-reporting';

const authState = vi.hoisted(() => ({
  authenticated: true,
  userId: 7,
  fundIds: [1, 2] as number[],
}));
const dbState = vi.hoisted(() => ({
  events: [] as MockEventRow[],
  marks: [] as MockMarkRow[],
  metricRuns: [] as MockMetricRunRow[],
  evidenceRecords: [] as MockEvidenceRow[],
  narrativeRuns: [] as MockNarrativeRow[],
  users: [7] as number[],
  insertedMetricRows: [] as unknown[],
  insertedEvidenceRows: [] as unknown[],
  insertedNarrativeRows: [] as unknown[],
  insertCalls: 0,
  nextMetricRunId: 500,
  nextEvidenceId: 1000,
  nextNarrativeId: 2000,
  dropNextInsert: false,
}));
let nextUserId = 800;

vi.mock('../../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
    if (!authState.authenticated) {
      return res.sendStatus(401);
    }
    (req as Request & { user?: { id: number; userId: number; fundIds: number[] } }).user = {
      id: authState.userId,
      userId: authState.userId,
      fundIds: [...authState.fundIds],
    };
    next();
  },
  requireFundAccess: (req: Request, res: Response, next: NextFunction) => {
    const fundIdParam = req.params['fundId'];
    if (!fundIdParam) {
      return res.status(400).json({ error: 'Bad Request' });
    }
    const fundId = Number.parseInt(fundIdParam, 10);
    if (Number.isNaN(fundId)) {
      return next();
    }
    const user = (req as Request & { user?: { fundIds: number[] } }).user;
    const userFundIds = user?.fundIds ?? [];
    if (userFundIds.length === 0 || userFundIds.includes(fundId)) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  },
}));

interface MockEventRow {
  id: number;
  fundId: number;
  eventType: string;
  amount: string;
  eventDate: Date;
  perspective: string;
  status: string | null;
  reversalOfEventId: number | null;
  sourceHash?: string | null;
  importBatchId?: number | null;
  updatedAt?: Date | null;
}

interface MockMarkRow {
  id: number;
  fundId: number;
  fairValue: string;
  markDate: string;
  asOfDate: string;
  status: string | null;
  confidenceLevel: string;
  companyId: number | null;
  sourceHash?: string | null;
  importBatchId?: number | null;
  updatedAt?: Date | null;
}

interface MockMetricRunRow {
  id: number;
  fundId: number;
  runType: string;
  perspective: string;
  asOfDate: string;
  status: string;
  inputsHash: string;
  sourceEventIds?: number[];
  sourceMarkIds?: number[];
  sourceEvidenceIds?: number[];
  generatedBy?: number | null;
  approvedBy?: number | null;
  approvedAt?: Date | null;
  lockedBy?: number | null;
  lockedAt?: Date | null;
  exportedAt?: Date | null;
  version?: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  resultsJson?: unknown;
  diagnosticsJson?: unknown;
}

interface MockEvidenceRow {
  id: number;
  fundId: number;
  valuationMarkId: number | null;
  companyId: number | null;
  metricRunId: number | null;
  narrativeRunId: number | null;
  idempotencyKey: string | null;
  evidenceSource: string;
  sourceDate: string;
  receivedDate: string | null;
  expirationDate: string | null;
  confidenceLevel: string;
  materialityLevel: string;
  confidentiality: string;
  redactionRequired: boolean;
  documentHash: string | null;
  valuationPolicyVersion: string | null;
  description: string | null;
  internalNotes: string | null;
  lpObjection: string | null;
  attachments: unknown[];
  uploadedBy: number | null;
  approvedBy: number | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockNarrativeRow {
  id: number;
  fundId: number;
  metricRunId: number;
  asOfDate: string;
  narrativeType: string;
  generatedText: string;
  editedText: string | null;
  status: string;
  generatedBy: number | null;
  editedBy: number | null;
  approvedBy: number | null;
  approvedAt: Date | null;
  exportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

vi.mock('@shared/schema/lp-reporting-evidence', () => ({
  cashFlowEvents: { _kind: 'cashFlowEvents', id: 'cashFlowEvents.id' },
  valuationMarks: { _kind: 'valuationMarks', id: 'valuationMarks.id' },
  lpMetricRuns: {
    _kind: 'lpMetricRuns',
    id: 'lpMetricRuns.id',
    fundId: 'lpMetricRuns.fundId',
    runType: 'lpMetricRuns.runType',
    perspective: 'lpMetricRuns.perspective',
    asOfDate: 'lpMetricRuns.asOfDate',
    status: 'lpMetricRuns.status',
    inputsHash: 'lpMetricRuns.inputsHash',
    sourceEventIds: 'lpMetricRuns.sourceEventIds',
    sourceMarkIds: 'lpMetricRuns.sourceMarkIds',
    sourceEvidenceIds: 'lpMetricRuns.sourceEvidenceIds',
    generatedBy: 'lpMetricRuns.generatedBy',
    approvedBy: 'lpMetricRuns.approvedBy',
    approvedAt: 'lpMetricRuns.approvedAt',
    lockedBy: 'lpMetricRuns.lockedBy',
    lockedAt: 'lpMetricRuns.lockedAt',
    exportedAt: 'lpMetricRuns.exportedAt',
    version: 'lpMetricRuns.version',
    createdAt: 'lpMetricRuns.createdAt',
    updatedAt: 'lpMetricRuns.updatedAt',
  },
  evidenceRecords: {
    _kind: 'evidenceRecords',
    id: 'evidenceRecords.id',
    fundId: 'evidenceRecords.fundId',
    metricRunId: 'evidenceRecords.metricRunId',
    idempotencyKey: 'evidenceRecords.idempotencyKey',
  },
  narrativeRuns: {
    _kind: 'narrativeRuns',
    id: 'narrativeRuns.id',
    fundId: 'narrativeRuns.fundId',
    metricRunId: 'narrativeRuns.metricRunId',
    narrativeType: 'narrativeRuns.narrativeType',
  },
}));

vi.mock('@shared/schema/user', () => ({
  users: { _kind: 'users', id: 'users.id' },
}));

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = (count: number) => Promise.resolve(rows.slice(0, count));
  return promise;
}

function makeMetricResults() {
  return {
    asOfDate: '2026-03-31',
    currency: 'USD',
    dpi: '0.250000',
    rvpi: '1.000000',
    tvpi: '1.250000',
    moic: '1.250000',
    netIrr: '0.110000',
    grossIrr: '0.140000',
    xirrDiagnostic: {
      net: {
        convergence: 'converged',
        iterations: 5,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
      gross: {
        convergence: 'converged',
        iterations: 4,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
    },
    contributionsTotal: '4000000.000000',
    distributionsTotal: '1000000.000000',
    currentNav: '4000000.000000',
    markConfidenceMix: { high: 1, medium: 0, low: 0 },
  };
}

function makeMetricDiagnostics() {
  return {
    engineVersion: 'lp-reporting-engine@1.2.0',
    decimalPrecision: 6,
    excludedFutureMarks: [],
    warnings: [],
  };
}

function makeNarrativeRow(overrides: Partial<MockNarrativeRow> = {}): MockNarrativeRow {
  return {
    id: 2000,
    fundId: 1,
    metricRunId: 500,
    asOfDate: '2026-03-31',
    narrativeType: 'methodology',
    generatedText: 'Methodology draft as of 2026-03-31.',
    editedText: null,
    status: 'draft',
    generatedBy: authState.userId,
    editedBy: null,
    approvedBy: null,
    approvedAt: null,
    exportedAt: null,
    createdAt: new Date('2026-05-10T00:00:00Z'),
    updatedAt: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

function rowsFor(table: { _kind?: string }): Array<Record<string, unknown>> {
  if (table?._kind === 'cashFlowEvents') {
    return [...dbState.events] as unknown as Array<Record<string, unknown>>;
  }
  if (table?._kind === 'valuationMarks') {
    return [...dbState.marks] as unknown as Array<Record<string, unknown>>;
  }
  if (table?._kind === 'users') {
    return dbState.users.map((id) => ({ id }));
  }
  if (table?._kind === 'lpMetricRuns') {
    return dbState.metricRuns.map((row) => ({
      id: row.id,
      fundId: row.fundId,
      runType: row.runType,
      perspective: row.perspective,
      asOfDate: row.asOfDate,
      status: row.status,
      inputsHash: row.inputsHash,
      sourceEventIds: row.sourceEventIds ?? [],
      sourceMarkIds: row.sourceMarkIds ?? [],
      sourceEvidenceIds: row.sourceEvidenceIds ?? [],
      resultsJson: row.resultsJson ?? makeMetricResults(),
      diagnosticsJson: row.diagnosticsJson ?? makeMetricDiagnostics(),
      methodologyVersion: 'lp-reporting-methodology-v1',
      calculationVersion: 'lp-reporting-metrics-engine-1.0.0',
      generatedBy: row.generatedBy ?? authState.userId,
      approvedBy: row.approvedBy ?? null,
      approvedAt: row.approvedAt ?? null,
      lockedBy: row.lockedBy ?? null,
      lockedAt: row.lockedAt ?? null,
      exportedAt: row.exportedAt ?? null,
      version: row.version ?? 1,
      createdAt: row.createdAt ?? new Date('2026-05-10T00:00:00Z'),
      updatedAt: row.updatedAt ?? new Date('2026-05-10T00:00:00Z'),
    }));
  }
  if (table?._kind === 'evidenceRecords') {
    return [...dbState.evidenceRecords] as unknown as Array<Record<string, unknown>>;
  }
  if (table?._kind === 'narrativeRuns') {
    return [...dbState.narrativeRuns] as unknown as Array<Record<string, unknown>>;
  }
  return [];
}

vi.mock('../../../../server/db', () => {
  const dbMock = {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(dbMock)),
    execute: vi.fn(async () => []),
    update: vi.fn((table: { _kind?: string }) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (table?._kind !== 'lpMetricRuns') {
              return [];
            }
            const current = dbState.metricRuns.find((row) => row.id === 500 && row.fundId === 1);
            if (!current) {
              return [];
            }
            const nextVersion =
              typeof values['version'] === 'number' ? (values['version'] as number) : undefined;
            const expectedVersion = nextVersion !== undefined ? nextVersion - 1 : current.version;
            const validApprove =
              values['status'] === 'approved' &&
              current.status === 'draft' &&
              (current.version ?? 1) === expectedVersion;
            const validLock =
              values['status'] === 'locked' &&
              current.status === 'approved' &&
              (current.version ?? 1) === expectedVersion;
            if (!validApprove && !validLock) {
              return [];
            }
            const updated = { ...current, ...values } as MockMetricRunRow;
            dbState.metricRuns = dbState.metricRuns.map((row) =>
              row.id === updated.id ? updated : row
            );
            return rowsFor({ _kind: 'lpMetricRuns' }).filter((row) => row['id'] === updated.id);
          }),
        })),
      })),
    })),
    insert: vi.fn((table: { _kind?: string }) => {
      dbState.insertCalls += 1;
      return {
        values: vi.fn((row: Record<string, unknown>) => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => {
              if (dbState.dropNextInsert) {
                dbState.dropNextInsert = false;
                return [];
              }
              if (table?._kind === 'evidenceRecords') {
                const id = dbState.nextEvidenceId++;
                const evidenceRow: MockEvidenceRow = {
                  id,
                  fundId: row['fundId'] as number,
                  valuationMarkId: (row['valuationMarkId'] as number | undefined) ?? null,
                  companyId: (row['companyId'] as number | undefined) ?? null,
                  metricRunId: (row['metricRunId'] as number | undefined) ?? null,
                  narrativeRunId: (row['narrativeRunId'] as number | undefined) ?? null,
                  idempotencyKey: (row['idempotencyKey'] as string | undefined) ?? null,
                  evidenceSource: row['evidenceSource'] as string,
                  sourceDate: row['sourceDate'] as string,
                  receivedDate: (row['receivedDate'] as string | undefined) ?? null,
                  expirationDate: (row['expirationDate'] as string | undefined) ?? null,
                  confidenceLevel: row['confidenceLevel'] as string,
                  materialityLevel: row['materialityLevel'] as string,
                  confidentiality: row['confidentiality'] as string,
                  redactionRequired: row['redactionRequired'] as boolean,
                  documentHash: (row['documentHash'] as string | undefined) ?? null,
                  valuationPolicyVersion:
                    (row['valuationPolicyVersion'] as string | undefined) ?? null,
                  description: (row['description'] as string | undefined) ?? null,
                  internalNotes: (row['internalNotes'] as string | undefined) ?? null,
                  lpObjection: (row['lpObjection'] as string | undefined) ?? null,
                  attachments: (row['attachments'] as unknown[] | undefined) ?? [],
                  uploadedBy: (row['uploadedBy'] as number | undefined) ?? null,
                  approvedBy: null,
                  approvedAt: null,
                  createdAt: new Date('2026-05-10T00:00:00Z'),
                  updatedAt: new Date('2026-05-10T00:00:00Z'),
                };
                dbState.evidenceRecords.push(evidenceRow);
                dbState.insertedEvidenceRows.push(row);
                return [evidenceRow];
              }
              if (table?._kind === 'narrativeRuns') {
                const existing = dbState.narrativeRuns.find(
                  (candidate) =>
                    candidate.metricRunId === row['metricRunId'] &&
                    candidate.narrativeType === row['narrativeType']
                );
                if (existing) {
                  return [];
                }
                const id = dbState.nextNarrativeId++;
                const narrativeRow = makeNarrativeRow({
                  id,
                  fundId: row['fundId'] as number,
                  metricRunId: row['metricRunId'] as number,
                  asOfDate: row['asOfDate'] as string,
                  narrativeType: row['narrativeType'] as string,
                  generatedText: row['generatedText'] as string,
                  editedText: (row['editedText'] as string | undefined) ?? null,
                  status: (row['status'] as string | undefined) ?? 'draft',
                  generatedBy: (row['generatedBy'] as number | undefined) ?? null,
                });
                dbState.narrativeRuns.push(narrativeRow);
                if (dbState.dropNextInsert) {
                  dbState.dropNextInsert = false;
                  return [];
                }
                dbState.insertedNarrativeRows.push(row);
                return [narrativeRow];
              }
              if (table?._kind !== 'lpMetricRuns') {
                return [];
              }
              const id = dbState.nextMetricRunId++;
              const metricRun = {
                id,
                fundId: row['fundId'] as number,
                runType: row['runType'] as string,
                perspective: row['perspective'] as string,
                asOfDate: row['asOfDate'] as string,
                status: row['status'] as string,
                inputsHash: row['inputsHash'] as string,
                sourceEventIds: (row['sourceEventIds'] as number[] | undefined) ?? [],
                sourceMarkIds: (row['sourceMarkIds'] as number[] | undefined) ?? [],
                sourceEvidenceIds: (row['sourceEvidenceIds'] as number[] | undefined) ?? [],
                generatedBy: (row['generatedBy'] as number | undefined) ?? authState.userId,
                version: 1,
                createdAt: new Date('2026-05-10T00:00:00Z'),
                updatedAt: new Date('2026-05-10T00:00:00Z'),
              };
              dbState.metricRuns.push(metricRun);
              dbState.insertedMetricRows.push(row);
              return [{ id, status: metricRun.status, inputsHash: metricRun.inputsHash }];
            }),
          })),
        })),
      };
    }),
    select: vi.fn(() => ({
      from: vi.fn((table: { _kind?: string }) => ({
        where: vi.fn(() => queryResult(rowsFor(table))),
      })),
    })),
  };
  return { db: dbMock };
});

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    and: vi.fn((...conditions: unknown[]) => ({ _op: 'and', conditions })),
    eq: vi.fn((left: unknown, right: unknown) => ({ _op: 'eq', left, right })),
    inArray: vi.fn((left: unknown, right: unknown) => ({ _op: 'inArray', left, right })),
  };
});

import metricRunsRouter from '../../../../server/routes/lp-reporting/metric-runs';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '512kb' }));
  app.use(metricRunsRouter);
  return app;
}

function seedHappyPathFixture(fundId: number): { eventIds: number[]; markIds: number[] } {
  dbState.events = [
    {
      id: 101,
      fundId,
      eventType: 'lp_capital_call',
      amount: '4000000.000000',
      eventDate: new Date('2024-01-15T00:00:00Z'),
      perspective: 'lp_net',
      status: 'approved',
      reversalOfEventId: null,
      sourceHash: '1'.repeat(64),
      importBatchId: 1,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 102,
      fundId,
      eventType: 'lp_distribution',
      amount: '1000000.000000',
      eventDate: new Date('2025-06-30T00:00:00Z'),
      perspective: 'lp_net',
      status: 'approved',
      reversalOfEventId: null,
      sourceHash: '2'.repeat(64),
      importBatchId: 1,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
  ];
  dbState.marks = [
    {
      id: 201,
      fundId,
      fairValue: '4000000.000000',
      markDate: '2026-03-31',
      asOfDate: '2026-03-31',
      status: 'approved',
      confidenceLevel: 'high',
      companyId: 42,
      sourceHash: '3'.repeat(64),
      importBatchId: 2,
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    },
  ];
  return { eventIds: [101, 102], markIds: [201] };
}

function dryRunBody(eventIds: number[] = [], markIds: number[] = []) {
  return {
    asOfDate: '2026-03-31',
    runType: 'quarterly_report',
    perspective: 'lp_net',
    sourceEventIds: eventIds,
    sourceMarkIds: markIds,
  };
}

function evidenceBody() {
  return {
    idempotencyKey: 'metric-run-500-evidence-0',
    evidenceSource: 'board_update',
    sourceDate: '2026-03-31',
    materialityLevel: 'high',
    description: 'Q1 board materials',
  };
}

function seedLockedMetricRun(overrides: Partial<MockMetricRunRow> = {}) {
  dbState.metricRuns.push({
    id: 500,
    fundId: 1,
    runType: 'quarterly_report',
    perspective: 'lp_net',
    asOfDate: '2026-03-31',
    status: 'locked',
    inputsHash: 'a'.repeat(64),
    sourceEventIds: [101, 102],
    sourceMarkIds: [201],
    sourceEvidenceIds: [1000],
    lockedBy: authState.userId,
    lockedAt: new Date('2026-05-10T02:00:00Z'),
    version: 3,
    ...overrides,
  });
}

beforeEach(() => {
  authState.authenticated = true;
  authState.userId = nextUserId++;
  authState.fundIds = [1, 2];
  dbState.events = [];
  dbState.marks = [];
  dbState.metricRuns = [];
  dbState.evidenceRecords = [];
  dbState.narrativeRuns = [];
  dbState.users = [authState.userId];
  dbState.insertedMetricRows = [];
  dbState.insertedEvidenceRows = [];
  dbState.insertedNarrativeRows = [];
  dbState.insertCalls = 0;
  dbState.nextMetricRunId = 500;
  dbState.nextEvidenceId = 1000;
  dbState.nextNarrativeId = 2000;
  dbState.dropNextInsert = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/funds/:fundId/metric-runs/dry-run', () => {
  it('returns 401 when unauthenticated', async () => {
    authState.authenticated = false;
    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/dry-run')
      .send(dryRunBody());
    expect(res.status).toBe(401);
  });

  it('returns 403 on cross-fund access', async () => {
    const res = await request(buildApp())
      .post('/api/funds/99/metric-runs/dry-run')
      .send(dryRunBody());
    expect(res.status).toBe(403);
  });

  it('returns 403 CROSS_FUND_RESOURCE when an event row belongs to a different fund', async () => {
    dbState.events = [
      {
        id: 999,
        fundId: 7,
        eventType: 'lp_capital_call',
        amount: '1000000.000000',
        eventDate: new Date('2024-01-15T00:00:00Z'),
        perspective: 'lp_net',
        status: 'approved',
        reversalOfEventId: null,
      },
    ];
    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/dry-run')
      .send(dryRunBody([999], []));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CROSS_FUND_RESOURCE');
  });

  it('returns 400 INVALID_REQUEST_BODY when asOfDate is missing', async () => {
    const res = await request(buildApp()).post('/api/funds/1/metric-runs/dry-run').send({
      runType: 'quarterly_report',
      perspective: 'lp_net',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST_BODY');
  });

  it('returns 400 INVALID_FUND_ID when :fundId is not numeric', async () => {
    const res = await request(buildApp())
      .post('/api/funds/abc/metric-runs/dry-run')
      .send(dryRunBody());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FUND_ID');
  });

  it("returns 400 UNSUPPORTED_PERSPECTIVE when perspective='vehicle'", async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/dry-run')
      .send({
        ...dryRunBody(),
        perspective: 'vehicle',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('UNSUPPORTED_PERSPECTIVE');
  });

  it('returns a valid dry-run envelope on the happy path without inserting', async () => {
    const { eventIds, markIds } = seedHappyPathFixture(1);
    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/dry-run')
      .send(dryRunBody(eventIds, markIds));

    expect(res.status).toBe(200);
    const parsed = MetricRunDryRunResponseSchema.parse(res.body);
    expect(parsed.results.dpi).toBe('0.250000');
    expect(parsed.results.tvpi).toBe('1.250000');
    expect(parsed.previewHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(dbState.insertCalls).toBe(0);
  });

  it('returns 429 after 20 successful calls within the rate-limit window', async () => {
    authState.userId = nextUserId++;
    dbState.users = [authState.userId];
    const app = buildApp();
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post('/api/funds/1/metric-runs/dry-run').send(dryRunBody());
      expect(res.status).toBe(200);
    }

    const limited = await request(app).post('/api/funds/1/metric-runs/dry-run').send(dryRunBody());
    expect(limited.status).toBe(429);
  });
});

describe('POST /api/funds/:fundId/metric-runs/commit', () => {
  it('requires authentication', async () => {
    authState.authenticated = false;
    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/commit')
      .send({
        ...dryRunBody(),
        previewHash: 'a'.repeat(64),
      });
    expect(res.status).toBe(401);
  });

  it('requires fund access', async () => {
    const res = await request(buildApp())
      .post('/api/funds/99/metric-runs/commit')
      .send({
        ...dryRunBody(),
        previewHash: 'a'.repeat(64),
      });
    expect(res.status).toBe(403);
  });

  it('rejects invalid body shape', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/commit')
      .send(dryRunBody());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST_BODY');
  });

  it("rejects unsupported perspective='vehicle'", async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/commit')
      .send({
        ...dryRunBody(),
        perspective: 'vehicle',
        previewHash: 'a'.repeat(64),
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('UNSUPPORTED_PERSPECTIVE');
    expect(dbState.insertCalls).toBe(0);
  });

  it('returns 201 and writes one draft row for a first successful commit', async () => {
    const { eventIds, markIds } = seedHappyPathFixture(1);
    const app = buildApp();
    const preview = await request(app)
      .post('/api/funds/1/metric-runs/dry-run')
      .send(dryRunBody(eventIds, markIds));
    const previewBody = MetricRunDryRunResponseSchema.parse(preview.body);

    const res = await request(app)
      .post('/api/funds/1/metric-runs/commit')
      .send({ ...dryRunBody(eventIds, markIds), previewHash: previewBody.previewHash });

    expect(res.status).toBe(201);
    const parsed = MetricRunCommitResponseSchema.parse(res.body);
    expect(parsed.metricRunId).toBe(500);
    expect(parsed.status).toBe('draft');
    expect(parsed.inputsHash).toBe(previewBody.inputsHash);
    expect(parsed.previewHash).toBe(previewBody.previewHash);
    expect(parsed.inserted).toBe(true);
    expect(dbState.insertedMetricRows).toHaveLength(1);
  });

  it('returns 200 for an idempotent existing commit', async () => {
    const { eventIds, markIds } = seedHappyPathFixture(1);
    const app = buildApp();
    const preview = await request(app)
      .post('/api/funds/1/metric-runs/dry-run')
      .send(dryRunBody(eventIds, markIds));
    const previewBody = MetricRunDryRunResponseSchema.parse(preview.body);
    dbState.metricRuns.push({
      id: 900,
      fundId: 1,
      runType: 'quarterly_report',
      perspective: 'lp_net',
      asOfDate: '2026-03-31',
      status: 'draft',
      inputsHash: previewBody.inputsHash,
    });

    const res = await request(app)
      .post('/api/funds/1/metric-runs/commit')
      .send({ ...dryRunBody(eventIds, markIds), previewHash: previewBody.previewHash });

    expect(res.status).toBe(200);
    const parsed = MetricRunCommitResponseSchema.parse(res.body);
    expect(parsed.metricRunId).toBe(900);
    expect(parsed.inserted).toBe(false);
    expect(dbState.insertedMetricRows).toHaveLength(0);
  });

  it('returns 409 PREVIEW_HASH_MISMATCH when a source row changes after preview', async () => {
    const { eventIds, markIds } = seedHappyPathFixture(1);
    const app = buildApp();
    const preview = await request(app)
      .post('/api/funds/1/metric-runs/dry-run')
      .send(dryRunBody(eventIds, markIds));
    const previewBody = MetricRunDryRunResponseSchema.parse(preview.body);
    dbState.events[0] = { ...dbState.events[0]!, amount: '4500000.000000' };

    const res = await request(app)
      .post('/api/funds/1/metric-runs/commit')
      .send({ ...dryRunBody(eventIds, markIds), previewHash: previewBody.previewHash });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PREVIEW_HASH_MISMATCH');
    expect(dbState.insertedMetricRows).toHaveLength(0);
  });

  it('returns 401 AUTH_USER_ID_UNRESOLVED when the numeric app user is missing', async () => {
    const { eventIds, markIds } = seedHappyPathFixture(1);
    const app = buildApp();
    const preview = await request(app)
      .post('/api/funds/1/metric-runs/dry-run')
      .send(dryRunBody(eventIds, markIds));
    const previewBody = MetricRunDryRunResponseSchema.parse(preview.body);
    dbState.users = [];

    const res = await request(app)
      .post('/api/funds/1/metric-runs/commit')
      .send({ ...dryRunBody(eventIds, markIds), previewHash: previewBody.previewHash });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_USER_ID_UNRESOLVED');
    expect(dbState.insertedMetricRows).toHaveLength(0);
  });
});

describe('metric-run evidence routes', () => {
  it('POST creates metadata-only evidence for a draft metric run', async () => {
    dbState.metricRuns.push({
      id: 500,
      fundId: 1,
      runType: 'quarterly_report',
      perspective: 'lp_net',
      asOfDate: '2026-03-31',
      status: 'draft',
      inputsHash: 'a'.repeat(64),
    });

    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/evidence-records')
      .send(evidenceBody());

    expect(res.status).toBe(201);
    const parsed = MetricRunEvidenceCreateResponseSchema.parse(res.body);
    expect(parsed.inserted).toBe(true);
    expect(parsed.record.metricRunId).toBe(500);
    expect(parsed.record.uploadedBy).toBe(authState.userId);
    expect(dbState.insertedEvidenceRows).toHaveLength(1);
    expect(dbState.insertedEvidenceRows[0]).toMatchObject({
      fundId: 1,
      metricRunId: 500,
      uploadedBy: authState.userId,
      idempotencyKey: 'metric-run-500-evidence-0',
      attachments: [],
    });
  });

  it('POST rejects route-owned fields in the request body', async () => {
    dbState.metricRuns.push({
      id: 500,
      fundId: 1,
      runType: 'quarterly_report',
      perspective: 'lp_net',
      asOfDate: '2026-03-31',
      status: 'draft',
      inputsHash: 'a'.repeat(64),
    });

    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/evidence-records')
      .send({ ...evidenceBody(), metricRunId: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST_BODY');
    expect(dbState.insertedEvidenceRows).toHaveLength(0);
  });

  it('POST returns 409 METRIC_RUN_NOT_EDITABLE for approved metric runs', async () => {
    dbState.metricRuns.push({
      id: 500,
      fundId: 1,
      runType: 'quarterly_report',
      perspective: 'lp_net',
      asOfDate: '2026-03-31',
      status: 'approved',
      inputsHash: 'a'.repeat(64),
    });

    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/evidence-records')
      .send(evidenceBody());

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('METRIC_RUN_NOT_EDITABLE');
    expect(dbState.insertedEvidenceRows).toHaveLength(0);
  });

  it('GET lists evidence for locked metric runs', async () => {
    dbState.metricRuns.push({
      id: 500,
      fundId: 1,
      runType: 'quarterly_report',
      perspective: 'lp_net',
      asOfDate: '2026-03-31',
      status: 'locked',
      inputsHash: 'a'.repeat(64),
    });
    dbState.evidenceRecords.push({
      id: 1000,
      fundId: 1,
      valuationMarkId: null,
      companyId: null,
      metricRunId: 500,
      narrativeRunId: null,
      idempotencyKey: 'metric-run-500-evidence-0',
      evidenceSource: 'board_update',
      sourceDate: '2026-03-31',
      receivedDate: null,
      expirationDate: null,
      confidenceLevel: 'medium',
      materialityLevel: 'high',
      confidentiality: 'internal',
      redactionRequired: false,
      documentHash: null,
      valuationPolicyVersion: null,
      description: 'Q1 board materials',
      internalNotes: null,
      lpObjection: null,
      attachments: [],
      uploadedBy: authState.userId,
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date('2026-05-10T00:00:00Z'),
      updatedAt: new Date('2026-05-10T00:00:00Z'),
    });

    const res = await request(buildApp()).get('/api/funds/1/metric-runs/500/evidence-records');

    expect(res.status).toBe(200);
    const parsed = MetricRunEvidenceListResponseSchema.parse(res.body);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]?.idempotencyKey).toBe('metric-run-500-evidence-0');
  });
});

describe('metric-run narrative routes', () => {
  it('POST creates a narrative draft for a locked metric run', async () => {
    seedLockedMetricRun();

    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/narrative-runs')
      .send({ narrativeType: 'methodology' });

    expect(res.status).toBe(201);
    const parsed = NarrativeRunCreateResponseSchema.parse(res.body);
    expect(parsed.inserted).toBe(true);
    expect(parsed.record.metricRunId).toBe(500);
    expect(parsed.record.narrativeType).toBe('methodology');
    expect(parsed.record.generatedBy).toBe(authState.userId);
    expect(parsed.record.generatedText).toContain('Engine version: lp-reporting-engine@1.2.0');
    expect(dbState.insertedNarrativeRows).toHaveLength(1);
    expect(dbState.insertedNarrativeRows[0]).toMatchObject({
      fundId: 1,
      metricRunId: 500,
      asOfDate: '2026-03-31',
      narrativeType: 'methodology',
      generatedBy: authState.userId,
      status: 'draft',
    });
    expect(dbState.insertedNarrativeRows[0]).not.toHaveProperty('approvedAt');
    expect(dbState.insertedNarrativeRows[0]).not.toHaveProperty('exportedAt');
  });

  it('POST returns 200 for duplicate narrative create without mutating text', async () => {
    seedLockedMetricRun();
    dbState.narrativeRuns.push(
      makeNarrativeRow({
        id: 2001,
        metricRunId: 500,
        narrativeType: 'no_dpi',
        generatedText: 'Existing no DPI draft.',
      })
    );

    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/narrative-runs')
      .send({ narrativeType: 'no_dpi' });

    expect(res.status).toBe(200);
    const parsed = NarrativeRunCreateResponseSchema.parse(res.body);
    expect(parsed.inserted).toBe(false);
    expect(parsed.record.generatedText).toBe('Existing no DPI draft.');
    expect(dbState.insertedNarrativeRows).toHaveLength(0);
  });

  it('POST rejects route-owned fields and unlocked metric runs', async () => {
    seedLockedMetricRun({ status: 'approved' });

    const invalidBody = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/narrative-runs')
      .send({ narrativeType: 'no_dpi', metricRunId: 500 });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.error).toBe('INVALID_REQUEST_BODY');

    const unlocked = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/narrative-runs')
      .send({ narrativeType: 'no_dpi' });
    expect(unlocked.status).toBe(409);
    expect(unlocked.body.error).toBe('METRIC_RUN_NOT_LOCKED');
    expect(dbState.insertedNarrativeRows).toHaveLength(0);
  });

  it('POST returns AUTH_USER_ID_UNRESOLVED when the numeric app user is missing', async () => {
    seedLockedMetricRun();
    dbState.users = [];

    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/narrative-runs')
      .send({ narrativeType: 'risk_disclosure' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_USER_ID_UNRESOLVED');
    expect(dbState.insertedNarrativeRows).toHaveLength(0);
  });

  it('GET lists route-scoped narrative drafts', async () => {
    seedLockedMetricRun();
    dbState.narrativeRuns.push(
      makeNarrativeRow({ id: 2001, metricRunId: 500, narrativeType: 'risk_disclosure' }),
      makeNarrativeRow({ id: 2002, metricRunId: 500, narrativeType: 'no_dpi' }),
      makeNarrativeRow({ id: 2003, metricRunId: 501, narrativeType: 'methodology' })
    );

    const res = await request(buildApp()).get('/api/funds/1/metric-runs/500/narrative-runs');

    expect(res.status).toBe(200);
    const parsed = NarrativeRunListResponseSchema.parse(res.body);
    expect(parsed.records.map((record) => record.narrativeType)).toEqual([
      'no_dpi',
      'risk_disclosure',
    ]);
  });

  it('GET detail returns the route-scoped narrative and 404s cross-metric reads', async () => {
    seedLockedMetricRun();
    dbState.narrativeRuns.push(
      makeNarrativeRow({ id: 2001, metricRunId: 500, narrativeType: 'portfolio_update' }),
      makeNarrativeRow({ id: 2002, metricRunId: 501, narrativeType: 'portfolio_update' })
    );

    const detail = await request(buildApp()).get(
      '/api/funds/1/metric-runs/500/narrative-runs/2001'
    );
    expect(detail.status).toBe(200);
    expect(NarrativeRunDetailResponseSchema.parse(detail.body).record.narrativeRunId).toBe(2001);

    const crossMetric = await request(buildApp()).get(
      '/api/funds/1/metric-runs/500/narrative-runs/2002'
    );
    expect(crossMetric.status).toBe(404);
    expect(crossMetric.body.error).toBe('NARRATIVE_RUN_NOT_FOUND');
  });

  it('returns 400 INVALID_NARRATIVE_RUN_ID for invalid detail IDs', async () => {
    seedLockedMetricRun();

    const res = await request(buildApp()).get('/api/funds/1/metric-runs/500/narrative-runs/abc');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_NARRATIVE_RUN_ID');
  });
});

describe('metric-run lifecycle routes', () => {
  it('GET latest requires exact metric-run context filters', async () => {
    const res = await request(buildApp()).get('/api/funds/1/metric-runs/latest');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST_QUERY');
  });

  it('GET latest returns null when no exact context matches', async () => {
    dbState.metricRuns.push({
      id: 500,
      fundId: 1,
      runType: 'fundraise_pack',
      perspective: 'lp_net',
      asOfDate: '2026-03-31',
      status: 'draft',
      inputsHash: 'a'.repeat(64),
    });

    const res = await request(buildApp()).get(
      '/api/funds/1/metric-runs/latest?runType=quarterly_report&perspective=lp_net&asOfDate=2026-03-31'
    );

    expect(res.status).toBe(200);
    expect(res.body.metricRun).toBeNull();
  });

  it('GET detail returns the requested committed metric run by ID', async () => {
    dbState.metricRuns.push(
      {
        id: 500,
        fundId: 1,
        runType: 'quarterly_report',
        perspective: 'lp_net',
        asOfDate: '2026-03-31',
        status: 'draft',
        inputsHash: 'a'.repeat(64),
        version: 1,
      },
      {
        id: 501,
        fundId: 1,
        runType: 'quarterly_report',
        perspective: 'lp_net',
        asOfDate: '2026-03-31',
        status: 'approved',
        inputsHash: 'b'.repeat(64),
        version: 2,
        createdAt: new Date('2026-05-11T00:00:00Z'),
      }
    );
    dbState.evidenceRecords.push({
      ...evidenceBody(),
      id: 1000,
      fundId: 1,
      valuationMarkId: null,
      companyId: null,
      metricRunId: 500,
      narrativeRunId: null,
      receivedDate: null,
      expirationDate: null,
      confidenceLevel: 'medium',
      confidentiality: 'internal',
      redactionRequired: false,
      documentHash: null,
      valuationPolicyVersion: null,
      internalNotes: null,
      lpObjection: null,
      attachments: [],
      uploadedBy: authState.userId,
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date('2026-05-10T00:00:00Z'),
      updatedAt: new Date('2026-05-10T00:00:00Z'),
    } as MockEvidenceRow);

    const res = await request(buildApp()).get('/api/funds/1/metric-runs/500');

    expect(res.status).toBe(200);
    const parsed = MetricRunDetailResponseSchema.parse(res.body);
    expect(parsed.metricRunId).toBe(500);
    expect(parsed.status).toBe('draft');
    expect(parsed.evidenceCount).toBe(1);
  });

  it('POST approve returns lifecycle response and snapshots evidence IDs', async () => {
    dbState.metricRuns.push({
      id: 500,
      fundId: 1,
      runType: 'quarterly_report',
      perspective: 'lp_net',
      asOfDate: '2026-03-31',
      status: 'draft',
      inputsHash: 'a'.repeat(64),
      version: 1,
    });
    dbState.evidenceRecords.push({
      ...evidenceBody(),
      id: 1000,
      fundId: 1,
      valuationMarkId: null,
      companyId: null,
      metricRunId: 500,
      narrativeRunId: null,
      receivedDate: null,
      expirationDate: null,
      confidenceLevel: 'medium',
      confidentiality: 'internal',
      redactionRequired: false,
      documentHash: null,
      valuationPolicyVersion: null,
      internalNotes: null,
      lpObjection: null,
      attachments: [],
      uploadedBy: authState.userId,
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date('2026-05-10T00:00:00Z'),
      updatedAt: new Date('2026-05-10T00:00:00Z'),
    } as MockEvidenceRow);

    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/approve')
      .send({ expectedVersion: 1 });

    expect(res.status).toBe(200);
    const parsed = MetricRunLifecycleResponseSchema.parse(res.body);
    expect(parsed.changed).toBe(true);
    expect(parsed.metricRun.status).toBe('approved');
    expect(parsed.metricRun.version).toBe(2);
    expect(parsed.metricRun.sourceEvidenceIds).toEqual([1000]);
  });

  it('POST approve returns 409 when evidence is missing', async () => {
    dbState.metricRuns.push({
      id: 500,
      fundId: 1,
      runType: 'quarterly_report',
      perspective: 'lp_net',
      asOfDate: '2026-03-31',
      status: 'draft',
      inputsHash: 'a'.repeat(64),
      version: 1,
    });

    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/approve')
      .send({ expectedVersion: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('METRIC_RUN_EVIDENCE_REQUIRED');
  });

  it('POST lock returns lifecycle response for approved metric runs', async () => {
    dbState.metricRuns.push({
      id: 500,
      fundId: 1,
      runType: 'quarterly_report',
      perspective: 'lp_net',
      asOfDate: '2026-03-31',
      status: 'approved',
      inputsHash: 'a'.repeat(64),
      sourceEvidenceIds: [1000],
      approvedBy: authState.userId,
      approvedAt: new Date('2026-05-10T00:00:00Z'),
      version: 2,
    });

    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/500/lock')
      .send({ expectedVersion: 2 });

    expect(res.status).toBe(200);
    const parsed = MetricRunLifecycleResponseSchema.parse(res.body);
    expect(parsed.metricRun.status).toBe('locked');
    expect(parsed.metricRun.lockedBy).toBe(authState.userId);
    expect(parsed.metricRun.version).toBe(3);
  });
});

describe('Source grep -- metric-run route boundaries', () => {
  const routerSource = fs.readFileSync(
    path.join(process.cwd(), 'server', 'routes', 'lp-reporting', 'metric-runs.ts'),
    'utf8'
  );

  it('declares scoped metric-run endpoints only', () => {
    const paths =
      routerSource
        .match(/router\.post\(\s*['"]([^'"]+)['"]/g)
        ?.map((match) => match.replace(/router\.post\(\s*['"]/, '').replace(/['"]$/, '')) ?? [];

    expect(paths).toEqual([
      '/api/funds/:fundId/metric-runs/dry-run',
      '/api/funds/:fundId/metric-runs/commit',
      '/api/funds/:fundId/metric-runs/:metricRunId/approve',
      '/api/funds/:fundId/metric-runs/:metricRunId/lock',
      '/api/funds/:fundId/metric-runs/:metricRunId/evidence-records',
      '/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs',
    ]);

    const getPaths =
      routerSource
        .match(/router\.get\(\s*['"]([^'"]+)['"]/g)
        ?.map((match) => match.replace(/router\.get\(\s*['"]/, '').replace(/['"]$/, '')) ?? [];

    expect(getPaths).toEqual([
      '/api/funds/:fundId/metric-runs/latest',
      '/api/funds/:fundId/metric-runs/:metricRunId',
      '/api/funds/:fundId/metric-runs/:metricRunId/evidence-records',
      '/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs',
      '/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId',
    ]);
  });

  it('does not add any /api/public route', () => {
    expect(routerSource).not.toMatch(/\/api\/public/);
  });

  it('keeps writes in the service layer rather than the route', () => {
    expect(routerSource).not.toMatch(/db\.insert\(/);
    expect(routerSource).not.toMatch(/INSERT\s+INTO/i);
  });
});
