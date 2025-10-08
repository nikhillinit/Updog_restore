import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Ramp up
    { duration: '1m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    errors: ['rate<0.1'],             // Error rate under 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000'; // eslint-disable-line no-undef

// Constants for test scenarios (using explicit values for Codacy precision checks)
const TEN_MILLION = 10_000_000;
const TWENTY_FIVE_MILLION = 25_000_000;
const FIVE_MILLION = 5_000_000;
const TWO_MILLION = 2_000_000;
const HALF_MILLION = 500_000;
const ONE_HUNDRED_THOUSAND = 100_000;
const FIFTY_THOUSAND = 50_000;

// Test payloads
const testInputs = [
  {
    availableReserves: TEN_MILLION,
    companies: [
      { id: 'c1', name: 'Startup A', stage: 'seed', invested: HALF_MILLION, ownership: 0.15 },
      { id: 'c2', name: 'Startup B', stage: 'series_a', invested: TWO_MILLION, ownership: 0.12 },
      { id: 'c3', name: 'Startup C', stage: 'preseed', invested: ONE_HUNDRED_THOUSAND, ownership: 0.20 },
    ],
    stagePolicies: [
      { stage: 'preseed', reserveMultiple: 3, weight: 1 },
      { stage: 'seed', reserveMultiple: 2.5, weight: 1.2 },
      { stage: 'series_a', reserveMultiple: 2, weight: 1.5 },
    ],
    constraints: {
      minCheck: FIFTY_THOUSAND,
      maxPerCompany: FIVE_MILLION,
      discountRateAnnual: 0.12
    }
  },
  {
    availableReserves: TWENTY_FIVE_MILLION,
    companies: Array.from({ length: 15 }, (_, i) => ({
      id: `comp_${i}`,
      name: `Company ${i}`,
      stage: ['preseed', 'seed', 'series_a', 'series_b'][i % 4],
      invested: Math.random() * FIVE_MILLION + ONE_HUNDRED_THOUSAND,
      ownership: Math.random() * 0.3 + 0.05,
    })),
    stagePolicies: [
      { stage: 'preseed', reserveMultiple: 4, weight: 0.8 },
      { stage: 'seed', reserveMultiple: 3, weight: 1 },
      { stage: 'series_a', reserveMultiple: 2.5, weight: 1.3 },
      { stage: 'series_b', reserveMultiple: 2, weight: 1.5 },
    ]
  }
];

export default function () {
  const payload = testInputs[Math.floor(Math.random() * testInputs.length)];
  
  const response = http.post(
    `${BASE_URL}/api/v1/reserves/calculate`,
    JSON.stringify(payload),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  const result = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'has allocations': (r) => {
      try {
        const data = JSON.parse(r.body);
        return Array.isArray(data.allocations);
      } catch {
        return false;
      }
    },
    'conservation check': (r) => {
      try {
        const data = JSON.parse(r.body);
        const totalIn = payload.availableReserves;
        const totalOut = data.totalAllocated + data.remaining;
        return Math.abs(totalIn - totalOut) < 0.01;
      } catch {
        return false;
      }
    }
  });

  errorRate.add(!result);
  sleep(1);
}