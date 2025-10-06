// scripts/sidecar-loader.mjs
// ESM loader that redirects bare imports to sidecar workspace
// This allows vite.config.ts and server files to import 'vite' from tools_local

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const sidecarPkg = path.resolve('tools_local/package.json');
const requireFromSidecar = createRequire(pathToFileURL(sidecarPkg));

// Packages that should resolve from sidecar
const SIDECAR_PACKAGES = ['vite', 'rollup', 'postcss', 'esbuild'];

export async function resolve(specifier, context, defaultResolve) {
  // Route sidecar packages
  if (SIDECAR_PACKAGES.includes(specifier)) {
    try {
      const resolved = requireFromSidecar.resolve(specifier);
      return {
        url: pathToFileURL(resolved).href,
        shortCircuit: true
      };
    } catch {
      // Fall back to default if not in sidecar
    }
  }

  return defaultResolve(specifier, context, defaultResolve);
}