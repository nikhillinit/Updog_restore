// k6-chaos.js
// Chaos-time monitor: drive traffic and watch for breaker signals.
// Usage:
//   k6 run -e BASE_URL=https://staging... -e METRICS_KEY=$METRICS_KEY \
//          -e FUND_SIZE=100000000 -e RATE=3 -e DURATION=5m k6-chaos.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL   = __ENV.BASE_URL || 'http://localhost:5000';
const METRICS_KEY = __ENV.METRICS_KEY || '';
const FUND_SIZE   = Number(__ENV.FUND_SIZE || '100000000');
const RATE        = Number(__ENV.RATE || '3');
const DURATION    = __ENV.DURATION || '5m';

export const options = {
  scenarios: {
    calc: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(6, RATE * 2),
      maxVUs: Math.max(10, RATE * 3),
      exec: 'calc',
      tags: { scenario: 'chaos-calc' },
    },
    metricsProbe: {
      executor: 'constant-vus',
      vus: METRICS_KEY ? 1 : 0, // only probe metrics if we have a token
      duration: DURATION,
      exec: 'metricsProbe',
      tags: { scenario: 'metrics-probe' },
    },
  },
  thresholds: {
    'http_req_failed{scenario:chaos-calc}': ['rate<0.05'], // allow some failure during chaos
  },
};

const breakerOpen = new Rate('breaker_open');

export function calc() {
  const payload = JSON.stringify({ fundSize: FUND_SIZE });
  const res = http.post(`${BASE_URL}/api/funds/calculate`, payload, { 
    headers: { 'Content-Type': 'application/json' },
    timeout: '5s',
  });
  const ok = res.status === 202 || res.status === 200;
  check(res, { 'calc accepted or ok': () => ok });
  // We do not poll here to keep constant pressure; baseline test does the full E2E
}

export function metricsProbe() {
  if (!METRICS_KEY) {
    sleep(2);
    return;
  }
  const r = http.get(`${BASE_URL}/metrics`, {
    headers: { Authorization: `Bearer ${METRICS_KEY}` },
    timeout: '5s',
  });

  if (r.status !== 200) {
    // Treat as potential outage in probe context
    breakerOpen.add(1);
    sleep(2);
    return;
  }

  // crude regex checks on Prometheus exposition format
  const body = r.body || '';
  // Look for circuit_breaker_state{component="redis"} 1
  const match = body.match(/circuit_breaker_state\{[^}]*component="redis"[^}]*\}\s+(\d+)/);
  if (match) {
    const val = Number(match[1]);
    breakerOpen.add(val >= 1 ? 1 : 0);
  }
  sleep(2);
}