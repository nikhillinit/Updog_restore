#!/usr/bin/env node
/**
 * Feature Flag Propagation Test
 * Tests flag updates propagate to clients within 30s
 */

import { performance } from 'perf_hooks';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const ADMIN_TOKEN = process.env.FLAG_ADMIN_TOKEN || 'dev-token';
const MAX_PROPAGATION_MS = 30_000; // 30 seconds
const POLL_INTERVAL_MS = 1_000; // 1 second

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  return response.json();
}

async function getCurrentFlags() {
  return fetchJSON(`${BASE_URL}/api/flags`);
}

async function updateFlag(key, updates) {
  return fetchJSON(`${BASE_URL}/api/admin/flags/${key}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ADMIN_TOKEN}`
    },
    body: JSON.stringify({
      actor: 'propagation-test',
      reason: 'Testing propagation timing',
      ...updates
    })
  });
}

async function waitForPropagation(flagKey, expectedValue, startTime) {
  const startMs = performance.now();
  
  console.log(`⏳ Waiting for ${flagKey}=${expectedValue} to propagate...`);
  
  while (performance.now() - startMs < MAX_PROPAGATION_MS) {
    const response = await getCurrentFlags();
    const currentValue = response.flags[flagKey];
    
    if (currentValue === expectedValue) {
      const elapsedMs = Math.round(performance.now() - startMs);
      console.log(`✅ Propagated in ${elapsedMs}ms`);
      return elapsedMs;
    }
    
    console.log(`   Current: ${currentValue}, waiting...`);
    await sleep(POLL_INTERVAL_MS);
  }
  
  throw new Error(`Propagation timeout: ${flagKey} did not reach ${expectedValue} within ${MAX_PROPAGATION_MS}ms`);
}

async function testPropagation() {
  console.log('🚩 Testing feature flag propagation\n');
  
  try {
    // Get initial state
    const initial = await getCurrentFlags();
    const testFlag = 'wizard.v1';
    const initialValue = initial.flags[testFlag];
    const targetValue = !initialValue;
    
    console.log(`Initial ${testFlag}: ${initialValue}`);
    console.log(`Target ${testFlag}: ${targetValue}\n`);
    
    // Update flag
    console.log('📝 Updating flag...');
    const startTime = performance.now();
    
    await updateFlag(testFlag, { enabled: targetValue });
    
    // Wait for propagation
    const propagationMs = await waitForPropagation(testFlag, targetValue, startTime);
    
    // Restore original value
    console.log('\n🔄 Restoring original value...');
    await updateFlag(testFlag, { enabled: initialValue });
    await waitForPropagation(testFlag, initialValue, performance.now());
    
    // Results
    console.log(`\n📊 Results:`);
    console.log(`   Propagation time: ${propagationMs}ms`);
    console.log(`   Threshold: ${MAX_PROPAGATION_MS}ms`);
    
    if (propagationMs <= MAX_PROPAGATION_MS) {
      console.log(`   ✅ PASS: Under ${MAX_PROPAGATION_MS / 1000}s threshold`);
      return 0;
    } else {
      console.log(`   ❌ FAIL: Exceeded ${MAX_PROPAGATION_MS / 1000}s threshold`);
      return 1;
    }
    
  } catch (error) {
    console.error('❌ Propagation test failed:', error.message);
    return 1;
  }
}

// Health check first
async function healthCheck() {
  try {
    await fetchJSON(`${BASE_URL}/healthz`);
    console.log(`✅ Server healthy at ${BASE_URL}`);
    return true;
  } catch (error) {
    console.error(`❌ Server health check failed: ${error.message}`);
    console.error(`   Make sure server is running at ${BASE_URL}`);
    return false;
  }
}

// Run test
if (!(await healthCheck())) {
  process.exit(1);
}

process.exit(await testPropagation());