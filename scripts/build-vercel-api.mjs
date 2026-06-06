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
 * - dependencies external by default (Vercel provides node_modules; nft traces them)
 * - drizzle-orm bundled so the Vercel-only neon-http subpath is present
 */
import { build } from 'esbuild';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const bundledPackages = new Set(['drizzle-orm']);
const externalPackages = [
  ...new Set(
    dependencySections.flatMap((section) => Object.keys(packageJson[section] ?? {}))
  ),
].filter((dependency) => !bundledPackages.has(dependency));
const external = [
  ...externalPackages.flatMap((dependency) => [dependency, `${dependency}/*`]),
  // Keep non-Vercel DB drivers external. The Vercel branch needs neon-http
  // bundled because @vercel/node did not trace that conditional require.
  'drizzle-orm/node-postgres',
  'drizzle-orm/node-postgres/*',
  'drizzle-orm/neon-serverless',
  'drizzle-orm/neon-serverless/*',
];

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
    external,
    sourcemap: false,
    minify: false,
  });

  console.log('Vercel API bundle complete: api/_app.generated.mjs');
} catch (error) {
  console.error('Vercel API bundle failed:', error.message);
  process.exit(1);
}
