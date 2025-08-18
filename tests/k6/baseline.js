// k6 baseline: steady and near-saturation
import http from 'k6/http';
import { sleep, check } from 'k6';
export let options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 200 },
    { duration: '10m', target: 400 }, // adjust
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<300', 'p(99)<750'],
  },
};
export default function () {
  const url = `${__ENV.BASE_URL}/api/simulate`;
  const res = http.post(url, JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
  check(res, { 'status 200/422': r => r.status === 200 || r.status === 422 });
  sleep(0.1);
}
