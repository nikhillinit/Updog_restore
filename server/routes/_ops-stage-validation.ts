// server/routes/_ops-stage-validation.ts
import crypto from 'crypto';
import type { Request } from 'express';
import express from 'express';
import { setStageValidationMode } from '../lib/stage-validation-mode';

/**
 * Alertmanager webhook payload structure.
 */
interface AlertmanagerWebhookBody {
  groupLabels?: {
    alertname?: string;
    timestamp?: string;
    severity?: string;
    [key: string]: string | undefined;
  };
}

const router = express.Router();
const SECRET = process.env.ALERTMANAGER_WEBHOOK_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error('ALERTMANAGER_WEBHOOK_SECRET (≥32 hex chars) is required');
}

router.post(
  '/_ops/stage-validation/auto-downgrade',
  express.json(),
  async (req: Request<object, object, AlertmanagerWebhookBody>, res) => {
    try {
      const body = req.body ?? {};
      const raw = JSON.stringify(body);
      const sigHex = String(req.headers['x-alertmanager-signature'] || '');
      const expectedHex = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');

      const ok =
        sigHex.length === expectedHex.length &&
        crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'));
      if (!ok) return res.status(401).json({ error: 'invalid-signature' });

      const timestamp = body.groupLabels?.timestamp ?? '';
      const ts = new Date(timestamp || 0).getTime();
      if (!ts || Date.now() - ts > 300_000) return res.status(401).json({ error: 'expired' });

      const alertName: string = body.groupLabels?.alertname ?? 'unknown';
      await setStageValidationMode('warn', {
        actor: 'alertmanager',
        reason: `auto-downgrade triggered by alert: ${alertName}`,
      });

      console.warn(
        JSON.stringify({
          event: 'stage_validation_auto_downgrade',
          trigger: 'alertmanager_webhook',
          alert: alertName,
          at: new Date().toISOString(),
          labels: body.groupLabels ?? null,
        })
      );

      res.json({ ok: true });
    } catch (error) {
      console.error('Mode store error:', error);
      res.status(500).json({ error: 'internal-error' });
    }
  }
);

export default router;
