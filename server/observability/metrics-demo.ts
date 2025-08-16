#!/usr/bin/env tsx
/**
 * Local metrics demo server (for quick /metrics smoke testing)
 */
import express, { Request, Response } from 'express';
import { withRequestMetrics, installMetricsRoute } from './metrics';

const app = express();
app.use(withRequestMetrics());

app.get('/ping', (_req: Request, res: Response) => res.json({ ok: true }));
installMetricsRoute(app);

const port = Number(process.env.PORT ?? 7071);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[metrics-demo] listening on :${port}`);
});