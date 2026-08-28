import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSourceConfigMock, createScenarioSetMock, getScenarioSetMock } = vi.hoisted(() => ({
  getSourceConfigMock: vi.fn(),
  createScenarioSetMock: vi.fn(),
  getScenarioSetMock: vi.fn(),
}));

vi.mock('../../../server/services/fund-scenario-set-service.js', async (importActual) => {
  const actual =
    await importActual<typeof import('../../../server/services/fund-scenario-set-service')>();
  return {
    ...actual,
    getFundScenarioSourceConfig: getSourceConfigMock,
    getFundScenarioSet: getScenarioSetMock,
  };
});

vi.mock('../../../server/services/fund-scenario-set-create-service.js', async (importActual) => {
  const actual =
    await importActual<
      typeof import('../../../server/services/fund-scenario-set-create-service')
    >();
  return {
    ...actual,
    createFundScenarioSet: createScenarioSetMock,
  };
});

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

function saveEnv() {
  for (const key of ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  originalEnv.clear();
}

function configureTestAuthEnv() {
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
  process.env.JWT_SECRET = 'route-surface-test-secret-32-chars-min';
  process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
  process.env.JWT_ISSUER = 'updog-test';
  process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
  delete process.env.JWT_JWKS_URL;
  delete process.env._EXPLICIT_JWT_JWKS_URL;
  process.env.SESSION_SECRET = 'route-surface-session-secret-32-chars-min';
}

async function makeAppWithTestAuth() {
  configureTestAuthEnv();
  const { makeApp } = await import('../../../server/app');
  return makeApp();
}

async function authorizationHeader() {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '1',
    email: 'route-surface-test@example.com',
    role: 'admin',
    fundIds: [],
  })}`;
}

const sourceConfigPayload = {
  contractVersion: 'fund-scenario-source-config/1.0.0',
  sourceConfigId: 12,
  sourceConfigVersion: 4,
  publishedAt: '2026-05-26T12:00:00.000Z',
  allocations: [{ id: 'alloc-a', category: 'Seed', percentage: 100 }],
  capitalPlanAllocations: null,
};

function buildV2Body() {
  return {
    contractVersion: 'fund-scenario-set-create/2.0.0',
    name: 'Allocation scenarios',
    expectedSourceConfigId: 12,
    expectedSourceConfigVersion: 4,
    variants: ['Base', 'Upside', 'Downside'].map((name) => ({
      name,
      override: {
        overrideType: 'allocation',
        payload: { allocations: [{ id: 'alloc-a', category: 'Seed', percentage: 100 }] },
      },
    })),
  };
}

describe('fund scenario sets source-config route (F_1.7.0 S1)', () => {
  beforeEach(() => {
    saveEnv();
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('serves the literal source-config path (beating /:scenarioSetId) with the narrowed payload', async () => {
    getSourceConfigMock.mockResolvedValue(sourceConfigPayload);
    const app = await makeAppWithTestAuth();

    const res = await request(app)
      .get('/api/funds/1/scenario-sets/source-config')
      .set('Authorization', await authorizationHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual(sourceConfigPayload);
    // Literal-path reachability: the param route would have answered 400
    // invalid_scenario_set_id for the non-UUID segment 'source-config'.
    expect(res.body?.error).not.toBe('invalid_scenario_set_id');
    expect(getSourceConfigMock).toHaveBeenCalledWith(1);
    expect(getScenarioSetMock).not.toHaveBeenCalled();
  }, 30_000);

  it('maps a missing published config to 409 no_published_config', async () => {
    getSourceConfigMock.mockRejectedValue(
      Object.assign(new Error('Fund 1 does not have a published config'), {
        statusCode: 409,
        code: 'no_published_config',
      })
    );
    const app = await makeAppWithTestAuth();

    const res = await request(app)
      .get('/api/funds/1/scenario-sets/source-config')
      .set('Authorization', await authorizationHeader());

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'no_published_config' });
  }, 30_000);

  it('accepts an exact V2 create body and returns 201', async () => {
    createScenarioSetMock.mockResolvedValue({ id: 'created-set' });
    const app = await makeAppWithTestAuth();

    const res = await request(app)
      .post('/api/funds/1/scenario-sets')
      .set('Authorization', await authorizationHeader())
      .set('Idempotency-Key', 'route-v2-happy')
      .send(buildV2Body());

    expect(res.status).toBe(201);
    expect(createScenarioSetMock).toHaveBeenCalledTimes(1);
    const [fundIdArg, inputArg] = createScenarioSetMock.mock.calls[0]!;
    expect(fundIdArg).toBe(1);
    expect(inputArg.contractVersion).toBe('fund-scenario-set-create/2.0.0');
    expect(inputArg.variants).toHaveLength(3);
  }, 30_000);

  it('refuses a V2 body with wrong variant count at 422 before the service', async () => {
    const app = await makeAppWithTestAuth();
    const body = buildV2Body();
    const twoVariants = { ...body, variants: body.variants.slice(0, 2) };

    const res = await request(app)
      .post('/api/funds/1/scenario-sets')
      .set('Authorization', await authorizationHeader())
      .send(twoVariants);

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'invalid_scenario_set_v2_payload' });
    expect(createScenarioSetMock).not.toHaveBeenCalled();
  }, 30_000);

  it('refuses a V2 body carrying non-allocation overrides at 422 before the service', async () => {
    const app = await makeAppWithTestAuth();
    const body = buildV2Body();
    const mutated = {
      ...body,
      variants: body.variants.map((variant) => ({
        ...variant,
        override: {
          overrideType: 'methodology',
          payload: { waterfallType: 'hybrid' },
        },
      })),
    };

    const res = await request(app)
      .post('/api/funds/1/scenario-sets')
      .set('Authorization', await authorizationHeader())
      .send(mutated);

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'invalid_scenario_set_v2_payload' });
    expect(createScenarioSetMock).not.toHaveBeenCalled();
  }, 30_000);

  it('passes a stale-pin 409 from the service through unchanged', async () => {
    createScenarioSetMock.mockRejectedValue(
      Object.assign(new Error('Scenario source config changed since it was loaded'), {
        statusCode: 409,
        code: 'scenario_source_config_stale',
        details: {
          suppliedSourceConfigId: 12,
          suppliedSourceConfigVersion: 4,
          currentSourceConfigId: 13,
          currentSourceConfigVersion: 5,
        },
      })
    );
    const app = await makeAppWithTestAuth();

    const res = await request(app)
      .post('/api/funds/1/scenario-sets')
      .set('Authorization', await authorizationHeader())
      .set('Idempotency-Key', 'route-v2-stale')
      .send(buildV2Body());

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: 'scenario_source_config_stale',
      details: { currentSourceConfigId: 13, currentSourceConfigVersion: 5 },
    });
  }, 30_000);

  it('keeps the V1 create path byte-compatible', async () => {
    createScenarioSetMock.mockResolvedValue({ id: 'created-v1-set' });
    const app = await makeAppWithTestAuth();

    const v1Body = {
      name: 'Fee sensitivity',
      variants: [
        {
          name: 'Lower fee',
          override: {
            overrideType: 'fee_profile',
            payload: {
              feeProfiles: [
                {
                  id: 'fp-1',
                  name: 'Lower fees',
                  feeTiers: [
                    {
                      id: 'tier-1',
                      name: 'Management fee',
                      percentage: 1.5,
                      feeBasis: 'committed_capital',
                      startMonth: 0,
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/funds/1/scenario-sets')
      .set('Authorization', await authorizationHeader())
      .send(v1Body);

    expect(res.status).toBe(201);
    const [, inputArg] = createScenarioSetMock.mock.calls[0]!;
    expect(inputArg.contractVersion).toBeUndefined();
    expect(inputArg.variants).toHaveLength(1);
  }, 30_000);

  it('reports V1 issues (400) for a non-V2 invalid body', async () => {
    const app = await makeAppWithTestAuth();

    const res = await request(app)
      .post('/api/funds/1/scenario-sets')
      .set('Authorization', await authorizationHeader())
      .send({ name: 'No variants', variants: [] });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request_body' });
    expect(createScenarioSetMock).not.toHaveBeenCalled();
  }, 30_000);
});
