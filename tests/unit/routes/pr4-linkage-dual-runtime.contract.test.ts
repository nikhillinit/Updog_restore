import express from 'express';
import type { Express } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const analysisService = vi.hoisted(() => ({
  getDraftById: vi.fn(),
  replaceDraftEconomicsReference: vi.fn(),
}));

const evidenceService = vi.hoisted(() => ({
  createTaskEvidenceLink: vi.fn(),
}));

vi.mock('../../../server/services/internal-analysis/analysis-checkpoint-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../../server/services/internal-analysis/analysis-checkpoint-service')
  >('../../../server/services/internal-analysis/analysis-checkpoint-service');
  return {
    ...actual,
    createAnalysisCheckpointPorts: () => ({
      getDraftById: analysisService.getDraftById,
    }),
    replaceDraftEconomicsReference: analysisService.replaceDraftEconomicsReference,
  };
});

vi.mock('../../../server/services/operating-objects/task-evidence-link-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../../server/services/operating-objects/task-evidence-link-service')
  >('../../../server/services/operating-objects/task-evidence-link-service');
  return {
    ...actual,
    createTaskEvidenceLink: evidenceService.createTaskEvidenceLink,
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

const draft = {
  draftId: 3,
  fundId: 1,
  period: {
    periodKind: 'quarterly' as const,
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
  },
  knowledgeCutoff: new Date('2026-07-02T00:00:00.000Z'),
  financialFactsSnapshotId: 41,
  forecastFundSnapshotId: 902,
  reserveReferenceId: null,
  economicsReferenceId: null,
  sourceReferenceId: null,
  savedAt: null,
  version: 1,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
};

const evidenceLink = {
  contractVersion: 'task-evidence-link/1.0.0' as const,
  linkId: 31,
  fundId: 1,
  taskId: 10,
  target: { kind: 'analysis_reference' as const, id: 11 },
  createdAt: '2026-08-01T12:00:00.000Z',
};

type Surface = { name: 'makeApp' | 'registerRoutes'; app: Express };
let surfaces: readonly Surface[] = [];
let registerRoutesServer: Server | undefined;

function configureEnvironment() {
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
  process.env.JWT_SECRET = 'test'.repeat(8);
  process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
  process.env.JWT_ISSUER = 'updog-test';
  process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
  delete process.env.JWT_JWKS_URL;
  delete process.env._EXPLICIT_JWT_JWKS_URL;
  process.env.SESSION_SECRET = 'pr4-linkage-dual-runtime-secret-32';
}

async function authorizationHeader(
  fundIds: readonly number[] = [1],
  role = 'admin'
): Promise<string> {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '9',
    email: 'pr4-linkage@example.com',
    role,
    fundIds,
  })}`;
}

async function closeServer(server: Server | undefined) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

beforeAll(async () => {
  for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
  configureEnvironment();
  vi.resetModules();

  const { makeApp } = await import('../../../server/app');
  const registerRoutesApp = express();
  registerRoutesApp.set('trust proxy', false);
  registerRoutesApp.use(express.json({ limit: '1mb' }));
  const { registerRoutes } = await import('../../../server/routes');
  registerRoutesServer = await registerRoutes(registerRoutesApp);
  surfaces = [
    { name: 'makeApp', app: makeApp() },
    { name: 'registerRoutes', app: registerRoutesApp },
  ];
}, 30_000);

afterAll(async () => {
  await closeServer(registerRoutesServer);
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  analysisService.getDraftById.mockReset();
  analysisService.getDraftById.mockResolvedValue(draft);
  analysisService.replaceDraftEconomicsReference.mockReset();
  analysisService.replaceDraftEconomicsReference.mockResolvedValue({
    ...draft,
    economicsReferenceId: 9,
    version: 2,
    updatedAt: new Date('2026-08-01T12:00:00.000Z'),
  });
  evidenceService.createTaskEvidenceLink.mockReset();
});

describe('PR4 linkage dual-runtime parity', () => {
  it('enforces router-local authorization on both runtimes and global authorization on makeApp', async () => {
    for (const surface of surfaces) {
      await request(surface.app)
        .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
        .send({ economicsReferenceId: 9 })
        .expect(401);
    }

    await request(surfaces[0]!.app)
      .post('/api/funds/1/tasks/10/evidence-links')
      .set('Idempotency-Key', 'evidence-1')
      .send({ target: evidenceLink.target })
      .expect(401);
  });

  it('rotates economics-pin ETags identically', async () => {
    const authorization = await authorizationHeader();
    for (const surface of surfaces) {
      const detail = await request(surface.app)
        .get('/api/funds/1/internal-analysis/drafts/3')
        .set('Authorization', authorization)
        .expect(200);
      const response = await request(surface.app)
        .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
        .set('Authorization', authorization)
        .set('If-Match', detail.headers['etag'] as string)
        .send({ economicsReferenceId: 9 })
        .expect(200);

      expect(response.headers['etag'], surface.name).not.toBe(detail.headers['etag']);
      expect(response.body.draft.basis.economicsReferenceId, surface.name).toBe(9);
    }
  });

  it('returns 201 then 200 replay with the same strict evidence response', async () => {
    const authorization = await authorizationHeader();
    for (const surface of surfaces) {
      evidenceService.createTaskEvidenceLink
        .mockResolvedValueOnce({ evidenceLink, replayed: false })
        .mockResolvedValueOnce({ evidenceLink, replayed: true });

      const first = await request(surface.app)
        .post('/api/funds/1/tasks/10/evidence-links')
        .set('Authorization', authorization)
        .set('Idempotency-Key', 'evidence-1')
        .send({ target: evidenceLink.target })
        .expect(201);
      const replay = await request(surface.app)
        .post('/api/funds/1/tasks/10/evidence-links')
        .set('Authorization', authorization)
        .set('Idempotency-Key', 'evidence-1')
        .send({ target: evidenceLink.target })
        .expect(200);

      expect(first.body, surface.name).toEqual(evidenceLink);
      expect(replay.body, surface.name).toEqual(evidenceLink);
      expect(first.headers['location'], surface.name).toBeUndefined();
      expect(replay.headers['location'], surface.name).toBeUndefined();
    }
  });

  it('returns 403 before evidence service work without request-fund grant', async () => {
    const authorization = await authorizationHeader([2], 'user');
    for (const surface of surfaces) {
      const response = await request(surface.app)
        .post('/api/funds/1/tasks/10/evidence-links')
        .set('Authorization', authorization)
        .set('Idempotency-Key', 'evidence-denied')
        .send({ target: evidenceLink.target });
      expect(response.status, `${surface.name} ${JSON.stringify(response.body)}`).toBe(403);
    }
    expect(evidenceService.createTaskEvidenceLink).not.toHaveBeenCalled();
  });
});
