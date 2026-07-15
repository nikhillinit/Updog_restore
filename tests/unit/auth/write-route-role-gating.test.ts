import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const TARGET_FUND_ID = 1;
const ROLES = ['viewer', 'operator', 'service', 'analyst', 'partner', 'admin'] as const;

type Role = (typeof ROLES)[number];
type RoleSet = 'config' | 'scenario';
type RouteMethod = 'delete' | 'patch' | 'post' | 'put';

interface GatedRoute {
  name: string;
  method: RouteMethod;
  path: string;
  roleSet: RoleSet;
}

const GATED_ROUTES: readonly GatedRoute[] = [
  {
    name: 'finalize fund configuration',
    method: 'post',
    path: '/api/funds/finalize',
    roleSet: 'config',
  },
  {
    name: 'save fund configuration draft',
    method: 'put',
    path: '/api/funds/not-a-number/draft',
    roleSet: 'config',
  },
  {
    name: 'publish fund configuration',
    method: 'post',
    path: '/api/funds/not-a-number/publish',
    roleSet: 'config',
  },
  {
    name: 'recalculate fund configuration',
    method: 'post',
    path: '/api/funds/not-a-number/recalculate',
    roleSet: 'config',
  },
  {
    name: 'create fund scenario set',
    method: 'post',
    path: `/api/funds/${TARGET_FUND_ID}/scenario-sets`,
    roleSet: 'scenario',
  },
  {
    name: 'create reserve optimization scenario set',
    method: 'post',
    path: `/api/funds/${TARGET_FUND_ID}/scenario-sets/reserve-optimization`,
    roleSet: 'scenario',
  },
  {
    name: 'calculate fund scenario set',
    method: 'post',
    path: `/api/funds/${TARGET_FUND_ID}/scenario-sets/not-a-uuid/calculate`,
    roleSet: 'scenario',
  },
  {
    name: 'calculate reserve fund scenario set',
    method: 'post',
    path: `/api/funds/${TARGET_FUND_ID}/scenario-sets/not-a-uuid/calculate-reserve`,
    roleSet: 'scenario',
  },
  {
    name: 'archive fund scenario set',
    method: 'post',
    path: `/api/funds/${TARGET_FUND_ID}/scenario-sets/not-a-uuid/archive`,
    roleSet: 'scenario',
  },
  {
    name: 'create scenario case from seed',
    method: 'post',
    path: `/api/funds/${TARGET_FUND_ID}/scenario-analysis/scenarios/not-a-uuid/cases/from-seed`,
    roleSet: 'scenario',
  },
  {
    name: 'create company scenario',
    method: 'post',
    path: '/api/companies/not-a-number/scenarios',
    roleSet: 'scenario',
  },
  {
    name: 'update company scenario',
    method: 'patch',
    path: '/api/companies/not-a-number/scenarios/not-a-uuid',
    roleSet: 'scenario',
  },
  {
    name: 'delete company scenario',
    method: 'delete',
    path: '/api/companies/not-a-number/scenarios/not-a-uuid',
    roleSet: 'scenario',
  },
  {
    name: 'create allocation scenario',
    method: 'post',
    path: `/api/funds/${TARGET_FUND_ID}/allocation-scenarios`,
    roleSet: 'scenario',
  },
  {
    name: 'create allocation scenario decision',
    method: 'post',
    path: `/api/funds/${TARGET_FUND_ID}/allocation-scenarios/not-a-uuid/decisions`,
    roleSet: 'config',
  },
  {
    name: 'update allocation scenario',
    method: 'patch',
    path: `/api/funds/${TARGET_FUND_ID}/allocation-scenarios/not-a-uuid`,
    roleSet: 'scenario',
  },
  {
    name: 'update allocation scenario decision',
    method: 'patch',
    path: `/api/funds/${TARGET_FUND_ID}/allocation-scenarios/not-a-uuid/decisions/not-a-uuid`,
    roleSet: 'config',
  },
  {
    name: 'sync allocation scenario',
    method: 'post',
    path: `/api/funds/${TARGET_FUND_ID}/allocation-scenarios/not-a-uuid/sync`,
    roleSet: 'scenario',
  },
  {
    name: 'apply allocation scenario',
    method: 'post',
    path: `/api/funds/${TARGET_FUND_ID}/allocation-scenarios/not-a-uuid/apply`,
    roleSet: 'config',
  },
];

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
  'METRICS_KEY',
  'METRICS_ALLOW_FROM',
  'HEALTH_KEY',
  'RATE_LIMIT_MAX',
] as const;

const originalEnv = new Map<string, string | undefined>();
const authorizationHeaders = new Map<Role, string>();

let app: express.Express;
let requireWriteRole: (roles: readonly string[]) => express.RequestHandler;

function saveEnv() {
  for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
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
  process.env.REQUIRE_AUTH = '1';
  process.env.DEFAULT_USER_ID = '1';
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';
  process.env.JWT_SECRET = 'write-route-role-gating-secret-32-chars-min';
  process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
  process.env.JWT_ISSUER = 'updog-test';
  process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
  delete process.env.JWT_JWKS_URL;
  delete process.env._EXPLICIT_JWT_JWKS_URL;
  process.env.SESSION_SECRET = 'write-route-session-secret-32-chars-min';
  process.env.METRICS_KEY = 'write-route-metrics-secret-32-chars-min';
  delete process.env.METRICS_ALLOW_FROM;
  process.env.HEALTH_KEY = 'write-route-health-secret-32-chars-min';
  process.env.RATE_LIMIT_MAX = '1000';
}

function issueRequest(route: GatedRoute) {
  switch (route.method) {
    case 'delete':
      return request(app).delete(route.path);
    case 'patch':
      return request(app).patch(route.path);
    case 'post':
      return request(app).post(route.path);
    case 'put':
      return request(app).put(route.path);
  }
}

function expectedOutcome(role: Role, roleSet: RoleSet): 'allowed' | 'forbidden' {
  if (role === 'admin' || role === 'partner') return 'allowed';
  if (role === 'analyst' && roleSet === 'scenario') return 'allowed';
  return 'forbidden';
}

const ROLE_ROUTE_CASES = ROLES.flatMap((role) =>
  GATED_ROUTES.map((route) => ({
    ...route,
    role,
    outcome: expectedOutcome(role, route.roleSet),
  }))
);

beforeAll(async () => {
  saveEnv();
  configureTestAuthEnv();
  vi.resetModules();

  const [{ makeApp }, auth] = await Promise.all([
    import('../../../server/app'),
    import('../../../server/lib/auth/jwt'),
  ]);
  app = makeApp();
  requireWriteRole = auth.requireWriteRole;

  for (const role of ROLES) {
    const token = auth.signToken({
      sub: `${role}-1`,
      email: `${role}@example.com`,
      role,
      fundIds: role === 'admin' ? [] : [TARGET_FUND_ID],
    });
    authorizationHeaders.set(role, `Bearer ${token}`);
  }
});

afterAll(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe('write-route-role-gating', () => {
  it.each(ROLE_ROUTE_CASES)('$role is $outcome for $name', async ({ role, outcome, ...route }) => {
    const authorization = authorizationHeaders.get(role);
    if (!authorization) throw new Error(`Missing authorization header for ${role}`);

    const response = await issueRequest(route).set('Authorization', authorization).send({});

    if (outcome === 'forbidden') {
      expect(response.status).toBe(403);
      return;
    }
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });

  it('returns 401 before role gating for an unauthenticated write', async () => {
    const route = GATED_ROUTES.find((candidate) => candidate.name === 'create allocation scenario');
    if (!route) throw new Error('Representative write route is missing');

    const response = await issueRequest(route).send({});

    expect(response.status).toBe(401);
  });

  it('accepts a createServer role supplied through req.context', async () => {
    const contextApp = express();
    contextApp.use((req, _res, next) => {
      req.context = {
        userId: 'partner-1',
        email: 'partner@example.com',
        role: 'partner',
        orgId: 'test-org',
      };
      next();
    });
    contextApp.post('/probe', requireWriteRole(['partner', 'admin']), (_req, res) =>
      res.sendStatus(204)
    );

    await request(contextApp).post('/probe').expect(204);
  });
});
