// k6 soak: 2h at steady load (example 100 VUs)
import http from 'k6/http';
import { sleep } from 'k6';
export let options = { stages: [ { duration: '5m', target: 100 }, { duration: '115m', target: 100 }, { duration: '5m', target: 0 } ] };
export default function () {
  http.post(`${__ENV.BASE_URL}/api/simulate`, JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
  sleep(0.6);
}
