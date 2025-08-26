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

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

// Test payloads
const testInputs = [
  {
    availableReserves: 10000000,
    companies: [
      { id: 'c1', name: 'Startup A', stage: 'seed', invested: 500000, ownership: 0.15 },
      { id: 'c2', name: 'Startup B', stage: 'series_a', invested: 2000000, ownership: 0.12 },
      { id: 'c3', name: 'Startup C', stage: 'preseed', invested: 100000, ownership: 0.20 },
    ],
    stagePolicies: [
      { stage: 'preseed', reserveMultiple: 3, weight: 1 },
      { stage: 'seed', reserveMultiple: 2.5, weight: 1.2 },
      { stage: 'series_a', reserveMultiple: 2, weight: 1.5 },
    ],
    constraints: {
      minCheck: 50000,
      maxPerCompany: 5000000,
      discountRateAnnual: 0.12
    }
  },
  {
    availableReserves: 25000000,
    companies: Array.from({ length: 15 }, (_, i) => ({
      id: `comp_${i}`,
      name: `Company ${i}`,
      stage: ['preseed', 'seed', 'series_a', 'series_b'][i % 4],
      invested: Math.random() * 5000000 + 100000,
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