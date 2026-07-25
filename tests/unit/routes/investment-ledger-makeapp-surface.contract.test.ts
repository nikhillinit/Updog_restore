import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const participationState = vi.hoisted(() => ({
  create: vi.fn(),
  correct: vi.fn(),
}));

vi.mock('../../../server/services/investment-ledger/financing-event-service', () => ({
  createFinancingEvent: vi.fn(),
  recordFinancingTranche: vi.fn(),
  correctFinancingTranche: vi.fn(),
  loadFinancingEventDetail: vi.fn(),
}));

vi.mock('../../../server/services/investment-ledger/participation-service', () => ({
  createVehicleFinancingParticipation: participationState.create,
}));

vi.mock('../../../server/services/investment-ledger/ledger-correction-service', () => ({
  correctVehicleParticipationLedger: participationState.correct,
}));

const ENV_KEYS = [
  'NODE_ENV',
  '_EXPLICIT_NODE_ENV',
  'VITEST',
  'ALLOW_MEMORY_STORAGE',
  'DATABASE_URL',
  'NEON_DATABASE_URL',
  'REDIS_URL',
  '_EXPLICIT_REDIS_URL',
  'RATE_LIMIT_REDIS_URL',
  'QUEUE_REDIS_URL',
  'SESSION_REDIS_URL',
  'ENABLE_QUEUES',
  'REQUIRE_AUTH',
  'DEFAULT_USER_ID',
  'JWT_ALG',
  '_EXPLICIT_JWT_ALG',
  'JWT_SECRET',
  '_EXPLICIT_JWT_SECRET',
  'JWT_AUDIENCE',
  '_EXPLICIT_JWT_AUDIENCE',
  'JWT_ISSUER',
  '_EXPLICIT_JWT_ISSUER',
  'JWT_JWKS_URL',
  '_EXPLICIT_JWT_JWKS_URL',
  'SESSION_SECRET',
] as const;

const originalEnv = new Map<string, string | undefined>();
const path = '/api/funds/7/investment-ledger/tranches/500/participations';
const body = { vehicleId: 9, participationAmount: '123.456789' };

function saveEnv(): void {
  for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnv.clear();
}

function configureTestAuthEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env._EXPLICIT_NODE_ENV = 'test';
  process.env.VITEST = 'true';
  process.env.ALLOW_MEMORY_STORAGE = '1';
  delete process.env.DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  process.env.REDIS_URL = 'memory://';
  process.env._EXPLICIT_REDIS_URL = 'memory://';
  delete process.env.RATE_LIMIT_REDIS_URL;
  delete process.env.QUEUE_REDIS_URL;
  delete process.env.SESSION_REDIS_URL;
  process.env.ENABLE_QUEUES = '0';
  process.env.REQUIRE_AUTH = '0';
  process.env.DEFAULT_USER_ID = '1';
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';
  process.env.JWT_SECRET = 'ledger-surface-test-secret-32-chars-min';
  process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
  process.env.JWT_ISSUER = 'updog-test';
  process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
  delete process.env.JWT_JWKS_URL;
  delete process.env._EXPLICIT_JWT_JWKS_URL;
  process.env.SESSION_SECRET = 'ledger-surface-session-secret-32-chars-min';
}

async function makeAppWithTestAuth() {
  configureTestAuthEnv();
  const { makeApp } = await import('../../../server/app');
  return makeApp();
}

async function authorizationHeader(): Promise<string> {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '9',
    email: 'ledger-route-user@example.com',
    role: 'user',
    fundIds: [7],
  })}`;
}

describe('investment-ledger makeApp surface', () => {
  beforeEach(() => {
    saveEnv();
    vi.resetModules();
    participationState.create.mockReset();
    participationState.correct.mockReset();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('returns 401 for an unauthenticated participation write', async () => {
    const response = await request(await makeAppWithTestAuth())
      .post(path)
      .send({});
    expect(response.status).toBe(401);
  }, 30_000);

  it('returns 415 for a body-less POST before the ledger handler', async () => {
    const response = await request(await makeAppWithTestAuth())
      .post(path)
      .set('Authorization', await authorizationHeader())
      .set('Idempotency-Key', 'participation-bodyless');

    expect(response.status).toBe(415);
    expect(participationState.create).not.toHaveBeenCalled();
  }, 30_000);

  it('returns 400 for a missing Idempotency-Key with a JSON body', async () => {
    const response = await request(await makeAppWithTestAuth())
      .post(path)
      .set('Authorization', await authorizationHeader())
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
  }, 30_000);

  it('returns 201 for create and 200 for exact replay', async () => {
    participationState.create
      .mockResolvedValueOnce({
        value: { participation: { id: 51 }, warnings: [] },
        replayed: false,
      })
      .mockResolvedValueOnce({
        value: { participation: { id: 51 }, warnings: [] },
        replayed: true,
      });
    const app = await makeAppWithTestAuth();
    const authorization = await authorizationHeader();

    const created = await request(app)
      .post(path)
      .set('Authorization', authorization)
      .set('Idempotency-Key', 'participation-1')
      .send(body);
    const replayed = await request(app)
      .post(path)
      .set('Authorization', authorization)
      .set('Idempotency-Key', 'participation-1')
      .send(body);

    expect(created.status).toBe(201);
    expect(replayed.status).toBe(200);
  }, 30_000);

  it('returns 409 for duplicate confirmation flow', async () => {
    participationState.create.mockRejectedValueOnce(
      Object.assign(new Error('A matching legacy position requires confirmation.'), {
        status: 409,
        statusCode: 409,
        code: 'SUSPECTED_DUPLICATE_POSITION',
        details: { duplicateFingerprints: ['b'.repeat(64)] },
      })
    );

    const response = await request(await makeAppWithTestAuth())
      .post(path)
      .set('Authorization', await authorizationHeader())
      .set('Idempotency-Key', 'participation-confirm')
      .send(body);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('SUSPECTED_DUPLICATE_POSITION');
    expect(response.body.details).toEqual({ duplicateFingerprints: ['b'.repeat(64)] });
  }, 30_000);
});
