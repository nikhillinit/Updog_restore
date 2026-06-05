/**
 * Vercel API Function Build
 * Bundles server/app.ts (exports makeApp; no listen) into a single
 * self-contained ESM file that the Vercel function imports.
 *
 * Why: @vercel/node ships the raw compiled server files and runs them as ESM,
 * but the server source uses extensionless relative imports ('../lib/x') and
 * tsconfig path aliases ('@shared/*'), which fail under Node's ESM resolver.
 * esbuild's bundler resolves both natively (same approach as build-server.mjs),
 * so we pre-bundle into api/_app.generated.mjs (underscore = not a route).
 *
 * Config mirrors build-server.mjs:
 * - format: esm, platform: node, target: node20
 * - packages: external (Vercel provides node_modules; nft traces them)
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

try {
  await build({
    entryPoints: [resolve(root, 'server/app.ts')],
    outfile: resolve(root, 'api/_app.generated.mjs'),
    // Use the server tsconfig explicitly: esbuild otherwise auto-picks the
    // nested server/tsconfig.json (missing @schema), leaving @schema external
    // and crashing at runtime. tsconfig.server.json defines @shared + @schema.
    tsconfig: resolve(root, 'tsconfig.server.json'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external',
    sourcemap: false,
    minify: false,
  });

  console.log('Vercel API bundle complete: api/_app.generated.mjs');
} catch (error) {
  console.error('Vercel API bundle failed:', error.message);
  process.exit(1);
}
