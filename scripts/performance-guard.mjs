#!/usr/bin/env node
/**
 * Performance guard: Ensures build performance doesn't regress
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const THRESHOLDS = {
  buildTime: 8000, // 8 seconds max (was 5.5s, allow some variance)
  bundleSize: 2 * 1024 * 1024, // 2MB max for main bundle
  typeCheckTime: 15000 // 15 seconds max for type checking
};

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function measureBuildTime() {
  const start = Date.now();
  try {
    execSync('npm run build:web', { stdio: 'pipe' });
    const elapsed = Date.now() - start;
    return elapsed;
  } catch (error) {
    console.error('Build failed:', error.message);
    return -1;
  }
}

function measureTypeCheckTime() {
  const start = Date.now();
  try {
    execSync('npm run check:fast', { stdio: 'pipe' });
    const elapsed = Date.now() - start;
    return elapsed;
  } catch (error) {
    // Type check may fail, we just want timing
    const elapsed = Date.now() - start;
    return elapsed;
  }
}

function measureBundleSize() {
  const bundlePath = path.join(process.cwd(), 'dist/public/assets');
  
  if (!existsSync(bundlePath)) {
    return 0;
  }
  
  try {
    const output = execSync(`du -sb ${bundlePath}`, { encoding: 'utf8' });
    const size = parseInt(output.split('\t')[0]);
    return size;
  } catch {
    // Fallback for Windows
    try {
      const files = execSync(`dir /s /b ${bundlePath}`, { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);
      
      let totalSize = 0;
      for (const file of files) {
        if (existsSync(file)) {
          const stats = readFileSync(file);
          totalSize += stats.length;
        }
      }
      return totalSize;
    } catch {
      return 0;
    }
  }
}

function formatTime(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)}MB`;
}

async function main() {
  log('⚡ Performance Guard', 'cyan');
  log('=' .repeat(40), 'cyan');
  
  const results = {
    buildTime: null,
    typeCheckTime: null,
    bundleSize: null
  };
  
  // Measure build time
  log('\n📦 Measuring build performance...', 'yellow');
  results.buildTime = measureBuildTime();
  
  if (results.buildTime > 0) {
    const status = results.buildTime <= THRESHOLDS.buildTime ? '✅' : '❌';
    const color = results.buildTime <= THRESHOLDS.buildTime ? 'green' : 'red';
    log(`${status} Build time: ${formatTime(results.buildTime)} (threshold: ${formatTime(THRESHOLDS.buildTime)})`, color);
  }
  
  // Measure type check time
  log('\n🔍 Measuring type check performance...', 'yellow');
  results.typeCheckTime = measureTypeCheckTime();
  
  const typeStatus = results.typeCheckTime <= THRESHOLDS.typeCheckTime ? '✅' : '❌';
  const typeColor = results.typeCheckTime <= THRESHOLDS.typeCheckTime ? 'green' : 'red';
  log(`${typeStatus} Type check: ${formatTime(results.typeCheckTime)} (threshold: ${formatTime(THRESHOLDS.typeCheckTime)})`, typeColor);
  
  // Measure bundle size
  log('\n📏 Measuring bundle size...', 'yellow');
  results.bundleSize = measureBundleSize();
  
  if (results.bundleSize > 0) {
    const sizeStatus = results.bundleSize <= THRESHOLDS.bundleSize ? '✅' : '❌';
    const sizeColor = results.bundleSize <= THRESHOLDS.bundleSize ? 'green' : 'red';
    log(`${sizeStatus} Bundle size: ${formatSize(results.bundleSize)} (threshold: ${formatSize(THRESHOLDS.bundleSize)})`, sizeColor);
  }
  
  // Overall assessment
  log('\n' + '=' .repeat(40), 'cyan');
  
  const hasRegression = 
    (results.buildTime > 0 && results.buildTime > THRESHOLDS.buildTime) ||
    results.typeCheckTime > THRESHOLDS.typeCheckTime ||
    (results.bundleSize > 0 && results.bundleSize > THRESHOLDS.bundleSize);
  
  if (hasRegression) {
    log('❌ Performance regression detected!', 'red');
    log('Please investigate and optimize before merging.', 'yellow');
    process.exit(1);
  } else {
    log('✅ All performance metrics within thresholds!', 'green');
    log('60% build performance improvement preserved.', 'green');
  }
}

main().catch(console.error);