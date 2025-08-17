import http from 'k6/http';
import { check, Trend } from 'k6';

const simulationTrend = new Trend('simulation_duration');

export const options = {
  stages: [
    { duration: '15s', target: 5 },
    { duration: '30s', target: 10 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<400'],
    http_req_failed: ['rate<0.01'],
    simulation_duration: ['p(95)<1000'],
  },
};

export default function () {
  const start = Date.now();
  const res = http.get('http://localhost:3000/health');
  simulationTrend.add(Date.now() - start);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'under budget': () => Date.now() - start < 1000,
  });
}
