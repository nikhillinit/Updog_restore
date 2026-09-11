import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import historicalCapital from '../../fixtures/capital-planning/completed-interpretation-1.0.0.json';

const {
  getSourceConfigMock,
  createScenarioSetMock,
  getScenarioSetMock,
  familyQueryMock,
  familyTransactionMock,
} = vi.hoisted(() => ({
  getSourceConfigMock: vi.fn(),
  createScenarioSetMock: vi.fn(),
  getScenarioSetMock: vi.fn(),
  familyQueryMock: vi.fn(),
  familyTransactionMock: vi.fn(),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({ transaction: familyTransactionMock }));

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

describe('B7 negotiated reader routes through actual adapters', () => {
  let saved: typeof historicalCapital;
  let legacy: boolean;
  const prefix = '/api/funds/101/scenario-sets';
  const scenarioId = historicalCapital.scenarioSet.id;
  const paths = [
    '/source-config',
    '',
    `/${scenarioId}`,
    `/${scenarioId}/results`,
    `/${scenarioId}/comparison`,
    `/${scenarioId}/calculation-status`,
  ];

  beforeEach(async () => {
    saveEnv();
    vi.resetModules();
    vi.clearAllMocks();
    saved = structuredClone(historicalCapital);
    legacy = false;
    familyQueryMock.mockReset();
    familyTransactionMock.mockReset();
    familyTransactionMock.mockImplementation(
      async (run: (client: { query: typeof familyQueryMock }) => unknown) =>
        run({ query: familyQueryMock })
    );
    familyQueryMock.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue);
      if (/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(sql))
        throw new Error('GET attempted mutation');
      if (/fund_scenario_calculation_runs|fund_scenario_set_events/.test(sql))
        throw new Error('Capital GET attempted reserve work');
      if (sql.includes('FROM funds f'))
        return {
          rows: [
            {
              fund_id: 101,
              size: saved.rawSource.fund.size,
              base_currency: saved.rawSource.fund.baseCurrency,
              id: saved.rawSource.config.id,
              version: saved.rawSource.config.version,
              config: saved.rawSource.config.raw,
              published_at: saved.rawSource.config.publishedAt,
            },
          ],
        };
      if (sql.includes('FROM funds')) return { rows: [{ id: 101 }] };
      if (sql.includes('FROM fundconfigs'))
        return {
          rows: [
            {
              id: saved.rawSource.config.id,
              version: saved.rawSource.config.version,
              config: saved.rawSource.config.raw,
              published_at: saved.rawSource.config.publishedAt,
            },
          ],
        };
      if (sql.includes('FROM fund_scenario_sets')) return { rows: [saved.scenarioSet] };
      if (sql.includes('FROM fund_scenario_variants'))
        return {
          rows: legacy
            ? saved.variants.map((v) => ({
                ...v,
                override_type: 'fee_profile',
                override_payload: {},
              }))
            : saved.variants,
        };
      if (sql.includes('FROM fund_snapshots')) return { rows: [saved.snapshot] };
      throw new Error(`Unexpected negotiated GET query: ${sql}`);
    });
    const actual = await vi.importActual<
      typeof import('../../../server/services/fund-scenario-set-service')
    >('../../../server/services/fund-scenario-set-service');
    getSourceConfigMock.mockImplementation(actual.getFundScenarioSourceConfig);
    getScenarioSetMock.mockImplementation(actual.getFundScenarioSet);
  });
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it.each(paths)(
    'rejects malformed scalar, repeated and array selectors on %s before database reads',
    async (suffix) => {
      const app = await makeAppWithTestAuth();
      const authorization = await authorizationHeader();
      for (const query of [
        'representation=unknown',
        'representation=',
        'representation=capital-plan-v1&representation=capital-plan-v1',
        'representation[]=capital-plan-v1',
        'representation[bad]=capital-plan-v1',
        'representation=capital-plan-v1&representation[]=capital-plan-v1',
      ]) {
        const result = await request(app)
          .get(`${prefix}${suffix}?${query}`)
          .set('Authorization', authorization);
        expect(result.status, `${suffix}?${query}`).toBe(400);
        expect(result.body).toMatchObject({
          error: 'invalid_representation',
          parameter: 'representation',
          allowedValues: ['capital-plan-v1'],
        });
      }
      expect(familyQueryMock).not.toHaveBeenCalled();
    },
    30_000
  );

  it('dispatches source/list/detail/results/comparison using actual capital readers', async () => {
    const app = await makeAppWithTestAuth();
    const authorization = await authorizationHeader();
    const versions = [
      'fund-scenario-capital-source/1.0.0',
      'fund-scenario-capital-list/1.0.0',
      'fund-scenario-capital-detail/1.0.0',
      'fund-scenario-capital-results/1.0.0',
      'fund-scenario-capital-comparison/1.0.0',
    ];
    for (const [index, suffix] of paths.slice(0, 5).entries()) {
      const result = await request(app)
        .get(`${prefix}${suffix}?representation=capital-plan-v1`)
        .set('Authorization', authorization);
      expect(result.status, suffix).toBe(200);
      expect(result.body).toMatchObject({
        representation: 'capital-plan-v1',
        contractVersion: versions[index],
      });
      if (suffix.endsWith('/results'))
        expect(JSON.stringify(result.body.savedResult.payload)).toBe(saved.payloadSerialized);
    }
  }, 30_000);

  it.each(['', '?representation=capital-plan-v1'])(
    'refuses capital status with409 before reserve identity/run work (%s)',
    async (selector) => {
      const app = await makeAppWithTestAuth();
      const result = await request(app)
        .get(`${prefix}/${scenarioId}/calculation-status${selector}`)
        .set('Authorization', await authorizationHeader());
      expect(result.status).toBe(409);
      expect(result.body).toMatchObject({ code: 'capital_plan_calculation_status_not_applicable' });
      expect(
        familyQueryMock.mock.calls.some(([sql]) =>
          /fund_scenario_calculation_runs|fund_scenario_set_events|fundconfigs/.test(String(sql))
        )
      ).toBe(false);
    },
    30_000
  );

  it.each(['', '/results', '/comparison'])(
    'requires representation before parsing a corrupt capital payload on direct%s',
    async (suffix) => {
      saved.variants[0]!.override_payload = {} as (typeof saved.variants)[0]['override_payload'];
      const app = await makeAppWithTestAuth();
      const result = await request(app)
        .get(`${prefix}/${scenarioId}${suffix}`)
        .set('Authorization', await authorizationHeader());
      expect(result.status).toBe(406);
      expect(result.body).toMatchObject({ code: 'scenario_representation_required' });
    },
    30_000
  );

  it.each(['', '/results', '/comparison'])(
    'refuses capital representation before parsing a corrupt legacy payload on direct%s',
    async (suffix) => {
      legacy = true;
      const app = await makeAppWithTestAuth();
      const result = await request(app)
        .get(`${prefix}/${scenarioId}${suffix}?representation=capital-plan-v1`)
        .set('Authorization', await authorizationHeader());
      expect(result.status).toBe(406);
      expect(result.body).toMatchObject({ code: 'scenario_representation_not_applicable' });
    },
    30_000
  );

  it('keeps the default list legacy-only with capital data and rejects capital aggregate representation before loading results', async () => {
    const app = await makeAppWithTestAuth();
    const authorization = await authorizationHeader();
    const list = await request(app).get(prefix).set('Authorization', authorization);
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ scenarioSets: [] });
    familyQueryMock.mockClear();
    const aggregate = await request(app)
      .get('/api/funds/101/results?representation=capital-plan-v1')
      .set('Authorization', authorization);
    expect(aggregate.status).toBe(406);
    expect(aggregate.body).toMatchObject({ error: 'scenario_representation_not_applicable' });
    expect(familyQueryMock).not.toHaveBeenCalled();
  }, 30_000);
});
