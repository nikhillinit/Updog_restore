import process from 'node:process';
import { setInterval } from 'node:timers';

const syntheticDatabaseUrl = 'postgresql://surface-proof:surface-proof@127.0.0.1:1/surface_proof';

export default function isolatedVercelHandler(_request, response) {
  process.stdout.write('handler stdout must not affect isolated proof result parsing\n');
  process.stderr.write('handler stderr must not affect isolated proof result parsing\n');
  if (process.env.SURFACE_BOOT_PROOF_AMBIENT_SENTINEL !== undefined) {
    throw new Error('ambient sentinel reached isolated handler');
  }
  if (
    process.env.VERCEL_TOKEN !== undefined ||
    process.env.VERCEL_ORG_ID !== undefined ||
    process.env.VERCEL_PROJECT_ID !== undefined
  ) {
    throw new Error('Vercel credential reached isolated handler');
  }
  if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'production') {
    throw new Error('isolated handler did not receive expected Vercel runtime markers');
  }
  if (process.env.SESSION_SECRET !== undefined) {
    throw new Error('session credential reached isolated handler');
  }
  if (process.env.DATABASE_URL !== syntheticDatabaseUrl) {
    throw new Error(`unexpected DATABASE_URL: ${process.env.DATABASE_URL}`);
  }
  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_MEMORY_STORAGE !== '0') {
    throw new Error('test-only database mock path selected');
  }
  if (
    process.env._EXPLICIT_NODE_ENV !== '1' ||
    process.env._EXPLICIT_ALLOW_MEMORY_STORAGE !== '1'
  ) {
    throw new Error('isolated handler did not receive explicit environment markers');
  }
  setInterval(() => {}, 1_000);
  response.end();
}
