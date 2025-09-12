import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Vercel Node functions pass body as string or object depending on caller
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    console.log('[wizard-telemetry]', {
      ...body,
      buildId: process.env['VERCEL_GIT_COMMIT_SHA'],
      ts: new Date().toISOString(),
    });
    res.status(204).end();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[wizard-telemetry-error]', msg);
    res.status(400).json({ error: msg });
  }
}