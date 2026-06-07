import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installRumIngressGuards,
  RUM_INGRESS_POST_PATHS,
} from '../../../server/routes/metrics-rum-ingress';
import { rumOriginGuard } from '../../../server/routes/metrics-rum.guard';

const ENV_KEYS = ['NODE_ENV', 'ENABLE_RUM_V2', 'RUM_ORIGIN_ALLOWLIST'] as const;
const originalEnv = new Map<string, string | undefined>();

describe('RUM ingress guards', () => {
  let app: express.Express;
  let counts: Record<'origin' | 'limiter' | 'sampling', number>;

  beforeEach(() => {
    originalEnv.clear();
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
    }

    counts = {
      origin: 0,
      limiter: 0,
      sampling: 0,
    };

    app = express();
    app.use(express.json());

    installRumIngressGuards(app, {
      rumOriginGuard: (_req, _res, next) => {
        counts.origin += 1;
        next();
      },
      rumLimiter: (_req, _res, next) => {
        counts.limiter += 1;
        next();
      },
      rumSamplingGuard: (_req, _res, next) => {
        counts.sampling += 1;
        next();
      },
    });

    app.post('/metrics/rum', (_req, res) => res.status(204).end());
    app.post('/api/metrics/rum', (_req, res) => res.status(204).end());
    app.get('/metrics/rum/health', (_req, res) => res.json({ status: 'healthy' }));
    app.get('/api/other', (_req, res) => res.json({ ok: true }));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('declares the exact ingress POST paths', () => {
    expect(RUM_INGRESS_POST_PATHS).toEqual(['/metrics/rum', '/api/metrics/rum']);
  });

  it('runs the ingress chain once for the direct rum endpoint', async () => {
    await request(app)
      .post('/metrics/rum')
      .send({ name: 'LCP', value: 1234, pathname: '/fund-setup' })
      .expect(204);

    expect(counts).toEqual({ origin: 1, limiter: 1, sampling: 1 });
  });

  it('runs the ingress chain once for the api-prefixed rum endpoint', async () => {
    await request(app)
      .post('/api/metrics/rum')
      .send({ name: 'INP', value: 180, pathname: '/fund-setup' })
      .expect(204);

    expect(counts).toEqual({ origin: 1, limiter: 1, sampling: 1 });
  });

  it('does not run the ingress chain for the health route', async () => {
    await request(app).get('/metrics/rum/health').expect(200);

    expect(counts).toEqual({ origin: 0, limiter: 0, sampling: 0 });
  });

  it('does not run the ingress chain for unrelated api routes', async () => {
    await request(app).get('/api/other').expect(200);

    expect(counts).toEqual({ origin: 0, limiter: 0, sampling: 0 });
  });

  it('requires a production allowlist when RUM v2 is enabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_RUM_V2 = '1';
    delete process.env.RUM_ORIGIN_ALLOWLIST;

    const guardedApp = express();
    guardedApp.post('/api/metrics/rum', rumOriginGuard, (_req, res) => res.status(204).end());

    await request(guardedApp)
      .post('/api/metrics/rum')
      .set('Origin', 'https://app.presson.vc')
      .expect(403);
  });

  it('matches RUM origins by exact parsed origin for the api alias', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_RUM_V2 = '1';
    process.env.RUM_ORIGIN_ALLOWLIST = 'https://app.presson.vc';

    const guardedApp = express();
    guardedApp.post('/api/metrics/rum', rumOriginGuard, (_req, res) => res.status(204).end());

    await request(guardedApp)
      .post('/api/metrics/rum')
      .set('Origin', 'https://app.presson.vc')
      .expect(204);

    await request(guardedApp)
      .post('/api/metrics/rum')
      .set('Origin', 'https://app.presson.vc.evil.example')
      .expect(403);
  });

  it('accepts a same-origin referer path without allowing prefix lookalikes', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_RUM_V2 = '1';
    process.env.RUM_ORIGIN_ALLOWLIST = 'https://app.presson.vc';

    const guardedApp = express();
    guardedApp.post('/metrics/rum', rumOriginGuard, (_req, res) => res.status(204).end());

    await request(guardedApp)
      .post('/metrics/rum')
      .set('Referer', 'https://app.presson.vc/funds/1')
      .expect(204);

    await request(guardedApp)
      .post('/metrics/rum')
      .set('Referer', 'https://app.presson.vc.evil.example/funds/1')
      .expect(403);
  });
});
