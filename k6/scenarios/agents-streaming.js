/**
 * k6 Load Test for AI Agent Streaming
 *
 * Tests SSE streaming performance under concurrent load
 *
 * Run:
 *   k6 run k6/scenarios/agents-streaming.js
 *   k6 run --vus 20 --duration 30s k6/scenarios/agents-streaming.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const streamConnections = new Counter('ai_stream_connections_total');
const streamTTFB = new Trend('ai_stream_ttfb_ms');
const streamDuration = new Trend('ai_stream_duration_ms');

export const options = {
  stages: [
    { duration: '10s', target: 5 },   // Ramp up to 5 VUs
    { duration: '20s', target: 20 },  // Ramp up to 20 VUs
    { duration: '10s', target: 0 },   // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<3000'], // 95% of requests under 3s
    'ai_stream_ttfb_ms': ['p(95)<2000'], // TTFB under 2s
  },
};

export default function () {
  const runId = `test-${__VU}-${Date.now()}`;
  const url = `http://localhost:5000/api/agents/stream/${runId}`;

  const startTime = Date.now();

  const res = http.get(url, {
    tags: { name: 'agent-stream' },
    timeout: '30s',
  });

  const duration = Date.now() - startTime;

  // Checks
  check(res, {
    'status is 200': (r) => r.status === 200,
    'content-type is text/event-stream': (r) =>
      r.headers['Content-Type']?.includes('text/event-stream'),
    'response has keepalive': (r) => r.body.includes('keepalive'),
  });

  // Record metrics
  streamConnections.add(1);
  streamTTFB.add(res.timings.waiting);
  streamDuration.add(duration);

  // NOTE: k6 doesn't keep SSE connections open
  // For full SSE testing, consider xk6-sse extension
  // This is a sanity probe to verify endpoint health

  sleep(1);
}

// Setup function (runs once)
export function setup() {
  console.log('Starting AI agent streaming load test...');
  console.log('Target: http://localhost:5000/api/agents/stream/:runId');

  // Verify server is up
  const healthCheck = http.get('http://localhost:5000/api/healthz');
  if (healthCheck.status !== 200) {
    throw new Error('Server health check failed');
  }
}

// Teardown function (runs once)
export function teardown(data) {
  console.log('Load test complete');
}
