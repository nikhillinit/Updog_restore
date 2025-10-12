import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Perf Smoke
 * ----------
 * Fails the job if p95 exceeds 500ms or error rate >= 1%.
 * Targets your real endpoints on :3001.
 */
export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    'http_req_duration{endpoint:reserves_calculate}': ['p(95)<500'],
    'http_req_failed': ['rate<0.01']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  // Reserve calculation endpoint
  const reservesRes = http.post(
    `${BASE_URL}/api/v1/reserves/calculate`,
    JSON.stringify({
      companies: [
        { id: 'test-1', initialCheckCents: 1_000_000, stage: 'seed' },
        { id: 'test-2', initialCheckCents: 2_000_000, stage: 'series-a' }
      ],
      availableBudgetCents: 10_000_000,
      policy: { kind: 'fixed', params: { percentage: 0.4 } }
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'reserves_calculate' }
    }
  );

  check(reservesRes, {
    'status 200': (r) => r.status === 200,
  });

  sleep(1);
}
