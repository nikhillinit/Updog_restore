// k6 stress: find saturation
import http from 'k6/http';
import { sleep } from 'k6';
export let options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '1m', target: 300 },
    { duration: '1m', target: 400 },
    { duration: '1m', target: 500 },
    { duration: '1m', target: 0 },
  ],
};
export default function () {
  http.post(`${__ENV.BASE_URL}/api/simulate`, JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
  sleep(0.05);
}
