import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 100 },  // Peak load
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1900'], // 95% of requests under 1.9s
    'http_req_duration{scenario:timeline}': ['p(95)<1500'],
    'http_req_duration{scenario:state}': ['p(95)<500'],
    'errors': ['rate<0.01'], // Error rate under 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

// Test scenarios
export default function () {
  const fundId = Math.floor(Math.random() * 10) + 1; // Random fund 1-10
  const scenario = Math.random();
  
  if (scenario < 0.6) {
    // 60% - Timeline pagination test
    timelinePaginationTest(fundId);
  } else if (scenario < 0.85) {
    // 25% - Point-in-time state test
    pointInTimeStateTest(fundId);
  } else {
    // 15% - State comparison test
    stateComparisonTest(fundId);
  }
  
  sleep(Math.random() * 2 + 1); // Random think time 1-3s
}

function timelinePaginationTest(fundId) {
  const limit = 50;
  let offset = 0;
  let hasMore = true;
  
  // Simulate pagination through timeline
  while (hasMore && offset < 500) {
    const res = http.get(
      `${BASE_URL}/api/timeline/${fundId}?limit=${limit}&offset=${offset}`,
      { tags: { scenario: 'timeline' } }
    );
    
    const success = check(res, {
      'timeline status is 200': (r) => r.status === 200,
      'timeline has events': (r) => {
        const body = JSON.parse(r.body);
        return body.events && body.events.length > 0;
      },
      'timeline response time OK': (r) => r.timings.duration < 1500,
    });
    
    errorRate.add(!success);
    
    if (res.status === 200) {
      const body = JSON.parse(res.body);
      hasMore = body.pagination.hasMore;
      offset += limit;
      
      // Only paginate 20% of the time to simulate real usage
      if (Math.random() > 0.2) break;
    } else {
      break;
    }
  }
}

function pointInTimeStateTest(fundId) {
  // Random timestamp in the last 2 years
  const now = new Date();
  const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
  const randomTime = new Date(
    twoYearsAgo.getTime() + Math.random() * (now.getTime() - twoYearsAgo.getTime())
  );
  
  const res = http.get(
    `${BASE_URL}/api/timeline/${fundId}/state?timestamp=${randomTime.toISOString()}`,
    { tags: { scenario: 'state' } }
  );
  
  const success = check(res, {
    'state status is 200': (r) => r.status === 200,
    'state has snapshot': (r) => {
      const body = JSON.parse(r.body);
      return body.snapshot && body.state;
    },
    'state response time OK': (r) => r.timings.duration < 500,
  });
  
  errorRate.add(!success);
}

function stateComparisonTest(fundId) {
  const now = new Date();
  const timestamp1 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const timestamp2 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);  // 7 days ago
  
  const res = http.get(
    `${BASE_URL}/api/timeline/${fundId}/compare?` +
    `timestamp1=${timestamp1.toISOString()}&timestamp2=${timestamp2.toISOString()}`,
    { tags: { scenario: 'compare' } }
  );
  
  const success = check(res, {
    'compare status is 200': (r) => r.status === 200,
    'compare has differences': (r) => {
      const body = JSON.parse(r.body);
      return body.differences !== undefined;
    },
    'compare response time OK': (r) => r.timings.duration < 2000,
  });
  
  errorRate.add(!success);
}

// WebSocket connection test (separate scenario)
export function websocketTest() {
  // Note: k6 WebSocket support requires different approach
  // This would be implemented with k6/ws module
}