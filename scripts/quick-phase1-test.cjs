#!/usr/bin/env node
/**
 * Quick Phase 1 Test - Validates key fixes without full suite
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Quick Phase 1 Validation');
console.log('='.repeat(50));

const tests = [
  {
    name: 'Architecture Validation',
    command: 'npm run validate:architecture',
    critical: true
  },
  {
    name: 'Client Build (Vite warnings check)',
    command: 'npm run build:web',
    critical: true,
    validate: (output) => {
      const hasExternalizedWarnings = output.includes('externalized for browser compatibility');
      return {
        passed: !hasExternalizedWarnings,
        message: hasExternalizedWarnings ? 
          '❌ Still has Vite externalization warnings' : 
          '✅ No Vite externalization warnings'
      };
    }
  },
  {
    name: 'TypeScript Check',
    command: 'npm run check:client',
    critical: false
  }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  console.log(`\n🧪 ${test.name}...`);
  
  try {
    const output = execSync(test.command, { 
      encoding: 'utf-8', 
      stdio: 'pipe',
      timeout: 60000
    });
    
    if (test.validate) {
      const result = test.validate(output);
      console.log(result.message);
      if (result.passed) {
        passed++;
      } else {
        failed++;
        if (test.critical) {
          console.log('💥 Critical test failed, stopping...');
          break;
        }
      }
    } else {
      console.log('✅ Passed');
      passed++;
    }
  } catch (error) {
    console.log('❌ Failed');
    console.log(`   Error: ${error.message.slice(0, 200)}...`);
    failed++;
    
    if (test.critical) {
      console.log('💥 Critical test failed, stopping...');
      break;
    }
  }
}

console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('🎉 Phase 1 key validations PASSED!');
  process.exit(0);
} else {
  console.log('💥 Phase 1 validations had failures');
  process.exit(1);
}