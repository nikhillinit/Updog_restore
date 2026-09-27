import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// Real router and real storage: unit tests boot MemStorage, so this pins the
// memory-mode create receipt end to end.
vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: vi.fn(async () => true),
}));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import portfolioCompaniesRouter from '../../../server/routes/portfolio-companies';
import { storage } from '../../../server/storage';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: '42',
      sub: '42',
      email: 'analyst@example.com',
      role: 'analyst',
      roles: ['analyst'],
      fundIds: [1],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    next();
  });
  app.use(portfolioCompaniesRouter);
  return app;
}

const body = {
  fundId: 1,
  name: 'Memory Receipt Co',
  sector: 'SaaS',
  stage: 'Seed',
  investmentAmount: '100000.00',
  status: 'active',
};

describe('portfolio-companies POST in memory mode', () => {
  it('creates once per key, replays the same row, and refuses a changed payload', async () => {
    expect(storage.kind).toBe('memory');
    const app = makeApp();
    const send = (key: string, payload: object) =>
      request(app).post('/portfolio-companies').set('idempotency-key', key).send(payload);

    const [first, second] = await Promise.all([
      send('memory-receipt-1', body),
      send('memory-receipt-1', body),
    ]);
    const created = [first, second].find((res) => res.status === 201);
    const replayed = [first, second].find((res) => res.status === 200);
    expect(created?.body.id).toEqual(expect.any(Number));
    expect(replayed?.headers['idempotency-replay']).toBe('true');
    expect(replayed?.body.id).toBe(created?.body.id);
    expect(await storage.getPortfolioCompany(created?.body.id)).toMatchObject({
      name: 'Memory Receipt Co',
    });

    const changed = await send('memory-receipt-1', { ...body, name: 'Changed Co' });
    expect(changed.status).toBe(409);
    expect(changed.body.error).toBe('IDEMPOTENCY_KEY_REUSE');

    const other = await send('memory-receipt-2', body);
    expect(other.status).toBe(201);
    expect(other.body.id).not.toBe(created?.body.id);
  });
});
