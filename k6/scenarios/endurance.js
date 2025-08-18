import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 25,
  duration: '2h',
  thresholds: {
    http_req_duration: ['p95<300', 'p99<1000'],
    http_req_failed: ['rate<0.01']
  }
};

export default function () {
  http.get(`${__ENV.BASE_URL}/ready`);
  sleep(1);
}
