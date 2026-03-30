/**
 * Tests for POST /api/funds after legacy-basics removal.
 *
 * Validates:
 *  - Canonical format (top-level name) -> 201
 *  - Legacy-basics format (nested basics key, no top-level name) -> 400
 *  - Empty body -> 400 validation error
 *  - No console.warn calls remain in funds.ts
 *  - Structured logger used for fund.created event
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Hoisted mocks -- must be declared before any import that triggers funds.ts
// ---------------------------------------------------------------------------

const { createFundWithInitialDraftMock, loggerInfoMock, loggerErrorMock, loggerWarnMock } =
  vi.hoisted(() => ({
    createFundWithInitialDraftMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  }));

// Mock fund-persistence-service
vi.mock('../../../server/services/fund-persistence-service', () => ({
  fundPersistenceService: {
    createFundWithInitialDraft: createFundWithInitialDraftMock,
  },
}));

// Mock pino logger (used by routes via ../lib/logger.js)
vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
      debug: vi.fn(),
    }),
  },
}));

// Mock idempotency middleware to pass through
vi.mock('../../../server/middleware/idempotency', () => ({
  default: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

// Mock db (used by GET routes, not our focus but needed to import)
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

// Mock storage
vi.mock('../../../server/storage', () => ({
  storage: {
    getAllFunds: vi.fn().mockResolvedValue([]),
    getFund: vi.fn().mockResolvedValue(null),
  },
}));

// Mock shared/idempotency-instance
vi.mock('../../../server/shared/idempotency-instance', () => ({
  idem: {},
}));

// Mock inflight-server
vi.mock('../../../server/lib/inflight-server', () => ({
  getOrStart: vi.fn(),
}));

// Mock metrics
vi.mock('../../../server/metrics', () => ({
  calcDurationMs: { startTimer: vi.fn(() => vi.fn()) },
}));

// Mock hash
vi.mock('../../../server/lib/hash', () => ({
  hashPayload: vi.fn(() => 'mock-hash'),
}));

// Mock enhanced-fund-model
vi.mock('../../../server/core/enhanced-fund-model', () => ({
  EnhancedFundModel: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import the router AFTER all mocks are in place
// ---------------------------------------------------------------------------
import fundsRouter from '../../../server/routes/funds';

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', fundsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const canonicalPayload = {
  name: 'Press On Fund III',
  size: 50_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2026,
};

const createdFundResponse = {
  id: 42,
  name: 'Press On Fund III',
  size: '50000000',
  managementFee: '0.02',
  carryPercentage: '0.2',
  vintageYear: 2026,
  status: 'draft',
  engineResults: null,
  createdAt: new Date('2026-01-15T00:00:00Z'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/funds -- legacy removal', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    createFundWithInitialDraftMock.mockResolvedValue({ fund: createdFundResponse });
    app = createTestApp();
  });

  it('creates a fund with canonical format (top-level name) -> 201', async () => {
    const res = await request(app).post('/api/funds').send(canonicalPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(42);
    expect(res.body.data.name).toBe('Press On Fund III');
    expect(createFundWithInitialDraftMock).toHaveBeenCalledOnce();
  });

  it('applies Zod defaults when optional fields omitted', async () => {
    const minimal = { name: 'Minimal Fund', size: 10_000_000 };
    const res = await request(app).post('/api/funds').send(minimal);

    expect(res.status).toBe(201);
    // Verify the persistence service received defaults
    const callArg = createFundWithInitialDraftMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg['managementFee']).toBe('0.02');
    expect(callArg['carryPercentage']).toBe('0.2');
  });

  it('rejects legacy-basics format (nested basics key, no top-level name) -> 400', async () => {
    const legacyPayload = {
      basics: { name: 'Legacy Fund', size: 30_000_000 },
      strategy: { stages: [{ name: 'Seed', graduate: 30, exit: 10, months: 18 }] },
    };

    const res = await request(app).post('/api/funds').send(legacyPayload);

    expect(res.status).toBe(400);
    expect(createFundWithInitialDraftMock).not.toHaveBeenCalled();
  });

  it('rejects empty body -> 400 validation error', async () => {
    const res = await request(app).post('/api/funds').send({});

    expect(res.status).toBe(400);
    expect(createFundWithInitialDraftMock).not.toHaveBeenCalled();
  });

  it('rejects body missing required name field -> 400', async () => {
    const res = await request(app).post('/api/funds').send({ size: 50_000_000 });

    expect(res.status).toBe(400);
    expect(createFundWithInitialDraftMock).not.toHaveBeenCalled();
  });

  it('rejects unknown keys (strict mode) -> 400', async () => {
    const res = await request(app)
      .post('/api/funds')
      .send({ ...canonicalPayload, bogusField: true });

    expect(res.status).toBe(400);
    expect(createFundWithInitialDraftMock).not.toHaveBeenCalled();
  });

  it('uses structured logger for fund.created event, not console.warn', async () => {
    await request(app).post('/api/funds').send(canonicalPayload);

    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: 42 }),
      'fund.created'
    );
  });

  it('returns 500 with error details when persistence throws', async () => {
    createFundWithInitialDraftMock.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(app).post('/api/funds').send(canonicalPayload);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create fund');
    expect(res.body.message).toContain('DB connection lost');
  });
});

describe('funds.ts source code hygiene', () => {
  async function readFundsSource(): Promise<string> {
    // node-setup.ts mocks 'fs' globally; bypass via importActual
    const actualFs = await vi.importActual<typeof import('fs')>('fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const fundsPath = resolve(thisDir, '../../../server/routes/funds.ts');
    return actualFs.readFileSync(fundsPath, 'utf-8');
  }

  it('does not contain console.warn calls', async () => {
    const fundsSource = await readFundsSource();
    const consoleWarnMatches = fundsSource.match(/console\.warn/g);
    expect(consoleWarnMatches).toBeNull();
  });

  it('does not import fund-create-adapter', async () => {
    const fundsSource = await readFundsSource();
    expect(fundsSource).not.toContain('fund-create-adapter');
  });

  it('does not contain the deprecated CreateFundSchema', async () => {
    const fundsSource = await readFundsSource();
    expect(fundsSource).not.toContain('CreateFundSchema');
  });
});
