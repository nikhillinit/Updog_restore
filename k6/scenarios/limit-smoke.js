/**
 * K6 smoke test for rate limiting and backpressure
 * Validates that rate limits are enforced correctly
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom metrics
const rateLimitErrors = new Rate('rate_limit_errors');
const backpressureErrors = new Rate('backpressure_errors');
const requestsBlocked = new Counter('requests_blocked');
const retryAfterValues = new Trend('retry_after_seconds');

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Warm up
    { duration: '1m', target: 50 },   // Test rate limits
    { duration: '30s', target: 100 }, // Test backpressure
    { duration: '30s', target: 0 },   // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    rate_limit_errors: ['rate>0'],    // Expect some rate limiting
    backpressure_errors: ['rate<0.1'], // Less than 10% backpressure errors
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

// Constants for test payloads (using explicit values for Codacy precision checks)
const FIFTY_MILLION = 50_000_000;

export default function () {
  // Test general API rate limiting (100 req/min)
  group('API Rate Limiting', () => {
    const res = http.get(`${BASE_URL}/api/v1/funds`, {
      headers: { 'Content-Type': 'application/json' },
    });

    const isRateLimited = res.status === 429;
    rateLimitErrors.add(isRateLimited);

    if (isRateLimited) {
      requestsBlocked.add(1);
      const retryAfter = res.headers['Retry-After'];
      if (retryAfter) {
        retryAfterValues.add(parseInt(retryAfter));
      }
    }

    check(res, {
      'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
      'has rate limit headers': (r) =>
        r.headers['RateLimit-Limit'] !== undefined ||
        r.headers['X-RateLimit-Limit'] !== undefined,
    });
  });

  // Test simulation rate limiting (10 req/hour)
  if (__VU <= 5) { // Only first 5 VUs test simulation endpoint
    group('Simulation Rate Limiting', () => {
      const simulationPayload = JSON.stringify({
        fundSize: FIFTY_MILLION,
        deploymentPeriod: 3,
        targetMultiple: 3.0,
        managementFee: 0.02,
        carryRate: 0.20,
      });
      
      const res = http.post(`${BASE_URL}/api/v1/simulations`, simulationPayload, {
        headers: { 'Content-Type': 'application/json' },
      });
      
      check(res, {
        'simulation status ok or rate limited': (r) => 
          r.status === 200 || r.status === 201 || r.status === 429,
        'has cost header when rate limited': (r) => 
          r.status !== 429 || r.headers['X-RateLimit-Cost'] !== undefined,
      });
      
      if (res.status === 429) {
        requestsBlocked.add(1);
      }
    });
  }
  
  // Test authentication rate limiting (5 req/5min)
  if (__VU % 10 === 0) { // Every 10th VU tests auth endpoint
    group('Auth Rate Limiting', () => {
      const authPayload = JSON.stringify({
        email: `user${__VU}@example.com`,
        password: 'testpassword123',
      });
      
      const res = http.post(`${BASE_URL}/api/v1/auth/login`, authPayload, {
        headers: { 'Content-Type': 'application/json' },
      });
      
      check(res, {
        'auth status ok or rate limited': (r) => 
          r.status === 200 || r.status === 401 || r.status === 429,
      });
      
      if (res.status === 429) {
        requestsBlocked.add(1);
      }
    });
  }
  
  // Test backpressure (503 responses under load)
  group('Backpressure Testing', () => {
    const res = http.get(`${BASE_URL}/api/v1/health/detailed`);
    
    const isBackpressure = res.status === 503;
    backpressureErrors.add(isBackpressure);
    
    check(res, {
      'status is 200 or 503': (r) => r.status === 200 || r.status === 503,
      'backpressure has retry header': (r) => 
        r.status !== 503 || r.headers['Retry-After'] !== undefined,
    });
    
    if (isBackpressure) {
      // Back off when server is under pressure
      sleep(5);
    }
  });
  
  // Test metrics endpoint (should not be rate limited with health key)
  if (__VU === 1) { // Only one VU tests metrics
    group('Metrics Endpoint', () => {
      const res = http.get(`${BASE_URL}/metrics/backpressure`, {
        headers: { 
          'X-Health-Key': __ENV.HEALTH_KEY || 'test-key',
        },
      });
      
      check(res, {
        'metrics accessible': (r) => r.status === 200,
        'has metrics data': (r) => {
          if (r.status !== 200) return false;
          const body = JSON.parse(r.body);
          return body.metrics !== undefined;
        },
      });
    });
  }
  
  // Vary sleep time based on VU to create different load patterns
  sleep(Math.random() * 0.5);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const { metrics } = data;
  
  let summary = '\n=== Rate Limiting Test Results ===\n\n';
  
  // Rate limit stats
  const rateLimitRate = metrics.rate_limit_errors?.values?.rate || 0;
  const backpressureRate = metrics.backpressure_errors?.values?.rate || 0;
  const totalBlocked = metrics.requests_blocked?.values?.count || 0;
  
  summary += `Rate Limited Requests: ${(rateLimitRate * 100).toFixed(2)}%\n`;
  summary += `Backpressure Errors: ${(backpressureRate * 100).toFixed(2)}%\n`;
  summary += `Total Requests Blocked: ${totalBlocked}\n`;
  
  // Response time stats
  const p95 = metrics.http_req_duration?.values?.['p(95)'] || 0;
  const p99 = metrics.http_req_duration?.values?.['p(99)'] || 0;
  
  summary += `\nResponse Times:\n`;
  summary += `  P95: ${p95.toFixed(2)}ms\n`;
  summary += `  P99: ${p99.toFixed(2)}ms\n`;
  
  // Retry after stats
  const avgRetryAfter = metrics.retry_after_seconds?.values?.avg || 0;
  if (avgRetryAfter > 0) {
    summary += `\nAverage Retry-After: ${avgRetryAfter.toFixed(0)} seconds\n`;
  }
  
  // Pass/Fail
  const passed = p95 < 500 && backpressureRate < 0.1;
  summary += `\n${passed ? '✅ PASSED' : '❌ FAILED'}\n`;
  
  return summary;
}