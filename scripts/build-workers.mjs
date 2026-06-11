/**
 * Worker Build Script
 * Compiles standalone workers/*-worker.ts entrypoints to dist/workers/*.js
 * using ESBuild.
 *
 * Configuration:
 * - format: esm (matches package type and server build output)
 * - packages: external (Docker copies node_modules separately)
 * - platform: node (Node.js runtime)
 * - target: node20 (matches supported runtime contract)
 */
import { readFileSync, readdirSync, rmSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const workersDir = resolve(root, 'workers');
const outdir = resolve(root, 'dist/workers');
const excludedSuffixes = ['-worker-init.ts', '-worker-support.ts', '-worker-harness.ts'];

try {
  const entryPoints = readdirSync(workersDir)
    .filter((fileName) => fileName.endsWith('-worker.ts'))
    .filter((fileName) => !excludedSuffixes.some((suffix) => fileName.endsWith(suffix)))
    .filter((fileName) => {
      const source = readFileSync(resolve(workersDir, fileName), 'utf8');
      // Legacy side-effect workers share the suffix but are not Docker-runnable ESM entrypoints.
      return source.includes('isDirectEntrypoint(import.meta.url)');
    })
    .map((fileName) => resolve(workersDir, fileName));

  if (entryPoints.length === 0) {
    throw new Error('No standalone worker entrypoints found in workers/');
  }

  rmSync(outdir, { recursive: true, force: true });

  await build({
    entryPoints,
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external',
    sourcemap: true,
    minify: false,
  });

  const emittedFiles = readdirSync(outdir)
    .filter((fileName) => fileName.endsWith('.js') || fileName.endsWith('.js.map'))
    .map((fileName) => relative(root, resolve(outdir, fileName)))
    .sort();

  console.log('Worker build complete:');
  for (const fileName of emittedFiles) {
    console.log(`- ${fileName}`);
  }
} catch (error) {
  console.error('Worker build failed:', error.message);
  process.exit(1);
}
