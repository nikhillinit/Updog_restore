import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createPlanningFmvOverrideMock } = vi.hoisted(() => ({
  createPlanningFmvOverrideMock: vi.fn(),
}));

vi.mock('../../../server/services/lp-reporting/planning-fmv-override-service', () => {
  class PlanningFmvOverrideError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  return {
    PlanningFmvOverrideError,
    createPlanningFmvOverride: createPlanningFmvOverrideMock,
    listLatestPlanningFmvOverrides: vi.fn(),
  };
});

async function authHeader() {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '7',
    email: 'admin@example.com',
    role: 'admin',
    fundIds: [],
  })}`;
}

async function makeApp() {
  const { default: planningFmvOverridesRouter } =
    await import('../../../server/routes/planning-fmv-overrides');
  const app = express();
  app.use(express.json());
  app.use(planningFmvOverridesRouter);
  return app;
}

describe('planning FMV overrides route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env._EXPLICIT_NODE_ENV = 'test';
    process.env.JWT_ALG = 'HS256';
    process.env._EXPLICIT_JWT_ALG = 'HS256';
    process.env.JWT_SECRET = 'planning-fmv-route-test-secret-32-chars';
    process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
    process.env.JWT_AUDIENCE = 'updog-test';
    process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
    process.env.JWT_ISSUER = 'updog-test';
    process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
  });

  it('rejects roundId before invoking the write service', async () => {
    const app = await makeApp();
    const response = await request(app)
      .post('/funds/1/planning/fmv-overrides')
      .set('Authorization', await authHeader())
      .set('Idempotency-Key', 'planning-fmv-route-1')
      .send({
        companyId: 42,
        markDate: '2026-06-30',
        fairValue: '12500000.000000',
        reason: 'Approved FMV',
        roundId: 10,
      });

    expect(response.status).toBe(400);
    expect(createPlanningFmvOverrideMock).not.toHaveBeenCalled();
  }, 10_000);
});
