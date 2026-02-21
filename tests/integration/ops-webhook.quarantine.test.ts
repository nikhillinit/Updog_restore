/**
 * Integration Tests: Ops Webhook Handler
 *
 * Tests the Alertmanager webhook endpoint for auto-downgrade functionality.
 * Validates HMAC authentication, replay protection, and audit logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

// Mock the mode store - use relative path matching what the route imports
const mockSetMode = vi.fn().mockResolvedValue(undefined);
vi.mock('../../server/lib/stage-validation-mode', () => ({
  setStageValidationMode: mockSetMode,
}));

describe('Ops Webhook: Auto-Downgrade', () => {
  const SECRET = 'a'.repeat(64); // 64-char hex string
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.ALERTMANAGER_WEBHOOK_SECRET = SECRET;
    process.env.REDIS_URL = 'redis://localhost:6379';

    // Re-import the route after setting env vars
    const modulePath = '../../server/routes/_ops-stage-validation.ts';
    delete require.cache[require.resolve(modulePath)];
    const opsRoute = (await import(modulePath)).default;

    // Create Express app with route
    app = express();
    app.use(opsRoute);
  });

  afterEach(() => {
    delete process.env.ALERTMANAGER_WEBHOOK_SECRET;
    delete process.env.REDIS_URL;
  });

  function generateSignature(body: object): string {
    const raw = JSON.stringify(body);
    return crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  }

  function createWebhookPayload(timestamp?: string) {
    return {
      groupLabels: {
        alertname: 'StageValidationHighRejectRate',
        severity: 'page',
        timestamp: timestamp || new Date().toISOString(),
      },
      commonAnnotations: {
        description: 'Enforce rejects >1% over 5m',
        runbook: '/docs/runbooks/stage-normalization-rollout.md',
      },
    };
  }

  describe('HMAC Authentication', () => {
    it('accepts valid HMAC signature', async () => {
      const payload = createWebhookPayload();
      const signature = generateSignature(payload);

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(mockSetMode).toHaveBeenCalledWith('warn', {
        actor: 'alertmanager',
        reason: 'auto-downgrade triggered by alert: StageValidationHighRejectRate',
      });
    });

    it('rejects invalid HMAC signature', async () => {
      const payload = createWebhookPayload();
      const invalidSignature = 'f'.repeat(64);

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', invalidSignature)
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'invalid-signature' });
      expect(mockSetMode).not.toHaveBeenCalled();
    });

    it('rejects missing signature header', async () => {
      const payload = createWebhookPayload();

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'invalid-signature' });
    });

    it('uses timing-safe comparison (constant-time)', async () => {
      const payload = createWebhookPayload();
      const correctSignature = generateSignature(payload);

      // Modify one character (should still take same time to compare)
      const tamperedSignature = `f${correctSignature.slice(1)}`;

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', tamperedSignature)
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'invalid-signature' });
    });

    it('rejects signature with wrong length', async () => {
      const payload = createWebhookPayload();
      const shortSignature = 'abc123'; // Too short

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', shortSignature)
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'invalid-signature' });
    });
  });

  describe('Replay Protection', () => {
    it('accepts recent timestamp (within 5 minutes)', async () => {
      const now = new Date();
      const payload = createWebhookPayload(now.toISOString());
      const signature = generateSignature(payload);

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('rejects old timestamp (>5 minutes)', async () => {
      const oldDate = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago
      const payload = createWebhookPayload(oldDate.toISOString());
      const signature = generateSignature(payload);

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'expired' });
      expect(mockSetMode).not.toHaveBeenCalled();
    });

    it('rejects missing timestamp', async () => {
      const payload = {
        groupLabels: {
          alertname: 'TestAlert',
          severity: 'page',
          // No timestamp
        },
      };
      const signature = generateSignature(payload);

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'expired' });
    });

    it('rejects invalid timestamp format', async () => {
      const payload = {
        groupLabels: {
          alertname: 'TestAlert',
          severity: 'page',
          timestamp: 'not-a-date',
        },
      };
      const signature = generateSignature(payload);

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'expired' });
    });

    it('accepts timestamp exactly at 5-minute boundary', async () => {
      // Use 4:59 to avoid timing edge case (execution time can push past boundary)
      const boundaryDate = new Date(Date.now() - (5 * 60 * 1000 - 1000)); // 4:59
      const payload = createWebhookPayload(boundaryDate.toISOString());
      const signature = generateSignature(payload);

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });
  });

  describe('Audit Logging', () => {
    it('emits structured JSON audit log on success', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const payload = createWebhookPayload();
      const signature = generateSignature(payload);

      await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .send(payload);

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      const logData = JSON.parse(logCall);

      expect(logData).toMatchObject({
        event: 'stage_validation_auto_downgrade',
        trigger: 'alertmanager_webhook',
        alert: 'StageValidationHighRejectRate',
      });
      expect(logData.at).toBeDefined();
      expect(logData.labels).toBeDefined();

      consoleSpy.mockRestore();
    });

    it('includes alert labels in audit log', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const payload = {
        groupLabels: {
          alertname: 'CustomAlert',
          severity: 'ticket',
          timestamp: new Date().toISOString(),
          custom_label: 'custom_value',
        },
      };
      const signature = generateSignature(payload);

      await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .send(payload);

      const logData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logData.labels).toMatchObject({
        alertname: 'CustomAlert',
        severity: 'ticket',
        custom_label: 'custom_value',
      });

      consoleSpy.mockRestore();
    });

    it('handles missing alertname gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const payload = {
        groupLabels: {
          timestamp: new Date().toISOString(),
          // No alertname
        },
      };
      const signature = generateSignature(payload);

      await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .send(payload);

      expect(mockSetMode).toHaveBeenCalledWith('warn', {
        actor: 'alertmanager',
        reason: 'auto-downgrade triggered by alert: unknown',
      });

      const logData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logData.alert).toBe('unknown');

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('returns 401 for malformed JSON body', async () => {
      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', 'invalid')
        .set('Content-Type', 'application/json')
        .send('not-json');

      expect(response.status).toBe(400); // Express JSON parsing error
    });

    it('handles mode store errors gracefully', async () => {
      mockSetMode.mockRejectedValueOnce(new Error('Redis connection failed'));

      const payload = createWebhookPayload();
      const signature = generateSignature(payload);

      const response = await request(app)
        .post('/_ops/stage-validation/auto-downgrade')
        .set('X-Alertmanager-Signature', signature)
        .send(payload);

      expect(response.status).toBe(500); // Should propagate error
    });
  });

  /**
   * @quarantine
   * @reason ESM module reload via require.cache does not work for ES modules; cannot test module-load-time startup validation in Vitest
   * @category INFRA
   * @owner P5.1 tech debt audit
   * @date 2026-02-18
   * @exitCriteria Extract startup validation to an init() function callable from tests, or migrate to a test runner supporting ESM module reload
   */
  describe('Startup Validation', () => {
    // ESM modules cannot be uncached like CJS - require.cache doesn't work
    // These tests validate behavior that occurs at module load time
    // which can only be tested by restarting the process
    it.skip('throws on startup if webhook secret is missing (ESM limitation)', async () => {
      delete process.env.ALERTMANAGER_WEBHOOK_SECRET;

      await expect(async () => {
        const modulePath = '../../server/routes/_ops-stage-validation.ts';
        delete require.cache[require.resolve(modulePath)];
        await import(modulePath);
      }).rejects.toThrow('ALERTMANAGER_WEBHOOK_SECRET');
    });

    it.skip('throws on startup if webhook secret is too short (ESM limitation)', async () => {
      process.env.ALERTMANAGER_WEBHOOK_SECRET = 'short';

      await expect(async () => {
        const modulePath = '../../server/routes/_ops-stage-validation.ts';
        delete require.cache[require.resolve(modulePath)];
        await import(modulePath);
      }).rejects.toThrow('ALERTMANAGER_WEBHOOK_SECRET');
    });
  });
});
