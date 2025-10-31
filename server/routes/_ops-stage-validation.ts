// server/routes/_ops-stage-validation.ts
import crypto from 'crypto';
import express from 'express';
import { setStageValidationMode } from '../lib/stage-validation-mode';

const router = express.Router();
const SECRET = process.env.ALERTMANAGER_WEBHOOK_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error('ALERTMANAGER_WEBHOOK_SECRET (≥32 hex chars) is required');
}

router.post('/_ops/stage-validation/auto-downgrade', express.json(), async (req, res) => {
  const raw = JSON.stringify(req.body ?? {});
  const sigHex = String(req.headers['x-alertmanager-signature'] || '');
  const expectedHex = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');

  const ok = sigHex.length === expectedHex.length &&
             crypto.timingSafeEqual(Buffer.from(sigHex, 'hex'), Buffer.from(expectedHex, 'hex'));
  if (!ok) return res.status(401).json({ error: 'invalid-signature' });

  const ts = new Date((req.body?.groupLabels?.timestamp as string) || 0).getTime();
  if (!ts || Date.now() - ts > 300_000) return res.status(401).json({ error: 'expired' });

  const alertName = req.body?.groupLabels?.alertname || 'unknown';
  await setStageValidationMode('warn', {
    actor: 'alertmanager',
    reason: `auto-downgrade triggered by alert: ${alertName}`,
  });

  console.warn(JSON.stringify({
    event: 'stage_validation_auto_downgrade',
    trigger: 'alertmanager_webhook',
    alert: alertName,
    at: new Date().toISOString(),
    labels: req.body?.groupLabels ?? null
  }));

  res.json({ ok: true });
});

export default router;
