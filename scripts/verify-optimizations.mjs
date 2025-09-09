#!/usr/bin/env node
/**
 * Verification script for bundle optimizations
 * Checks that Preact, Sentry exclusion, and chart splitting are working
 */

import { readFileSync, existsSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

console.log('🔍 Verifying bundle optimizations...\n');

// 1. Verify Preact replacement with positive/negative assertions
console.log('1️⃣ Checking Preact substitution:');

const preactChunks = await glob('dist/public/assets/*preact*.js');
const reactChunks = await glob('dist/public/assets/*react*.js');
const allChunks = await glob('dist/public/assets/*.js');

console.log(`   📦 Chunks named preact: ${preactChunks.length}`);
console.log(`   📦 Chunks named react: ${reactChunks.length}`);

// Check all chunks for React/Preact signatures
let anyReactCode = false;
let anyPreactCode = false;
let primaryChunk = null;
let primarySize = 0;

for (const chunk of allChunks) {
  const content = readFileSync(chunk, 'utf8');
  const filename = path.basename(chunk);
  
  // React signatures - very specific to React
  if (/react\.production\.min|__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED|ReactCurrentDispatcher|ReactCurrentBatchConfig/.test(content)) {
    anyReactCode = true;
    console.log(`   ⚠️  React detected in: ${filename}`);
  }
  
  // Preact signatures - look for multiple indicators
  const preactIndicators = [
    /preact\/compat/,
    /preact\/jsx-runtime/,
    /preact\/hooks/,
    /options\.vnode/,
    /__u\s*&&\s*__u\(/,  // Preact's unmount hook
    /options\._diff/,     // Preact's diff hook
    /\/\*\*\s*@license\s*preact/i
  ];
  
  if (preactIndicators.some(pattern => pattern.test(content))) {
    anyPreactCode = true;
    
    // Track largest preact chunk
    const size = readFileSync(chunk).length / 1024;
    if (size > primarySize) {
      primaryChunk = chunk;
      primarySize = size;
    }
  }
  
  // Check for vendor-preact or vendor-react chunks
  if (chunk.includes('vendor-preact')) {
    const size = readFileSync(chunk).length / 1024;
    console.log(`   ✅ vendor-preact found: ${size.toFixed(1)} KB`);
    anyPreactCode = true;
    primaryChunk = chunk;
    primarySize = size;
  } else if (chunk.includes('vendor-react')) {
    const size = readFileSync(chunk).length / 1024;
    console.log(`   ⚠️  vendor-react found: ${size.toFixed(1)} KB`);
    anyReactCode = true;
    primaryChunk = chunk;
    primarySize = size;
  }
}

if (anyPreactCode && !anyReactCode) {
  console.log('   ✅ Preact successfully replaced React');
  console.log(`   📦 Primary chunk size: ${primarySize.toFixed(1)} KB`);
  if (primarySize < 50) {
    console.log('   ✅ Size indicates Preact (< 50KB for compat)');
  }
} else if (anyPreactCode && anyReactCode) {
  console.log('   ⚠️  Both Preact and React detected (incomplete alias)');
} else if (!anyPreactCode && anyReactCode) {
  console.log('   ❌ React still present, Preact not detected');
  console.log(`   📦 Primary chunk size: ${primarySize.toFixed(1)} KB (React)`);
} else {
  console.log('   ⚠️  Neither React nor Preact clearly detected');
}

// 2. Verify Sentry exclusion
console.log('\n2️⃣ Checking Sentry exclusion:');
const sentryChunks = await glob('dist/public/assets/*sentry*.js');

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