/**
 * Server Build Script
 * Compiles server/bootstrap.ts to dist/index.js using ESBuild
 *
 * Configuration:
 * - format: esm (preserves import.meta.url and dynamic imports)
 * - packages: external (Docker copies node_modules separately)
 * - platform: node (Node.js runtime)
 * - target: node22 (matches Dockerfile's node:22.23.2-alpine digest)
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

try {
  await build({
    entryPoints: [resolve(root, 'server/bootstrap.ts')],
    outfile: resolve(root, 'dist/index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    packages: 'external',
    sourcemap: true,
    minify: false,
  });

  console.log('Server build complete: dist/index.js');
} catch (error) {
  console.error('Server build failed:', error.message);
  process.exit(1);
}
