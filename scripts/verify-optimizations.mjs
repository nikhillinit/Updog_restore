#!/usr/bin/env node
/**
 * Verification script for bundle optimizations
 * Checks that Preact, Sentry exclusion, and chart splitting are working
 */

import { readFileSync, existsSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

console.log('🔍 Verifying bundle optimizations...\n');

// 1. Verify Preact replacement
console.log('1️⃣ Checking Preact substitution:');
const reactChunks = await glob('dist/public/assets/vendor-react*.js');
if (reactChunks.length > 0) {
  const reactChunk = reactChunks[0];
  const content = readFileSync(reactChunk, 'utf8');
  const hasPreact = content.includes('preact');
  const hasReactProd = content.includes('react.production.min');
  const hasReactDev = content.includes('react.development');
  
  if (hasPreact && !hasReactProd && !hasReactDev) {
    console.log('   ✅ Preact successfully replaced React');
  } else if (hasPreact && (hasReactProd || hasReactDev)) {
    console.log('   ⚠️  Both Preact and React detected (alias issue)');
  } else if (!hasPreact) {
    console.log('   ❌ Preact not found, React still in use');
  }
  
  // Check file size
  const stats = readFileSync(reactChunk).length / 1024;
  console.log(`   📦 vendor-react size: ${stats.toFixed(1)} KB`);
  if (stats < 150) {
    console.log('   ✅ Size indicates Preact (< 150KB)');
  } else {
    console.log('   ⚠️  Size indicates React (> 150KB)');
  }
} else {
  console.log('   ❌ No vendor-react chunk found');
}

// 2. Verify Sentry exclusion
console.log('\n2️⃣ Checking Sentry exclusion:');
const sentryChunks = await glob('dist/public/assets/*sentry*.js');
const allChunks = await glob('dist/public/assets/*.js');

if (sentryChunks.length === 0) {
  console.log('   ✅ No dedicated Sentry chunks');
  
  // Check if Sentry is in any other chunk
  let sentryFound = false;
  for (const chunk of allChunks) {
    const content = readFileSync(chunk, 'utf8');
    if (content.includes('@sentry/') || content.includes('Sentry.')) {
      sentryFound = true;
      console.log(`   ⚠️  Sentry found in ${path.basename(chunk)}`);
      break;
    }
  }
  
  if (!sentryFound) {
    console.log('   ✅ Sentry completely excluded from bundle');
  }
} else {
  console.log(`   ❌ Found ${sentryChunks.length} Sentry chunks`);
}

// 3. Verify chart code splitting
console.log('\n3️⃣ Checking Recharts code splitting:');
const chartsChunks = await glob('dist/public/assets/vendor-charts*.js');
const indexChunks = await glob('dist/public/assets/index*.js');

if (chartsChunks.length > 0 && indexChunks.length > 0) {
  const mainContent = readFileSync(indexChunks[0], 'utf8');
  const hasRechartsInMain = mainContent.includes('recharts') || 
                            mainContent.includes('ResponsiveContainer') ||
                            mainContent.includes('LineChart');
  
  if (!hasRechartsInMain) {
    console.log('   ✅ Recharts not in main bundle');
    console.log(`   📦 vendor-charts size: ${(readFileSync(chartsChunks[0]).length / 1024).toFixed(1)} KB`);
  } else {
    console.log('   ❌ Recharts detected in main bundle');
  }
} else {
  console.log('   ⚠️  Expected chunks not found');
}

// 4. Check for lazy loading markers
console.log('\n4️⃣ Checking lazy loading setup:');
const mainChunks = await glob('dist/public/assets/index*.js');
if (mainChunks.length > 0) {
  const mainContent = readFileSync(mainChunks[0], 'utf8');
  const hasLazyMarkers = mainContent.includes('React.lazy') || 
                         mainContent.includes('import(') ||
                         mainContent.includes('__vitePreload');
  
  if (hasLazyMarkers) {
    console.log('   ✅ Lazy loading patterns detected');
  } else {
    console.log('   ⚠️  No lazy loading patterns found');
  }
}

// 5. Total bundle size
console.log('\n5️⃣ Total bundle analysis:');
let totalSize = 0;
let fileCount = 0;
const jsFiles = await glob('dist/public/assets/*.js');

for (const file of jsFiles) {
  const size = readFileSync(file).length / 1024;
  totalSize += size;
  fileCount++;
  if (size > 100) {
    console.log(`   📦 ${path.basename(file).padEnd(40)} ${size.toFixed(1).padStart(8)} KB`);
  }
}

console.log(`\n   Total JS files: ${fileCount}`);
console.log(`   Total size (uncompressed): ${totalSize.toFixed(1)} KB`);
console.log(`   Estimated gzip size: ~${(totalSize * 0.3).toFixed(1)} KB`);

if (totalSize * 0.3 < 400) {
  console.log('\n✅ Bundle is under 400KB gzipped target!');
} else {
  console.log(`\n❌ Bundle exceeds 400KB target by ~${((totalSize * 0.3) - 400).toFixed(1)} KB`);
}

console.log('\n📊 Summary:');
console.log('   Run "npm run build:web" to generate fresh bundle');
console.log('   Check dist/stats.html for detailed visualization');