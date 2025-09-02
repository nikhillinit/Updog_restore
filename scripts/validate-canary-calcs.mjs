#!/usr/bin/env node

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.env.API_BASE || 'http://localhost:5000';
const TOL = Number(process.env.CALC_TOLERANCE || '0.005'); // 0.5% tolerance
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

// Hash function for comparison
function hash(x) {
  return crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
}

// Run calculation comparison for one test case
async function runOne(fundId, payload) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : '',
  };
  
  try {
    // Run calculations in parallel against stable and canary engines
    const [oldV, newV] = await Promise.all([
      fetch(`${BASE}/api/reserves/calculate?engine=stable`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }).then(r => {
        if (!r.ok) throw new Error(`Stable engine failed: ${r.status}`);
        return r.json();
      }),
      fetch(`${BASE}/api/reserves/calculate?engine=canary`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }).then(r => {
        if (!r.ok) throw new Error(`Canary engine failed: ${r.status}`);
        return r.json();
      }),
    ]);
    
    // Calculate relative difference
    const oldTotal = oldV.total || oldV.reserve_amount || 0;
    const newTotal = newV.total || newV.reserve_amount || 0;
    const diff = Math.abs(newTotal - oldTotal) / (oldTotal || 1);
    
    // Check if difference is within tolerance
    const ok = diff <= TOL;
    
    return {
      fundId,
      diff,
      ok,
      oldTotal,
      newTotal,
      oldHash: hash(oldV),
      newHash: hash(newV),
      details: !ok ? {
        stable: oldV,
        canary: newV,
      } : undefined,
    };
  } catch (error) {
    return {
      fundId,
      diff: 1,
      ok: false,
      error: error.message,
      oldTotal: 0,
      newTotal: 0,
      oldHash: '',
      newHash: '',
    };
  }
}

// Generate test fixtures if not present
async function generateFixtures() {
  const fixtures = [
    {
      fundId: 'test-fund-1',
      payload: {
        fund_size: 100000000,
        initial_deployment_rate: 0.6,
        follow_on_ratio: 1.5,
        portfolio_size: 30,
        strategy: 'conservative',
      },
    },
    {
      fundId: 'test-fund-2',
      payload: {
        fund_size: 50000000,
        initial_deployment_rate: 0.5,
        follow_on_ratio: 2.0,
        portfolio_size: 25,
        strategy: 'aggressive',
      },
    },
    {
      fundId: 'test-fund-3',
      payload: {
        fund_size: 200000000,
        initial_deployment_rate: 0.55,
        follow_on_ratio: 1.8,
        portfolio_size: 40,
        strategy: 'balanced',
      },
    },
    {
      fundId: 'test-fund-edge-1',
      payload: {
        fund_size: 10000000,
        initial_deployment_rate: 0.3,
        follow_on_ratio: 3.0,
        portfolio_size: 10,
        strategy: 'conservative',
      },
    },
    {
      fundId: 'test-fund-edge-2',
      payload: {
        fund_size: 500000000,
        initial_deployment_rate: 0.7,
        follow_on_ratio: 1.0,
        portfolio_size: 100,
        strategy: 'aggressive',
      },
    },
  ];
  
  await fs.mkdir('./fixtures', { recursive: true });
  await fs.writeFile(
    './fixtures/canary-samples.json',
    JSON.stringify(fixtures, null, 2)
  );
  
  return fixtures;
}

// Main execution
(async () => {
  try {
    console.log('🔍 Canary Calculation Validation');
    console.log('================================');
    console.log(`API Base: ${BASE}`);
    console.log(`Tolerance: ${TOL * 100}%`);
    console.log('');
    
    // Load or generate test cases
    let cases;
    try {
      const data = await fs.readFile('./fixtures/canary-samples.json', 'utf8');
      cases = JSON.parse(data);
      console.log(`✅ Loaded ${cases.length} test cases from fixtures`);
    } catch (e) {
      console.log('📝 Generating default fixtures...');
      cases = await generateFixtures();
    }
    
    // Run all tests in parallel
    console.log('');
    console.log('Running calculations...');
    const results = await Promise.all(
      cases.map(c => runOne(c.fundId, c.payload))
    );
    
    // Create results directory
    await fs.mkdir('./artifacts', { recursive: true });
    
    // Analyze results
    const passed = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);
    
    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      tolerance: TOL,
      total_cases: results.length,
      passed: passed.length,
      failed: failed.length,
      pass_rate: (passed.length / results.length * 100).toFixed(2) + '%',
      results: results.map(r => ({
        fundId: r.fundId,
        diff_percent: (r.diff * 100).toFixed(4) + '%',
        status: r.ok ? 'PASS' : 'FAIL',
        error: r.error,
        stable_total: r.oldTotal,
        canary_total: r.newTotal,
        absolute_diff: Math.abs(r.newTotal - r.oldTotal),
      })),
      failures: failed,
    };
    
    // Write detailed report
    await fs.writeFile(
      './artifacts/canary-diff.json',
      JSON.stringify(report, null, 2)
    );
    
    // Print summary
    console.log('');
    console.log('📊 Results Summary');
    console.log('==================');
    console.log(`Total cases: ${results.length}`);
    console.log(`Passed: ${passed.length} (${report.pass_rate})`);
    console.log(`Failed: ${failed.length}`);
    
    if (failed.length > 0) {
      console.log('');
      console.log('❌ Failed Cases:');
      failed.forEach(f => {
        console.log(`  - ${f.fundId}: ${(f.diff * 100).toFixed(4)}% difference`);
        if (f.error) console.log(`    Error: ${f.error}`);
        if (f.details) {
          console.log(`    Stable: ${f.oldTotal}`);
          console.log(`    Canary: ${f.newTotal}`);
        }
      });
      
      console.log('');
      console.error('❌ Canary diffs exceed tolerance');
      console.log('See artifacts/canary-diff.json for full details');
      process.exit(2);
    }
    
    console.log('');
    console.log('✅ All canary diffs within tolerance');
    console.log('Report saved to artifacts/canary-diff.json');
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
})();