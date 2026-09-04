import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { isDatabaseBackedIdempotencyRoute } from '../../../server/lib/database-backed-idempotency-routes';
import { clearIdempotencyCache, idempotency } from '../../../server/middleware/idempotency';

describe('database-backed idempotency route classification', () => {
  it.each([
    ['POST', '/api/funds/1/internal-economics/runs'],
    ['POST', '/api/funds/0/internal-economics/runs'],
    ['POST', '/api/funds/01/internal-economics/runs'],
    ['POST', '/api/funds/not-a-number/internal-economics/runs'],
    ['POST', '/api/funds/1/internal-economics/runs?mode=create'],
    ['POST', '/api/funds/1/internal-economics/runs#receipt'],
    ['POST', '/api/funds/1/internal-economics/runs?mode=create#receipt'],
    ['POST', '/api/FUNDS/1/INTERNAL-ECONOMICS/RUNS'],
    ['POST', '/api/funds/1/internal-economics/runs/'],
    ['POST', '/api/FUNDS/1/INTERNAL-ECONOMICS/RUNS/?mode=create#receipt'],
    ['POST', '/api/funds/1/current-forecast/recompute'],
    ['POST', '/api/FUNDS/1/CURRENT-FORECAST/RECOMPUTE/?source=rail#command'],
    ['POST', '/api/funds/1/decisions'],
    ['POST', '/api/funds/1/decisions/2/supersede'],
    ['POST', '/api/funds/1/decisions/2/evidence-links'],
    ['POST', '/api/funds/1/tasks/2/evidence-links'],
    ['POST', '/api/funds/0/tasks/00/evidence-links?mode=create'],
    ['POST', '/api/FUNDS/1/TASKS/2/EVIDENCE-LINKS/'],
    ['POST', '/api/funds/1/tasks'],
    ['POST', '/api/funds/1/tasks/'],
    ['POST', '/api/funds/1/tasks?mode=create'],
    ['POST', '/api/funds/1/tasks#fragment'],
    ['POST', '/api/FUNDS/1/TASKS/'],
    ['POST', '/api/funds/not-a-number/tasks'],
    ['POST', '/api/funds/1/scenario-sets/3d9f1f36-7b53-4de4-9f6f-2f4f9a6f9a01/calculate-reserve'],
    ['POST', '/api/funds/1/scenario-sets/abc/calculate-reserve?mode=queue'],
    ['POST', '/api/funds/1/scenario-sets/abc/calculate-reserve#fragment'],
    ['POST', '/api/FUNDS/1/SCENARIO-SETS/ABC/CALCULATE-RESERVE/'],
    ['POST', '/api/funds/1/imports/actuals/dry-run'],
    ['POST', '/api/funds/1/imports/actuals/dry-run/'],
    ['POST', '/api/FUNDS/1/IMPORTS/ACTUALS/PUBLISH/?mode=queue#receipt'],
  ])('matches %s %s', (method, path) => {
    expect(isDatabaseBackedIdempotencyRoute(method, path)).toBe(true);
  });

  it.each([
    ['GET', '/api/funds/1/internal-economics/runs'],
    ['PUT', '/api/funds/1/internal-economics/runs'],
    ['post', '/api/funds/1/internal-economics/runs'],
    ['POST', '/api/funds/internal-economics/runs'],
    ['POST', '/api/funds/1/internal-economics'],
    ['POST', '/api/funds/1/internal-economics/runs//'],
    ['POST', '/api/funds/1/internal-economics/runs/extra'],
    ['POST', '/api/funds/1/internal-economics/run'],
    ['POST', '/api/funds/1/internal-economics/runs-near'],
    ['POST', '/api/funds/1/internal-economics/runs-near?mode=create'],
    ['POST', '/prefix/api/funds/1/internal-economics/runs'],
    ['GET', '/api/funds/1/current-forecast/recompute'],
    ['POST', '/api/funds/1/current-forecast/recompute/extra'],
    ['POST', '/prefix/api/funds/1/current-forecast/recompute'],
    ['GET', '/api/funds/1/decisions'],
    ['GET', '/api/funds/1/decisions/2/supersede'],
    ['GET', '/api/funds/1/decisions/2/evidence-links'],
    ['POST', '/api/funds/1/decisions/2/outcome'],
    ['POST', '/api/funds/1/decisions-near'],
    ['POST', '/api/funds/1/decisions/2/supersede-near'],
    ['POST', '/api/funds/1/decisions/2/evidence-links-near'],
    ['GET', '/api/funds/1/tasks/2/evidence-links'],
    ['post', '/api/funds/1/tasks/2/evidence-links'],
    ['POST', '/api/funds/1/tasks/2/evidence-links/extra'],
    ['POST', '/api/funds/1/tasks/2/evidence-link'],
    ['POST', '/prefix/api/funds/1/tasks/2/evidence-links'],
    ['GET', '/api/funds/1/tasks'],
    ['post', '/api/funds/1/tasks'],
    ['POST', '/api/funds/1/tasks//'],
    ['POST', '/api/funds/tasks'],
    ['POST', '/api/funds/1/tasks-near'],
    ['POST', '/prefix/api/funds/1/tasks'],
    ['GET', '/api/funds/1/scenario-sets/abc/calculate-reserve'],
    ['PUT', '/api/funds/1/scenario-sets/abc/calculate-reserve'],
    ['post', '/api/funds/1/scenario-sets/abc/calculate-reserve'],
    ['POST', '/api/funds/1/scenario-sets/abc/calculate'],
    ['POST', '/api/funds/1/scenario-sets/abc/calculate-reserve/extra'],
    ['POST', '/api/funds/1/scenario-sets/calculate-reserve'],
    ['POST', '/prefix/api/funds/1/scenario-sets/abc/calculate-reserve'],
    ['POST', '/api/funds/1/imports/actuals/publishx'],
    ['POST', '/api/funds/1/imports/actuals/dry-run/extra'],
    ['POST', '/api/funds/1/imports/ledger/publish'],
    ['POST', '/api/funds/1/imports/actuals/dry-run//'],
  ])('does not match %s %s', (method, path) => {
    expect(isDatabaseBackedIdempotencyRoute(method, path)).toBe(false);
  });
});

describe('generic idempotency cache bypass', () => {
  beforeEach(() => {
    clearIdempotencyCache();
  });

  it.each([
    ['canonical', '/api/funds/invalid/internal-economics/runs'],
    ['query-bearing', '/api/funds/invalid/internal-economics/runs?mode=create'],
    ['mixed-case', '/api/funds/invalid/INTERNAL-ECONOMICS/RUNS'],
    ['trailing-slash', '/api/funds/invalid/internal-economics/runs/'],
    ['combined alias', '/api/funds/invalid/INTERNAL-ECONOMICS/RUNS/?mode=create'],
  ] as const)(
    'leaves the %s database-backed run command to its canonical handler',
    async (_name, path) => {
      const app = express();
      let calls = 0;

      app.use(express.json());
      app.use(idempotency());
      app.post('/api/funds/:fundId/internal-economics/runs', (_req, res) => {
        calls += 1;
        res.status(201).json({ calls });
      });

      const first = await request(app)
        .post(path)
        .set('Idempotency-Key', 'database-backed-command')
        .send({ input: 1 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const second = await request(app)
        .post(path)
        .set('Idempotency-Key', 'database-backed-command')
        .send({ input: 1 });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.headers['idempotency-replay']).toBeUndefined();
      expect(second.headers['idempotency-replay']).toBeUndefined();
      expect(calls).toBe(2);
    }
  );

  it('retains generic cache behavior for a near-match route', async () => {
    const app = express();
    let calls = 0;

    app.use(express.json());
    app.use(idempotency());
    app.post('/api/funds/:fundId/internal-economics/runs-near', (_req, res) => {
      calls += 1;
      res.status(201).json({ calls });
    });

    const first = await request(app)
      .post('/api/funds/1/internal-economics/runs-near')
      .set('Idempotency-Key', 'generic-near-match')
      .send({ input: 1 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await request(app)
      .post('/api/funds/1/internal-economics/runs-near')
      .set('Idempotency-Key', 'generic-near-match')
      .send({ input: 1 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotency-replay']).toBe('true');
    expect(calls).toBe(1);
  });

  it.each([
    ['canonical', '/api/funds/1/tasks'],
    ['trailing-slash', '/api/funds/1/tasks/'],
    ['query-bearing', '/api/funds/1/tasks?mode=create'],
    ['mixed-case', '/api/FUNDS/1/TASKS'],
  ] as const)(
    'leaves the %s task-create command to its canonical handler (Railway middleware bypass)',
    async (_name, path) => {
      const app = express();
      let calls = 0;

      app.use(express.json());
      app.use(idempotency());
      app.post('/api/funds/:fundId/tasks', (_req, res) => {
        calls += 1;
        res.status(201).json({ calls });
      });

      const first = await request(app)
        .post(path)
        .set('Idempotency-Key', 'database-backed-task-create')
        .send({ fundId: 1, title: 'x' });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const second = await request(app)
        .post(path)
        .set('Idempotency-Key', 'database-backed-task-create')
        .send({ fundId: 1, title: 'x' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.headers['idempotency-replay']).toBeUndefined();
      expect(second.headers['idempotency-replay']).toBeUndefined();
      expect(calls).toBe(2);
    }
  );

  it('retains generic cache behavior for a near-match tasks route', async () => {
    const app = express();
    let calls = 0;

    app.use(express.json());
    app.use(idempotency());
    app.post('/api/funds/:fundId/tasks-near', (_req, res) => {
      calls += 1;
      res.status(201).json({ calls });
    });

    const first = await request(app)
      .post('/api/funds/1/tasks-near')
      .set('Idempotency-Key', 'generic-tasks-near-match')
      .send({ input: 1 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await request(app)
      .post('/api/funds/1/tasks-near')
      .set('Idempotency-Key', 'generic-tasks-near-match')
      .send({ input: 1 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotency-replay']).toBe('true');
    expect(calls).toBe(1);
  });

  it('bypasses generic cache only for exact task-evidence creation', async () => {
    const app = express();
    let calls = 0;

    app.use(express.json());
    app.use(idempotency());
    app.post('/api/funds/:fundId/tasks/:taskId/evidence-links', (_req, res) => {
      calls += 1;
      res.status(201).json({ calls });
    });

    const first = await request(app)
      .post('/api/funds/1/tasks/2/evidence-links')
      .set('Idempotency-Key', 'database-backed-evidence')
      .send({ target: { kind: 'analysis_reference', id: 11 } });
    const second = await request(app)
      .post('/api/funds/1/tasks/2/evidence-links')
      .set('Idempotency-Key', 'database-backed-evidence')
      .send({ target: { kind: 'analysis_reference', id: 11 } });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.headers['idempotency-replay']).toBeUndefined();
    expect(second.headers['idempotency-replay']).toBeUndefined();
    expect(calls).toBe(2);
  });
});
