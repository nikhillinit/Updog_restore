// server/routes/_ops-stage-validation.ts
import crypto from 'crypto';
import express from 'express';
import { setStageValidationMode } from '../lib/stage-validation-mode';

const router = express.Router();
const SECRET = process.env.ALERTMANAGER_WEBHOOK_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error('ALERTMANAGER_WEBHOOK_SECRET (≥32 hex chars) is required');
}

interface WebhookBody {
  groupLabels?: {
    timestamp?: string;
    alertname?: string;
  };
}

router.post('/_ops/stage-validation/auto-downgrade', express.json(), async (req, res) => {
  const raw = JSON.stringify(req.body ?? {});
  const sigHex = String(req.headers['x-alertmanager-signature'] || '');
  const expectedHex = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');

  const isValidHex = (value: string) => value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
  if (sigHex.length !== expectedHex.length || !isValidHex(sigHex)) {
    return res.status(401).json({ error: 'invalid-signature' });
  }

  const ok = crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'));
  if (!ok) return res.status(401).json({ error: 'invalid-signature' });

  const body = req.body as WebhookBody;
  const groupLabels = body.groupLabels;
  const ts = new Date(groupLabels?.timestamp || 0).getTime();
  if (!ts || Date.now() - ts > 300_000) return res.status(401).json({ error: 'expired' });

  const alertName = groupLabels?.alertname || 'unknown';

  try {
    await setStageValidationMode('warn', {
      actor: 'alertmanager',
      reason: `auto-downgrade triggered by alert: ${alertName}`,
    });
  } catch (err) {
    console.error('[ops-webhook] Mode store error:', err);
    return res.status(500).json({ error: 'mode-store-failed' });
  }

  console.warn(
    JSON.stringify({
      event: 'stage_validation_auto_downgrade',
      trigger: 'alertmanager_webhook',
      alert: alertName,
      at: new Date().toISOString(),
      labels: groupLabels ?? null,
    })
  );

  res.json({ ok: true });
});

export default router;
