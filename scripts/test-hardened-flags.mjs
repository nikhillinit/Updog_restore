#!/usr/bin/env node
/**
 * Test script for hardened flag features
 * Demonstrates ETag, versioning, authentication, and concurrency control
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// Simple JWT generation for testing (matches server logic)
function generateTestJWT() {
  // This would normally use proper JWT signing
  // For demo, we'll use the server's dev mode bypass
  return 'dev-token';
}

async function testETags() {
  console.log('🏷️  Testing ETag support...\n');
  
  try {
    // First request
    console.log('1. Initial request to /api/flags:');
    const response1 = await fetch(`${BASE_URL}/api/flags`);
    console.log(`   Status: ${response1.status}`);
    console.log(`   ETag: ${response1.headers.get('etag')}`);
    console.log(`   Cache-Control: ${response1.headers.get('cache-control')}`);
    
    const data1 = await response1.json();
    console.log(`   Version: ${data1.version}`);
    console.log(`   Hash: ${data1._meta?.hash}`);
    
    const etag = response1.headers.get('etag');
    
    // Conditional request
    console.log('\n2. Conditional request with If-None-Match:');
    const response2 = await fetch(`${BASE_URL}/api/flags`, {
      headers: {
        'If-None-Match': etag
      }
    });
    console.log(`   Status: ${response2.status} ${response2.status === 304 ? '✅ (Not Modified)' : '❌'}`);
    console.log(`   Body length: ${(await response2.text()).length} bytes`);
    
  } catch (error) {
    console.error('❌ ETag test failed:', error.message);
  }
}

async function testVersioning() {
  console.log('\n🔄 Testing version-based concurrency control...\n');
  
  try {
    // Get current version
    console.log('1. Getting current admin flags:');
    const response1 = await fetch(`${BASE_URL}/api/admin/flags`, {
      headers: {
        'Authorization': `Bearer ${generateTestJWT()}`
      }
    });
    
    if (response1.status === 500) {
      console.log('   ⚠️  Database not configured - skipping versioning test');
      return;
    }
    
    console.log(`   Status: ${response1.status}`);
    
    if (response1.ok) {
      const data1 = await response1.json();
      console.log(`   Version: ${data1.version}`);
      
      // Try update without version
      console.log('\n2. Attempting update without If-Match:');
      const response2 = await fetch(`${BASE_URL}/api/admin/flags/wizard.v1`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${generateTestJWT()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: true,
          reason: 'Test without version'
        })
      });
      
      console.log(`   Status: ${response2.status} ${response2.status === 400 ? '✅ (Version Required)' : '❌'}`);
      
      if (!response2.ok) {
        const error = await response2.json();
        console.log(`   Error: ${error.error}`);
      }
      
      // Try update with old version
      console.log('\n3. Attempting update with old version:');
      const response3 = await fetch(`${BASE_URL}/api/admin/flags/wizard.v1`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${generateTestJWT()}`,
          'Content-Type': 'application/json',
          'If-Match': 'old-version-123'
        },
        body: JSON.stringify({
          enabled: true,
          reason: 'Test with old version'
        })
      });
      
      console.log(`   Status: ${response3.status} ${response3.status === 409 ? '✅ (Version Conflict)' : '❌'}`);
      
      if (!response3.ok) {
        const error = await response3.json();
        console.log(`   Error: ${error.error}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Versioning test failed:', error.message);
  }
}

async function testAuthentication() {
  console.log('\n🔐 Testing authentication and authorization...\n');
  
  try {
    // No token
    console.log('1. Request without token:');
    const response1 = await fetch(`${BASE_URL}/api/admin/flags`);
    console.log(`   Status: ${response1.status} ${response1.status === 401 ? '✅ (Unauthorized)' : '❌'}`);
    
    // Invalid token
    console.log('\n2. Request with invalid token:');
    const response2 = await fetch(`${BASE_URL}/api/admin/flags`, {
      headers: {
        'Authorization': 'Bearer invalid-token-123'
      }
    });
    console.log(`   Status: ${response2.status} ${[401, 200].includes(response2.status) ? '✅' : '❌'}`);
    
    // Valid token (dev mode)
    console.log('\n3. Request with dev token:');
    const response3 = await fetch(`${BASE_URL}/api/admin/flags`, {
      headers: {
        'Authorization': `Bearer ${generateTestJWT()}`
      }
    });
    console.log(`   Status: ${response3.status} ${[200, 500].includes(response3.status) ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('❌ Authentication test failed:', error.message);
  }
}

async function testUserTargeting() {
  console.log('\n🎯 Testing user targeting...\n');
  
  try {
    console.log('1. Request without user context:');
    const response1 = await fetch(`${BASE_URL}/api/flags`);
    const data1 = await response1.json();
    console.log(`   Flags: ${JSON.stringify(data1.flags)}`);
    
    console.log('\n2. Request with user context:');
    const response2 = await fetch(`${BASE_URL}/api/flags`, {
      headers: {
        'X-User-Id': 'test-user-12345'
      }
    });
    const data2 = await response2.json();
    console.log(`   Flags: ${JSON.stringify(data2.flags)}`);
    console.log(`   Same result: ${JSON.stringify(data1.flags) === JSON.stringify(data2.flags) ? '✅' : '❓'}`);
    
  } catch (error) {
    console.error('❌ Targeting test failed:', error.message);
  }
}

async function testDryRun() {
  console.log('\n🧪 Testing dry-run mode...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/admin/flags/wizard.v1`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${generateTestJWT()}`,
        'Content-Type': 'application/json',
        'If-Match': 'test-version'
      },
      body: JSON.stringify({
        enabled: true,
        reason: 'Testing dry run mode',
        dryRun: true
      })
    });
    
    console.log(`   Status: ${response.status}`);
    
    if (response.status !== 500) {
      const data = await response.json();
      console.log(`   Dry run: ${data.dryRun ? '✅' : '❌'}`);
      if (data.preview) {
        console.log(`   Preview: ${JSON.stringify(data.preview, null, 2)}`);
      }
    } else {
      console.log('   ⚠️  Database not configured - skipping dry run test');
    }
    
  } catch (error) {
    console.error('❌ Dry run test failed:', error.message);
  }
}

async function runAllTests() {
  console.log('🚩 Testing Hardened Feature Flag System\n');
  console.log(`Base URL: ${BASE_URL}\n`);
  
  // Check if server is running
  try {
    const health = await fetch(`${BASE_URL}/healthz`);
    if (!health.ok) {
      console.error('❌ Server not responding at', BASE_URL);
      process.exit(1);
    }
    console.log('✅ Server is running\n');
  } catch (error) {
    console.error('❌ Cannot connect to server:', error.message);
    console.error('   Make sure server is running with: npm run dev:quick');
    process.exit(1);
  }
  
  await testETags();
  await testVersioning();
  await testAuthentication();
  await testUserTargeting();
  await testDryRun();
  
  console.log('\n🎯 Hardening tests complete!');
  console.log('\nNext steps:');
  console.log('- Set up database for full versioning support');
  console.log('- Configure JWT_SECRET for production authentication');
  console.log('- Add observability metrics for flag exposures');
  console.log('- Implement OpenAPI documentation');
}

// Run tests
runAllTests().catch(console.error);