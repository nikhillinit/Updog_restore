// k6-baseline.js
// Baseline load test with thresholds and async operations polling.
// Usage:
//   k6 run -e BASE_URL=https://staging.yourdomain.com \
//          -e METRICS_KEY=$METRICS_KEY \
//          -e HEALTH_KEY=$HEALTH_KEY \
//          -e FUND_SIZE=100000000 \
//          -e RATE=5 -e DURATION=2m -e VUS=20 k6-baseline.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL   = __ENV.BASE_URL || 'http://localhost:5000';
const METRICS_KEY = __ENV.METRICS_KEY || '';
const HEALTH_KEY  = __ENV.HEALTH_KEY || '';
const FUND_SIZE   = Number(__ENV.FUND_SIZE || '100000000');

const RATE      = Number(__ENV.RATE || '5');      // requests/sec for calc
const DURATION  = __ENV.DURATION || '2m';
const VUS       = Number(__ENV.VUS || '10');

export const options = {
  scenarios: {
    calc: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: VUS,
      maxVUs: Math.max(VUS, RATE * 2),
      exec: 'calc',
      tags: { scenario: 'calc' },
    },
    health: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 1,
      maxVUs: 2,
      exec: 'health',
      tags: { scenario: 'health' },
    },
    metricsCheck: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      exec: 'metricsCheck',
      tags: { scenario: 'metrics' },
    },
  },
  thresholds: {
    // Error budget and latency goals (adjust to your SLOs)
    'http_req_failed{scenario:calc}': ['rate<0.01'],         // <1% errors
    'http_req_duration{scenario:calc}': ['p(95)<500'],       // p95 < 500ms
    'calc_e2e_ms': ['p(95)<1500'],                           // async end-to-end under 1.5s typical
    'calc_failed': ['rate<0.02'],                            // <2% calc failures
  },
};

const calcE2E = new Trend('calc_e2e_ms');
const opsPolls = new Trend('ops_polls');
const pollWait = new Trend('ops_poll_wait_ms');
const calcFailed = new Rate('calc_failed');

function headers(extra) {
  const h = { 'Content-Type': 'application/json' };

  if (extra && typeof extra === 'object') {
    for (const key of Object.keys(extra)) {
      h[key] = extra[key];
    }
  }

  return h;
}

export function health() {
  // Liveness
  const r1 = http.get(`${BASE_URL}/healthz`);
  check(r1, { 'healthz 200': (r) => r.status === 200 });

  // Readiness (unauth = minimal)
  const r2 = http.get(`${BASE_URL}/readyz`);
  check(r2, { 'readyz ok/503': (r) => r.status === 200 || r.status === 503 });

  // Readiness (auth = detailed)
  if (HEALTH_KEY) {
    const r3 = http.get(`${BASE_URL}/readyz`, {
      headers: { 'X-Health-Key': HEALTH_KEY },
    });
    check(r3, {
      'readyz detailed 200/503': (r) => r.status === 200 || r.status === 503,
    });
  }
}

export function metricsCheck() {
  if (!METRICS_KEY) {
    // Skip if no token; not a failure for baseline
    return;
  }
  const r = http.get(`${BASE_URL}/metrics`, {
    headers: { Authorization: `Bearer ${METRICS_KEY}` },
  });
  check(r, {
    '/metrics authorized': (resp) => resp.status === 200 && resp.body && resp.body.includes('http_requests_total'),
  });
}

// Poll the operations endpoint until success/failure or timeout
function pollOperation(location, maxPolls = 30) {
  let polls = 0;
  let finalOK = false;
  let waitMs = 0;

  while (polls < maxPolls) {
    const resp = http.get(location, { headers: headers() });
    polls += 1;

    if (resp.status === 200 || resp.status === 202) {
      try {
        const data = resp.json();
        // Accept multiple status shapes
        const s = (data.status || '').toString().toLowerCase();
        if (/(succeed|success|complete|done)/.test(s)) {
          finalOK = true;
          break;
        }
        if (/(fail|error|cancel)/.test(s)) {
          finalOK = false;
          break;
        }
      } catch (_) {
        // if body isn't JSON but 200, treat as success
        if (resp.status === 200) {
          finalOK = true;
          break;
        }
      }
    }

    // Respect Retry-After if provided
    const retryAfter = Number(resp.headers['Retry-After'] || resp.headers['retry-after'] || 0);
    const sleepSec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1;
    const sleepMs = sleepSec * 1000;
    waitMs += sleepMs;
    sleep(sleepSec);
  }

  opsPolls.add(polls);
  pollWait.add(waitMs);
  return finalOK;
}

export function calc() {
  const start = Date.now();

  const payload = JSON.stringify({
    availableReserves: FUND_SIZE,
    companies: [
      {
        id: 'k6-seed-1',
        name: 'SeedCo',
        stage: 'seed',
        invested: Math.floor(FUND_SIZE * 0.15),
        ownership: 0.12,
      },
      {
        id: 'k6-series-a-1',
        name: 'SeriesACo',
        stage: 'series_a',
        invested: Math.floor(FUND_SIZE * 0.25),
        ownership: 0.1,
      },
      {
        id: 'k6-preseed-1',
        name: 'PreseedCo',
        stage: 'preseed',
        invested: Math.floor(FUND_SIZE * 0.1),
        ownership: 0.18,
      },
    ],
    stagePolicies: [
      { stage: 'preseed', reserveMultiple: 3, weight: 1 },
      { stage: 'seed', reserveMultiple: 2.5, weight: 1.2 },
      { stage: 'series_a', reserveMultiple: 2, weight: 1.4 },
    ],
    constraints: {
      minCheck: Math.max(Math.floor(FUND_SIZE * 0.001), 1),
      maxPerCompany: Math.floor(FUND_SIZE * 0.5),
      discountRateAnnual: 0.12,
    },
  });
  const res = http.post(`${BASE_URL}/api/v1/reserves/calculate`, payload, { headers: headers() });

  const accepted = res.status === 202 && !!res.headers.Location;
  const immediateOk = res.status === 200;
  check(res, {
    'calculate 200/202': () => immediateOk || accepted,
  });

  let success = false;
  if (accepted) {
    const loc = res.headers.Location;
    success = pollOperation(loc);
  } else if (immediateOk) {
    try {
      const data = res.json();
      const hasAllocations = Array.isArray(data.allocations);
      const hasNumbers = Number.isFinite(data.totalAllocated) && Number.isFinite(data.remaining);
      const conservationOk = hasNumbers && Math.abs(FUND_SIZE - (data.totalAllocated + data.remaining)) < 0.01;
      success = hasAllocations && hasNumbers && conservationOk;
    } catch (_) {
      success = false;
    }
  }

  calcE2E.add(Date.now() - start);
  calcFailed.add(!success);

  check(null, { 'calc succeeded': () => success });
}
