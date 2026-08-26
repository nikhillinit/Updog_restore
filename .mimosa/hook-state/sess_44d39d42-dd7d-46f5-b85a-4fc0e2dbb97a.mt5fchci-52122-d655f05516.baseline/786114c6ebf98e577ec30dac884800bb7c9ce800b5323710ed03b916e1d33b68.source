import { makeApp } from './app.js';
import { sdk } from './otel.js';
import { logger } from './lib/logger';

const log = logger.child({ module: 'server:index' });

await sdk.start();

const app = makeApp();
const host = process.env['HOST'] || '0.0.0.0';
const port = Number(process.env['PORT'] || 3001);

app.listen(port, host, () => log.info({ host, port }, 'api listening'));

process['on']('SIGTERM', async () => {
  try {
    await sdk.shutdown();
    log.info('OpenTelemetry SDK shutdown complete');
  } catch (error) {
    // Log shutdown error but don't block exit
    log.error({ err: error }, 'OpenTelemetry SDK shutdown failed');
  }
  process.exit(0);
});
