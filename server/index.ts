import { makeApp } from './app.js';

// Conditionally initialize OpenTelemetry based on environment
async function initializeObservability() {
  // Skip OTel in test and development environments
  if (process.env.NODE_ENV === 'test' || process.env.OTEL_SDK_DISABLED === 'true') {
    console.log('[otel] Skipping initialization (test mode or disabled)');
    return {
      start: async () => {},
      shutdown: async () => {}
    };
  }

  // Only load OTel module in production/staging
  const { sdk } = await import('./otel.js');
  return sdk;
}

// Initialize OTel and start server
const sdk = await initializeObservability();
await sdk.start();

const app = makeApp();
const host = process.env['HOST'] || '0.0.0.0';
const port = Number(process.env['PORT'] || 3001);

app.listen(port, host, () => console.log(`api on http://${host}:${port}`));

process['on']('SIGTERM', async () => {
  try { await sdk.shutdown(); } catch {}
  process.exit(0);
});