#!/usr/bin/env node
/**
 * Bundle size checker - ensures production build stays under performance budget
 * Target: < 350KB gzipped for initial route
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUDGET_KB = 350;
const DIST_PATH = path.join(__dirname, '..', 'dist', 'public', 'assets');

try {
  // Build first if needed
  if (!fs.existsSync(DIST_PATH)) {
    console.log('📦 Building for bundle analysis...');
    execSync('npm run build', { stdio: 'inherit' });
  }

  // Find main JS bundle
  const files = fs.readdirSync(DIST_PATH);
  const mainBundle = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
  
  if (!mainBundle) {
    console.error('❌ Main bundle not found in dist/public/assets/');
    process.exit(1);
  }

  const bundlePath = path.join(DIST_PATH, mainBundle);
  const stats = fs.statSync(bundlePath);
  const sizeKB = Math.round(stats.size / 1024);

  console.log(`📊 Bundle Analysis:`);
  console.log(`   File: ${mainBundle}`);
  console.log(`   Size: ${sizeKB} KB`);
  console.log(`   Budget: ${BUDGET_KB} KB`);
  
  if (sizeKB > BUDGET_KB) {
    console.error(`❌ Bundle size exceeded! ${sizeKB}KB > ${BUDGET_KB}KB`);
    console.log(`💡 Optimization suggestions:`);
    console.log(`   - Check for duplicate dependencies`);
    console.log(`   - Lazy-load heavy components (charts, demo pages)`);
    console.log(`   - Use dynamic imports for non-critical features`);
    process.exit(1);
  }

  console.log(`✅ Bundle size OK: ${sizeKB}KB <= ${BUDGET_KB}KB`);
  
  // Optional: Show largest modules (requires webpack-bundle-analyzer)
  if (process.env.BUNDLE_ANALYZE) {
    console.log('📈 Running bundle analysis...');
    execSync('npx vite-bundle-analyzer dist/public/assets', { stdio: 'inherit' });
  }

} catch (error) {
  console.error('❌ Bundle check failed:', error.message);
  process.exit(1);
}