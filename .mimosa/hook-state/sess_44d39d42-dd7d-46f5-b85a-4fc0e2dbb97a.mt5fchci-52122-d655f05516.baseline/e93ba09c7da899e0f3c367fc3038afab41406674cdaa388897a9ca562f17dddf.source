import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAuth } from '../../../server/lib/auth/jwt';

// Sign with the environment the config layer already cached (.env.test):
// server config reads JWT settings at first import, so per-test overrides
// never apply (repo precedent: "align tokens with cached JWT config").
const TEST_SECRET =
  process.env['JWT_SECRET'] ?? 'test-jwt-secret-must-be-at-least-32-characters-long-for-hs256-validation';
const TEST_ISSUER = process.env['JWT_ISSUER'] ?? 'updog';
const TEST_AUDIENCE = process.env['JWT_AUDIENCE'] ?? 'updog-app';

const storageState = vi.hoisted(() => ({
  createPortfolioCompany: vi.fn(),
  getPortfolioCompany: vi.fn(),
}));
const readServiceState = vi.hoisted(() => ({ listCompanies: vi.fn() }));
const updateState = vi.hoisted(() => ({ update: vi.fn() }));

class MockVersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';
  readonly expectedVersion = 1;
  readonly actualVersion = 2;
}

class MockIdempotencyReuseError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSE';
}

class MockNotFoundError extends Error {
  readonly code = 'PORTFOLIO_COMPANY_NOT_FOUND';
}

vi.mock('../../../server/storage', () => ({ storage: storageState }));
vi.mock('../../../server/services/portfolio-time-machine-read', () => ({
  portfolioTimeMachineReadService: { listCompanies: readServiceState.listCompanies },
}));
vi.mock('../../../server/services/portfolio-company-update-service', () => ({
  updatePortfolioCompanyMetadata: updateState.update,
  PortfolioCompanyUpdateVersionConflictError: MockVersionConflictError,
  PortfolioCompanyUpdateIdempotencyReuseError: MockIdempotencyReuseError,
  PortfolioCompanyUpdateNotFoundError: MockNotFoundError,
}));

function signToken(fundIds: number[], role = 'analyst'): string {
  return jwt.sign(
    {
      sub: '42',
      email: 'portfolio-company-route@example.com',
      role,
      fundIds,
    },
    TEST_SECRET,
    { algorithm: 'HS256', issuer: TEST_ISSUER, audience: TEST_AUDIENCE, expiresIn: '1h' }
  );
}

async function makeApp() {
  const { default: router } = await import('../../../server/routes/portfolio-companies');
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth());
  app.use('/api', router);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

const validCompany = {
  name: 'New Company',
  sector: 'Enterprise',
  stage: 'Seed',
  investmentAmount: '1000000.00',
  status: 'active',
};

describe('portfolio company metadata route', () => {
  beforeEach(() => {
    vi.resetModules();
    storageState.createPortfolioCompany.mockReset();
    storageState.getPortfolioCompany.mockReset();
    readServiceState.listCompanies.mockReset();
    updateState.update.mockReset();
  });

  it('requires idempotency key and strict metadata request validation', async () => {
    const app = await makeApp();
    const token = signToken([7]);

    const missingKey = await request(app)
      .patch('/api/portfolio-companies/11?fundId=7')
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion: 1, patch: { name: 'Updated' } });
    expect(missingKey.status).toBe(400);
    expect(missingKey.body.error).toBe('idempotency_key_required');

    const unknownField = await request(app)
      .patch('/api/portfolio-companies/11?fundId=7')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'metadata-route-1')
      .send({ expectedVersion: 1, patch: { name: 'Updated', status: 'exited' } });
    expect(unknownField.status).toBe(400);
    expect(updateState.update).not.toHaveBeenCalled();
  });

  it('enforces write fund scope before updating', async () => {
    const app = await makeApp();
    const response = await request(app)
      .patch('/api/portfolio-companies/11?fundId=8')
      .set('Authorization', `Bearer ${signToken([7])}`)
      .set('Idempotency-Key', 'metadata-route-2')
      .send({ expectedVersion: 1, patch: { name: 'Updated' } });

    expect(response.status).toBe(403);
    expect(updateState.update).not.toHaveBeenCalled();
  });

  it('returns service response and maps locked conflict errors', async () => {
    updateState.update.mockResolvedValueOnce({
      replayed: false,
      response: { id: 11, fundId: 7, name: 'Updated', rowVersion: 2 },
    });
    const app = await makeApp();
    const success = await request(app)
      .patch('/api/portfolio-companies/11?fundId=7')
      .set('Authorization', `Bearer ${signToken([7])}`)
      .set('Idempotency-Key', 'metadata-route-3')
      .send({ expectedVersion: 1, patch: { name: 'Updated' } });

    expect(success.status).toBe(200);
    expect(success.body).toMatchObject({ id: 11, rowVersion: 2 });
    expect(updateState.update).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: 7, companyId: 11, actorId: 42, idempotencyKey: 'metadata-route-3' })
    );

    updateState.update.mockRejectedValueOnce(new MockVersionConflictError());
    const conflict = await request(app)
      .patch('/api/portfolio-companies/11?fundId=7')
      .set('Authorization', `Bearer ${signToken([7])}`)
      .set('Idempotency-Key', 'metadata-route-4')
      .send({ expectedVersion: 1, patch: { name: 'Updated' } });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' });
  });

  it('requires fundId on company creation and applies write scope', async () => {
    const app = await makeApp();
    const response = await request(app)
      .post('/api/portfolio-companies')
      .set('Authorization', `Bearer ${signToken([7])}`)
      .send(validCompany);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('fund_scope_required');
    expect(storageState.createPortfolioCompany).not.toHaveBeenCalled();
  });
});
