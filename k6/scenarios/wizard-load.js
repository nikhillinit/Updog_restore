import http from 'k6/http';
import { check, Rate } from 'k6';
export const wizard_completion = new Rate('wizard_completion');

export const options = {
  scenarios: {
    steady_state: { executor:'constant-arrival-rate', rate:100, timeUnit:'1s', duration:'10m', preAllocatedVUs:50 },
    spike: { executor:'ramping-arrival-rate', startRate:100, stages:[
      { target: 500, duration:'2m' },
      { target: 500, duration:'5m' },
      { target: 100, duration:'2m' }
    ] }
  },
  thresholds: {
    http_req_duration: ['p95<300', 'p99<1000'],
    http_req_failed: ['rate<0.01'],
    'wizard_completion': ['rate>0.80']
  }
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/wizard/health`);
  const ok = check(res, { 'status 200': (r) => r.status === 200 });
  wizard_completion.add(ok);
}
