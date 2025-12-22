import { makeApp } from './app.js';
import { sdk } from './otel.js';

await sdk.start();

const app = makeApp();
const host = process.env['HOST'] || '0.0.0.0';
const port = Number(process.env['PORT'] || 3001);

app.listen(port, host, () => console.log(`api on http://${host}:${port}`));

process['on']('SIGTERM', async () => {
  try {
    await sdk.shutdown();
    console.log('[server] OpenTelemetry SDK shutdown complete');
  } catch (error) {
    // Log shutdown error but don't block exit
    console.error('[server] OpenTelemetry SDK shutdown failed:', error instanceof Error ? error.message : String(error));
  }
  process.exit(0);
});