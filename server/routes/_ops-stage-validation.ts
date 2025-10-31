// server/routes/_ops-stage-validation.ts
import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import { setStageValidationMode } from '../lib/stage-validation-mode';

const router = express.Router();

router.post(
  '/_ops/stage-validation/auto-downgrade',
  express.json(),
  async (req: Request, res: Response) => {
    // Validate webhook secret per-request (non-blocking startup)
    const SECRET = process.env['ALERTMANAGER_WEBHOOK_SECRET'];
    if (!SECRET || SECRET.length < 32) {
      return res.status(503).json({
        error: 'webhook-not-configured',
        message: 'ALERTMANAGER_WEBHOOK_SECRET not configured or too short (minimum 32 characters)',
      });
    }

    const raw = JSON.stringify(req.body ?? {});
    const sigHex = String(req.headers['x-alertmanager-signature'] || '');
    const expectedHex = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');

    const ok =
      sigHex.length === expectedHex.length &&
      crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'));
    if (!ok) return res.status(401).json({ error: 'invalid-signature' });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const timestamp = (req.body?.groupLabels as Record<string, unknown>)?.['timestamp'] as
      | string
      | undefined;
    const ts = new Date(timestamp || 0).getTime();

    // Validate timestamp: must be present, valid, and within 5-minute window
    if (isNaN(ts) || ts === 0 || Date.now() - ts > 300_000) {
      return res.status(401).json({ error: 'expired' });
    }

    // Auto-downgrade to warn with structured audit logging
    await setStageValidationMode('warn', {
      actor: 'alertmanager',
      reason: 'auto_downgrade_on_high_error_rate',
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const groupLabels = (req.body?.groupLabels as Record<string, unknown>) ?? null;
    console.warn(
      JSON.stringify({
        event: 'stage_validation_auto_downgrade',
        trigger: 'alertmanager_webhook',
        at: new Date().toISOString(),
        labels: groupLabels,
      })
    );

    res.json({ ok: true });
  }
);

export default router;
