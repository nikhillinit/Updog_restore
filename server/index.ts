import { makeApp } from './app.js';
import { sdk } from './otel.js';

await sdk.start();

const app = makeApp();
const host = process.env['HOST'] || '0.0.0.0';
const port = Number(process.env['PORT'] || 3001);

app.listen(port, host, () => console.log(`api on http://${host}:${port}`));

process['on']('SIGTERM', async () => {
  try { await sdk.shutdown(); } catch {}
  process.exit(0);
});