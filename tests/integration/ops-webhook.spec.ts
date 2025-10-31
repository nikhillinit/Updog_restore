/**
 * Integration Tests: Ops Stage Validation Webhook
 *
 * Tests the Alertmanager webhook endpoint for auto-downgrade functionality.
 * Includes HMAC authentication, replay protection, and audit logging.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import type { Express } from 'express';

describe('Ops Stage Validation Webhook', () => {
  let app: Express;
  const SECRET = 'test-secret-at-least-32-characters-long-for-security';

  beforeAll(async () => {
    // Set required environment variables
    process.env['ALERTMANAGER_WEBHOOK_SECRET'] = SECRET;
    process.env['STAGE_VALIDATION_MODE'] = 'enforce';
    process.env['REDIS_URL'] = process.env['REDIS_URL'] || 'redis://localhost:6379';

    // Import server after env vars are set
    const { createServer } = await import('@/server/server');
    const { loadEnv } = await import('@/server/config/index');
    const { buildProviders } = await import('@/server/providers');

    const cfg = loadEnv();
    const providers = await buildProviders(cfg);
    app = await createServer(cfg, providers);
  });

  afterAll(() => {
    delete process.env['ALERTMANAGER_WEBHOOK_SECRET'];
  });

  describe('POST /_ops/stage-validation/auto-downgrade', () => {
    it('accepts valid HMAC signature and downgrades to warn', async () => {
      const payload = {
        groupLabels: {
          alertname: 'StageValidationHighErrorRate',
          timestamp: new Date().toISOString(),
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });

      // Verify mode was changed to 'warn'
      const { getStageValidationMode } = await import('@/server/lib/stage-validation-mode');
      const mode = await getStageValidationMode();
      expect(mode).toBe('warn');
    });

    it('rejects invalid HMAC signature (timing-safe)', async () => {
      const payload = {
        groupLabels: {
          alertname: 'StageValidationHighErrorRate',
          timestamp: new Date().toISOString(),
        },
      };

      const rawBody = JSON.stringify(payload);
      const wrongSignature = crypto
        .createHmac('sha256', 'wrong-secret')
        .update(rawBody)
        .digest('hex');

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', wrongSignature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'invalid-signature' });
    });

    it('rejects expired timestamp (>5 minutes)', async () => {
      const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago
      const payload = {
        groupLabels: {
          alertname: 'StageValidationHighErrorRate',
          timestamp: oldTimestamp,
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'expired' });
    });

    it('rejects missing signature header', async () => {
      const payload = {
        groupLabels: {
          alertname: 'StageValidationHighErrorRate',
          timestamp: new Date().toISOString(),
        },
      };

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'invalid-signature' });
    });

    it('rejects malformed signature (wrong length)', async () => {
      const payload = {
        groupLabels: {
          alertname: 'StageValidationHighErrorRate',
          timestamp: new Date().toISOString(),
        },
      };

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', 'short')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'invalid-signature' });
    });

    it('emits structured audit log on success', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      const payload = {
        groupLabels: {
          alertname: 'StageValidationHighErrorRate',
          severity: 'critical',
          timestamp: new Date().toISOString(),
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');

      await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('stage_validation_auto_downgrade')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('alertmanager_webhook'));

      consoleWarnSpy.mockRestore();
    });

    it('handles missing timestamp gracefully', async () => {
      const payload = {
        groupLabels: {
          alertname: 'StageValidationHighErrorRate',
          // No timestamp
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'expired' });
    });

    it('verifies timing-safe comparison prevents timing attacks', async () => {
      const payload = {
        groupLabels: {
          alertname: 'Test',
          timestamp: new Date().toISOString(),
        },
      };

      const rawBody = JSON.stringify(payload);
      const correctSig = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');

      // Create a signature that differs in first character
      const wrongSig = `a${correctSig.slice(1)}`;

      const start1 = performance.now();
      await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', wrongSig)
        .send(rawBody);
      const time1 = performance.now() - start1;

      // Create a signature that differs in last character
      const wrongSig2 = `${correctSig.slice(0, -1)}a`;

      const start2 = performance.now();
      await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', wrongSig2)
        .send(rawBody);
      const time2 = performance.now() - start2;

      // Timing should be similar (within 2ms) - not revealing position of mismatch
      expect(Math.abs(time1 - time2)).toBeLessThan(2);
    });
  });

  describe('Startup validation', () => {
    it('throws error if ALERTMANAGER_WEBHOOK_SECRET too short', async () => {
      process.env['ALERTMANAGER_WEBHOOK_SECRET'] = 'short'; // Only 5 chars

      await expect(async () => {
        await import('@/server/routes/_ops-stage-validation');
      }).rejects.toThrow('≥32 hex chars');

      process.env['ALERTMANAGER_WEBHOOK_SECRET'] = SECRET;
    });

    it('throws error if ALERTMANAGER_WEBHOOK_SECRET not set', async () => {
      delete process.env['ALERTMANAGER_WEBHOOK_SECRET'];

      await expect(async () => {
        await import('@/server/routes/_ops-stage-validation');
      }).rejects.toThrow('is required');

      process.env['ALERTMANAGER_WEBHOOK_SECRET'] = SECRET;
    });
  });
});
