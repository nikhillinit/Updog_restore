// scripts/link-sidecar-vite.mjs
// Creates (or refreshes) a root node_modules/vite link to the sidecar vite.
// Works on Windows (junction) and POSIX (symlink).
import { existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';

const ROOT_VITE = 'node_modules/vite';
const SIDECAR_VITE = 'tools_local/node_modules/vite';

// Check if sidecar vite exists
if (!existsSync(SIDECAR_VITE)) {
  console.error('[link-sidecar] ✗ Sidecar vite not found. Run: npm install --prefix tools_local');
  process.exit(1);
}

try {
  // Remove existing vite (if any)
  if (existsSync(ROOT_VITE)) {
    console.log('[link-sidecar] Removing existing node_modules/vite...');
    rmSync(ROOT_VITE, { recursive: true, force: true });
  }

  // Create junction/symlink
  if (os.platform() === 'win32') {
    // Junction (no admin required on most setups with Developer Mode)
    const rootPath = ROOT_VITE.replace(/\//g, '\\');
    const sidecarPath = '..\\' + SIDECAR_VITE.replace(/\//g, '\\');
    console.log(`[link-sidecar] Creating junction: ${rootPath} → ${sidecarPath}`);
    execSync(`cmd /c mklink /J ${rootPath} ${sidecarPath}`, { stdio: 'inherit' });
  } else {
    // POSIX symlink
    console.log(`[link-sidecar] Creating symlink: ${ROOT_VITE} → ../${SIDECAR_VITE}`);
    execSync(`ln -s ../${SIDECAR_VITE} ${ROOT_VITE}`, { stdio: 'inherit' });
  }

  console.log('[link-sidecar] ✅ node_modules/vite → tools_local/node_modules/vite');
} catch (e) {
  console.error('[link-sidecar] ✗ Failed to link vite:', e.message);
  console.error('[link-sidecar] You may need admin rights or Developer Mode enabled on Windows.');
  process.exit(1);
}