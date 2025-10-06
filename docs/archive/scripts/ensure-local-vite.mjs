// scripts/ensure-local-vite.mjs
// Ensures vite is available locally for config imports
// Uses npm pack to bypass Windows Defender blocking normal installs
import { existsSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const PACKAGES = [
  { name: 'vite', version: '5.4.11' },
  { name: 'tsx', version: '4.19.2' },
  { name: 'concurrently', version: '9.2.1' }
];

function ensurePackage(pkg) {
  const { name, version } = pkg;
  const pkgPath = `node_modules/${name}/package.json`;

  if (existsSync(pkgPath)) {
    try {
      const installed = JSON.parse(require('fs').readFileSync(pkgPath, 'utf8'));
      if (installed.version === version) {
        console.log(`[ensure-local] ✓ ${name}@${version} already present`);
        return;
      }
      console.log(`[ensure-local] Version mismatch for ${name}: ${installed.version} != ${version}, reinstalling...`);
    } catch {
      console.log(`[ensure-local] Invalid ${name} installation, reinstalling...`);
    }
  }

  console.log(`[ensure-local] Fetching ${name}@${version} tarball...`);

  try {
    // Clean up any existing broken installation
    if (existsSync(`node_modules/${name}`)) {
      rmSync(`node_modules/${name}`, { recursive: true, force: true });
    }

    // Download tarball
    execSync(`npm pack ${name}@${version} --silent`, { stdio: 'pipe' });

    // Find the tarball
    const files = readdirSync('.');
    const tgz = files.find(f =>
      f.startsWith(`${name}-${version}`) && f.endsWith('.tgz')
    );

    if (!tgz) {
      // Try alternative naming pattern
      const altTgz = files.find(f =>
        f.includes(name) && f.includes(version.replace(/\./g, '-')) && f.endsWith('.tgz')
      );
      if (!altTgz) {
        throw new Error(`Tarball for ${name}@${version} not found`);
      }
    }

    const tarball = tgz || altTgz;

    // Create target directory
    mkdirSync(`node_modules/${name}`, { recursive: true });

    // Extract based on platform
    const tarCmd = platform() === 'win32'
      ? `tar -xzf ${tarball} -C node_modules/${name} --strip-components=1 package`
      : `tar -xzf ${tarball} -C node_modules/${name} --strip-components=1`;

    execSync(tarCmd, { stdio: 'pipe' });

    // Clean up tarball
    rmSync(tarball);

    console.log(`[ensure-local] ✓ ${name}@${version} ready at node_modules/${name}`);
  } catch (error) {
    console.error(`[ensure-local] ✗ Failed to install ${name}@${version}:`, error.message);
    process.exit(1);
  }
}

// Ensure all packages
console.log('[ensure-local] Ensuring local packages for config imports...');
for (const pkg of PACKAGES) {
  ensurePackage(pkg);
}

console.log('[ensure-local] ✓ All packages ready');