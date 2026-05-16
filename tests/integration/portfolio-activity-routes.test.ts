import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from '../../server/routes';
import { storage } from '../../server/storage';

describe('portfolio company and activity route extraction', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '1mb' }));
    await registerRoutes(app);
  });

  it('preserves portfolio-company query validation and create behavior', async () => {
    const invalid = await request(app).get('/api/portfolio-companies?fundId=abc').expect(400);
    expect(invalid.body).toMatchObject({
      error: 'Invalid fund ID query',
    });

    const invalidAsOf = await request(app)
      .get('/api/portfolio-companies?fundId=1&asOf=not-a-date')
      .expect(400);
    expect(invalidAsOf.body).toMatchObject({
      error: 'Invalid asOf query',
    });

    const liveRead = await request(app).get('/api/portfolio-companies?fundId=1').expect(200);
    expect(liveRead.body).toMatchObject({
      companies: expect.any(Array),
      meta: expect.objectContaining({
        mode: 'live',
        source: 'live',
      }),
    });

    const detailRead = await request(app).get('/api/portfolio-companies/1?fundId=1').expect(200);
    expect(detailRead.body).toMatchObject({
      id: 1,
      fundId: 1,
      name: expect.any(String),
    });

    const invalidDetailFund = await request(app)
      .get('/api/portfolio-companies/1?fundId=abc')
      .expect(400);
    expect(invalidDetailFund.body).toMatchObject({
      error: 'Invalid fund ID query',
    });

    const crossFundDetail = await request(app)
      .get('/api/portfolio-companies/1?fundId=999')
      .expect(404);
    expect(crossFundDetail.body).toMatchObject({
      error: 'Company not found',
    });

    const created = await request(app)
      .post('/api/portfolio-companies')
      .send({
        fundId: 1,
        name: 'Route Extraction Co',
        sector: 'AI / ML',
        stage: 'Seed',
        investmentAmount: '1500000',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      fundId: 1,
      name: 'Route Extraction Co',
      sector: 'AI / ML',
      stage: 'Seed',
    });

    const filteredRead = await request(app).get('/api/portfolio-companies?fundId=1').expect(200);
    expect(filteredRead.body.companies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Route Extraction Co',
          sector: 'AI / ML',
          stage: 'Seed',
          fundId: 1,
        }),
      ])
    );

    const invalidSector = await request(app)
      .post('/api/portfolio-companies')
      .send({
        fundId: 1,
        name: 'Invalid Sector Co',
        sector: 'Unmapped Sector',
        stage: 'Seed',
        investmentAmount: '1500000',
      })
      .expect(400);
    expect(invalidSector.body).toMatchObject({
      error: 'Invalid company data',
    });

    const invalidStage = await request(app)
      .post('/api/portfolio-companies')
      .send({
        fundId: 1,
        name: 'Invalid Stage Co',
        sector: 'SaaS',
        stage: 'series_a',
        investmentAmount: '1500000',
      })
      .expect(400);
    expect(invalidStage.body).toMatchObject({
      error: 'Invalid company data',
    });
  });

  it('preserves activity validation and descending read order', async () => {
    await storage.createActivity({
      type: 'update',
      title: 'Older activity',
      activityDate: new Date('2026-01-01T00:00:00.000Z'),
    });

    await storage.createActivity({
      type: 'update',
      title: 'Newer activity',
      activityDate: new Date('2026-02-01T00:00:00.000Z'),
    });

    const invalidCreate = await request(app)
      .post('/api/activities')
      .send({
        type: 'update',
        title: 'HTTP string timestamps are still rejected',
        activityDate: '2026-01-01T00:00:00.000Z',
      })
      .expect(400);

    expect(invalidCreate.body).toMatchObject({
      error: 'Invalid activity data',
    });

    const activities = await request(app).get('/api/activities').expect(200);
    const olderIndex = activities.body.findIndex(
      (activity: { title?: string }) => activity.title === 'Older activity'
    );
    const newerIndex = activities.body.findIndex(
      (activity: { title?: string }) => activity.title === 'Newer activity'
    );

    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });
});
