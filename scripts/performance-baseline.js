#!/usr/bin/env node

/**
 * Performance baseline capture script
 * Measures key metrics before and after demo infrastructure changes
 */

import { performance } from 'perf_hooks';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENDPOINTS = [
  { path: '/health', method: 'GET', name: 'Health Check' },
  { path: '/api/funds', method: 'GET', name: 'Funds API' },
  { path: '/api/stub-status', method: 'GET', name: 'Stub Status' },
];

const ITERATIONS = 10;
const RESULTS_DIR = path.join(__dirname, '..', 'performance-results');

async function measureEndpoint(endpoint, port = 5000) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    
    const options = {
      hostname: 'localhost',
      port,
      path: endpoint.path,
      method: endpoint.method,
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const end = performance.now();
        resolve({
          name: endpoint.name,
          path: endpoint.path,
          status: res.statusCode,
          latency: end - start,
          size: Buffer.byteLength(data),
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function captureBaseline() {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results = {
    timestamp,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage(),
    },
    endpoints: {},
  };

  console.log('📊 Capturing performance baseline...\n');

  for (const endpoint of ENDPOINTS) {
    const measurements = [];
    console.log(`Testing ${endpoint.name}...`);

    for (let i = 0; i < ITERATIONS; i++) {
      try {
        const result = await measureEndpoint(endpoint);
        measurements.push(result);
        process.stdout.write('.');
      } catch (error) {
        console.log(`\n  ⚠️ ${endpoint.name} failed: ${error.message}`);
        break;
      }
    }
    console.log('');

    if (measurements.length > 0) {
      const latencies = measurements.map(m => m.latency);
      results.endpoints[endpoint.path] = {
        name: endpoint.name,
        samples: measurements.length,
        latency: {
          min: Math.min(...latencies),
          max: Math.max(...latencies),
          avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          p50: latencies.sort()[Math.floor(latencies.length / 2)],
          p95: latencies.sort()[Math.floor(latencies.length * 0.95)],
        },
        status: measurements[0].status,
        size: measurements[0].size,
      };

      console.log(`  ✓ Avg: ${results.endpoints[endpoint.path].latency.avg.toFixed(2)}ms`);
      console.log(`  ✓ P95: ${results.endpoints[endpoint.path].latency.p95.toFixed(2)}ms\n`);
    }
  }

  // Memory usage after requests
  results.memoryAfter = process.memoryUsage();

  // Save results
  const filename = `baseline-${timestamp}.json`;
  const filepath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));

  console.log(`\n✅ Baseline captured: ${filepath}`);
  
  // Create a symlink to latest
  const latestPath = path.join(RESULTS_DIR, 'baseline-latest.json');
  if (fs.existsSync(latestPath)) {
    fs.unlinkSync(latestPath);
  }
  fs.copyFileSync(filepath, latestPath);

  return results;
}

// Compare two baselines
function compareBaselines(before, after) {
  console.log('\n📈 Performance Comparison:\n');
  
  for (const path in before.endpoints) {
    if (after.endpoints[path]) {
      const b = before.endpoints[path];
      const a = after.endpoints[path];
      const deltaAvg = a.latency.avg - b.latency.avg;
      const deltaP95 = a.latency.p95 - b.latency.p95;
      const pctChange = ((deltaAvg / b.latency.avg) * 100).toFixed(1);
      
      console.log(`${b.name}:`);
      console.log(`  Avg: ${b.latency.avg.toFixed(2)}ms → ${a.latency.avg.toFixed(2)}ms (${deltaAvg > 0 ? '+' : ''}${deltaAvg.toFixed(2)}ms, ${pctChange}%)`);
      console.log(`  P95: ${b.latency.p95.toFixed(2)}ms → ${a.latency.p95.toFixed(2)}ms (${deltaP95 > 0 ? '+' : ''}${deltaP95.toFixed(2)}ms)\n`);
      
      if (Math.abs(deltaAvg) > 50) {
        console.log(`  ⚠️ WARNING: Latency regression > 50ms detected!`);
      }
    }
  }

  // Memory comparison
  const memDelta = (after.memoryAfter.heapUsed - before.memoryAfter.heapUsed) / 1024 / 1024;
  console.log(`Memory Usage:`);
  console.log(`  Heap: ${(before.memoryAfter.heapUsed / 1024 / 1024).toFixed(2)}MB → ${(after.memoryAfter.heapUsed / 1024 / 1024).toFixed(2)}MB (${memDelta > 0 ? '+' : ''}${memDelta.toFixed(2)}MB)`);
  
  if (Math.abs(memDelta) > 10) {
    console.log(`  ⚠️ WARNING: Memory delta > 10MB detected!`);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args[0] === 'compare') {
  const beforePath = path.join(RESULTS_DIR, 'baseline-before.json');
  const afterPath = path.join(RESULTS_DIR, 'baseline-after.json');
  
  if (fs.existsSync(beforePath) && fs.existsSync(afterPath)) {
    const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
    const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
    compareBaselines(before, after);
  } else {
    console.error('Missing baseline files for comparison. Run capture first.');
    process.exit(1);
  }
} else {
  captureBaseline().catch(console.error);
}

export { captureBaseline, compareBaselines };