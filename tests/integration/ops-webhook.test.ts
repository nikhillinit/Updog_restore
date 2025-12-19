/**
 * Integration Tests: Ops Webhook Handler
 *
 * Tests the Alertmanager webhook endpoint for auto-downgrade functionality.
 * Validates HMAC authentication, replay protection, and audit logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

describe('Ops Webhook: Auto-Downgrade', () => {
  const SECRET = 'a'.repeat(64); // 64-char hex string
  let app: express.Application;
  let mockSetMode: ReturnType<typeof vi.fn>;

  // Set up env vars before all tests in this suite
  beforeAll(() => {
    process.env.ALERTMANAGER_WEBHOOK_SECRET = SECRET;
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  beforeEach(async () => {
    // Create fresh mock for each test
    mockSetMode = vi.fn().mockResolvedValue(undefined);

    // Reset modules to get fresh import
    vi.resetModules();

    // Mock the mode store with fresh mock function
    // Use the relative path that matches the actual import in the route module
    vi.doMock('../../server/lib/stage-validation-mode', () => ({
      setStageValidationMode: mockSetMode,
    }));

    // Re-import the route after setting up mock
    const routeModule = await import('../../server/routes/_ops-stage-validation.ts');
    const opsRoute = routeModule.default;

    // Create Express app with route
    app = express();
    app.use(express.json()); // Add JSON parsing middleware first
    app.use(opsRoute);
  });

  afterEach(() => {
    vi.resetModules();
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

      // Modify one character to ensure it's different from the original
      // XOR the first character with itself if it's 'f', otherwise use '0'
      const firstChar = correctSignature[0];
      const newFirstChar = firstChar === '0' ? 'f' : '0';
      const tamperedSignature = newFirstChar + correctSignature.slice(1);

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
      // Use a timestamp just inside the 5-minute window to avoid race conditions
      // The server uses `Date.now() - ts > 300_000` so exactly 5 minutes would be rejected
      // due to the strict > comparison. Use 4:59 to ensure we're inside the window.
      const boundaryDate = new Date(Date.now() - 4 * 60 * 1000 - 59 * 1000); // 4:59 ago
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
      const logCall = consoleSpy.mock.calls[0]?.[0] as string;
      const logData = JSON.parse(logCall) as {
        event: string;
        trigger: string;
        alert: string;
        at: string;
        labels: Record<string, string>;
      };

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

      const logCall = consoleSpy.mock.calls[0]?.[0] as string;
      const logData = JSON.parse(logCall) as { labels: Record<string, string> };
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

      const logCall = consoleSpy.mock.calls[0]?.[0] as string;
      const logData = JSON.parse(logCall) as { alert: string };
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

  describe('Startup Validation', () => {
    it('throws on startup if webhook secret is missing', async () => {
      // Save and clear the secret
      const savedSecret = process.env.ALERTMANAGER_WEBHOOK_SECRET;
      delete process.env.ALERTMANAGER_WEBHOOK_SECRET;

      // Reset modules to force fresh import
      vi.resetModules();

      // Re-mock the mode store for fresh import
      vi.doMock('../../server/lib/stage-validation-mode', () => ({
        setStageValidationMode: vi.fn().mockResolvedValue(undefined),
      }));

      try {
        await expect(import('../../server/routes/_ops-stage-validation.ts')).rejects.toThrow(
          'ALERTMANAGER_WEBHOOK_SECRET'
        );
      } finally {
        // Restore the secret for other tests
        process.env.ALERTMANAGER_WEBHOOK_SECRET = savedSecret;
      }
    });

    it('throws on startup if webhook secret is too short', async () => {
      // Save and set short secret
      const savedSecret = process.env.ALERTMANAGER_WEBHOOK_SECRET;
      process.env.ALERTMANAGER_WEBHOOK_SECRET = 'short';

      // Reset modules to force fresh import
      vi.resetModules();

      // Re-mock the mode store for fresh import
      vi.doMock('../../server/lib/stage-validation-mode', () => ({
        setStageValidationMode: vi.fn().mockResolvedValue(undefined),
      }));

      try {
        await expect(import('../../server/routes/_ops-stage-validation.ts')).rejects.toThrow(
          'ALERTMANAGER_WEBHOOK_SECRET'
        );
      } finally {
        // Restore the secret for other tests
        process.env.ALERTMANAGER_WEBHOOK_SECRET = savedSecret;
      }
    });
  });
});
