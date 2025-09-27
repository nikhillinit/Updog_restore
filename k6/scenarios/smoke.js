import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 5 },   // Ramp up to 5 users
    { duration: '1m', target: 5 },    // Stay at 5 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests under 1s
    http_req_failed: ['rate<0.1'],     // Error rate under 10%
    http_req_waiting: ['avg<500'],     // Average wait time under 500ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4173';

export default function() {
  // Test health endpoint
  let healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  // Test main page
  let mainRes = http.get(`${BASE_URL}/`);
  check(mainRes, {
    'main page loads': (r) => r.status === 200,
    'main page has content': (r) => r.body && r.body.length > 1000,
  });
  
  // Test API endpoints (if available)
  let apiEndpoints = [
    '/api/funds',
    '/api/investments',
    '/api/portfolio',
  ];
  
  for (let endpoint of apiEndpoints) {
    let res = http.get(`${BASE_URL}${endpoint}`, {
      headers: { 'Accept': 'application/json' },
    });
    check(res, {
      [`${endpoint} responds`]: (r) => r.status < 500,
    });
  }
  
  sleep(1);
}

export function handleSummary(data) {
  return {
    'perf/smoke-summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// Helper function for text summary
function textSummary(data, options) {
  const { metrics } = data;
  let summary = '\n=== Performance Smoke Test Results ===\n\n';
  
  if (metrics) {
    if (metrics.http_req_duration) {
      summary += `Response Time (p95): ${metrics.http_req_duration.values['p(95)']}ms\n`;
      summary += `Response Time (avg): ${metrics.http_req_duration.values.avg}ms\n`;
    }
    if (metrics.http_req_failed) {
      summary += `Error Rate: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
    }
    if (metrics.http_reqs) {
      summary += `Total Requests: ${metrics.http_reqs.values.count}\n`;
      summary += `Requests/sec: ${metrics.http_reqs.values.rate.toFixed(2)}\n`;
    }
  }
  
  return summary;
}