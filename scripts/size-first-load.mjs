#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const VERBOSE = process.env.VERBOSE === '1' || process.argv.includes('--verbose');

// Use dist/public for Vercel compatibility
const dist = 'dist/public';

// Check if dist exists
if (!fs.existsSync(dist)) {
  console.error('❌ No dist/public directory found. Run "npm run build" first.');
  process.exit(1);
}

// Read index.html to find entry point
const indexPath = path.join(dist, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('❌ No index.html found in dist/public');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');

// Extract all script tags with type="module"
const scriptMatches = html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g);
const scripts = [];

for (const match of scriptMatches) {
  const src = match[1].replace(/^\//, '');
  scripts.push(src);
}

// Extract all link tags with rel="modulepreload"
const preloadMatches = html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g);
for (const match of preloadMatches) {
  const href = match[1].replace(/^\//, '');
  scripts.push(href);
}

// Extract CSS files
const cssMatches = html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g);
const cssFiles = [];
for (const match of cssMatches) {
  const href = match[1].replace(/^\//, '');
  cssFiles.push(href);
}

// Calculate sizes
let totalSize = 0;
let totalGzipSize = 0;
const files = [];

// Process JS files
for (const script of scripts) {
  const filePath = path.join(dist, script);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath);
    const size = content.length;
    const gzipSize = gzipSync(content).length;
    totalSize += size;
    totalGzipSize += gzipSize;
    files.push({ 
      file: script, 
      size: Math.round(size / 1024),
      gzipSize: Math.round(gzipSize / 1024),
      type: 'js'
    });
  }
}

// Process CSS files
for (const css of cssFiles) {
  const filePath = path.join(dist, css);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath);
    const size = content.length;
    const gzipSize = gzipSync(content).length;
    totalSize += size;
    totalGzipSize += gzipSize;
    files.push({ 
      file: css, 
      size: Math.round(size / 1024),
      gzipSize: Math.round(gzipSize / 1024),
      type: 'css'
    });
  }
}

const sizeKB = Math.round(totalSize / 1024);
const gzipSizeKB = Math.round(totalGzipSize / 1024);

// Write size to file for CI (in dist root for CI compatibility)
const distRoot = path.dirname(dist); // dist/
fs.mkdirSync(distRoot, { recursive: true });
fs.writeFileSync(path.join(distRoot, '.app-size-kb'), sizeKB.toString());

// Output results
if (VERBOSE) {
  console.log('\n📦 Bundle Size Analysis\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n📊 First Load Resources:');
  
  // Group by type
  const jsFiles = files.filter(f => f.type === 'js');
  const cssFilesData = files.filter(f => f.type === 'css');
  
  if (jsFiles.length > 0) {
    console.log('\n  JavaScript:');
    jsFiles.forEach(f => {
      const name = f.file.length > 50 ? '...' + f.file.slice(-47) : f.file;
      console.log(`    ${name.padEnd(50)} ${String(f.size + ' KB').padStart(8)} (gzip: ${f.gzipSize} KB)`);
    });
  }
  
  if (cssFilesData.length > 0) {
    console.log('\n  CSS:');
    cssFilesData.forEach(f => {
      const name = f.file.length > 50 ? '...' + f.file.slice(-47) : f.file;
      console.log(`    ${name.padEnd(50)} ${String(f.size + ' KB').padStart(8)} (gzip: ${f.gzipSize} KB)`);
    });
  }
  
  console.log('\n  ─────────────────────────────────────');
  console.log(`  Total: ${sizeKB} KB (gzip: ${gzipSizeKB} KB)`);
  
  // Budget check
  const BUDGET_KB = 400;
  const WARNING_KB = 380;
  
  console.log('\n📏 Budget Check:');
  console.log(`   Budget:   ${BUDGET_KB} KB`);
  console.log(`   Current:  ${sizeKB} KB`);
  
  if (sizeKB > BUDGET_KB) {
    console.log(`   Status:   ❌ OVER BUDGET by ${sizeKB - BUDGET_KB} KB`);
    console.log('\n═══════════════════════════════════════════════════════\n');
    process.exit(1);
  } else if (sizeKB > WARNING_KB) {
    console.log(`   Status:   ⚠️  WARNING - Approaching limit`);
  } else {
    console.log(`   Status:   ✅ Within budget`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════\n');
} else {
  // Simple output for CI
  console.log(sizeKB);
}