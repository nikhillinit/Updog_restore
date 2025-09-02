#!/usr/bin/env node
/**
 * Build cache warmer - pre-warms build caches for faster subsequent builds
 * Run this after dependency updates or before major development sessions
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description, silent = false) {
  log(`🔥 ${description}`, 'cyan');
  try {
    const output = execSync(command, { 
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf-8'
    });
    return { success: true, output };
  } catch (error) {
    log(`❌ Failed: ${description}`, 'red');
    return { success: false, error };
  }
}

// Ensure cache directories exist
const cacheDirectories = [
  'node_modules/.cache',
  'node_modules/.cache/eslint',
  'node_modules/.cache/vite',
  'node_modules/.vite',
  'dist/.vite-cache'
];

log('🚀 Warming build caches...', 'bright');

// Create cache directories
cacheDirectories.forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    log(`  📁 Created cache directory: ${dir}`, 'green');
  }
});

// Warm TypeScript cache
log('\n📝 Warming TypeScript cache...', 'yellow');
runCommand('npm run check:incremental', 'Building TypeScript incremental cache');

// Warm ESLint cache
log('\n🔍 Warming ESLint cache...', 'yellow');
runCommand('npm run lint -- --cache-strategy content', 'Building ESLint cache');

// Warm Vite dependency pre-bundling
log('\n⚡ Warming Vite dependency cache...', 'yellow');
runCommand('npx vite optimize --force', 'Pre-bundling dependencies', true);

// Generate initial build to warm rollup cache
if (process.argv.includes('--full')) {
  log('\n🏗️  Performing full build warm-up...', 'yellow');
  runCommand('npm run build:fast', 'Fast development build');
}

// Report cache sizes
log('\n📊 Cache status:', 'cyan');
cacheDirectories.forEach(dir => {
  if (existsSync(dir)) {
    try {
      const size = execSync(`du -sh ${dir} 2>/dev/null | cut -f1`, { encoding: 'utf-8' }).trim();
      log(`  ${dir}: ${size}`, 'green');
    } catch {
      log(`  ${dir}: exists`, 'green');
    }
  }
});

log('\n✅ Cache warming complete!', 'bright');
log('💡 Tip: Run with --full flag for complete build cache warming', 'yellow');